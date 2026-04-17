"""
Widget generation agent: takes a user prompt and produces validated dashboard tile specs.

Flow:
1. LLM is given read-only data tools (list_sifts, get_sift, aggregate_sift, find_records)
   so it can explore the schema and even test candidate pipelines against real data.
2. When ready, LLM calls the terminal tool `propose_widgets` with the final list of
   tile specs. The loop ends and those specs are returned for insertion into the dashboard.
"""
import json
from dataclasses import dataclass, field
from typing import Any, Optional

import litellm
import structlog

from ..config import config
from .agent_tools import AGENT_TOOL_SCHEMAS, AgentToolRunner, ToolCallTrace

logger = structlog.get_logger()

MAX_ITERATIONS = 8

_PROPOSE_TOOL = {
    "type": "function",
    "function": {
        "name": "propose_widgets",
        "description": (
            "Terminal tool. Call this once you have decided on the final dashboard widgets. "
            "Provide 3-6 widgets that together answer the user's prompt. "
            "Each pipeline you submit here should already have been validated with aggregate_sift."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "widgets": {
                    "type": "array",
                    "description": "3-6 widget specs covering the user's request with complementary angles.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sift_id": {
                                "type": "string",
                                "description": "ID of the sift this widget queries.",
                            },
                            "kind": {
                                "type": "string",
                                "enum": ["kpi", "table", "bar_chart", "line_chart"],
                                "description": (
                                    "kpi → single number. table → raw rows. "
                                    "bar_chart → categorical breakdown. line_chart → time series."
                                ),
                            },
                            "title": {
                                "type": "string",
                                "description": "Short descriptive title (<= 40 chars).",
                            },
                            "pipeline": {
                                "type": "array",
                                "items": {"type": "object"},
                                "description": (
                                    "MongoDB aggregation pipeline. Reference extracted fields as "
                                    "$extracted_data.<field>. Do NOT include sift_id match — injected automatically."
                                ),
                            },
                            "chart_x": {
                                "type": "string",
                                "description": "Key in result rows for X axis (charts only). Usually '_id'.",
                            },
                            "chart_y": {
                                "type": "string",
                                "description": "Key in result rows for Y axis (charts only).",
                            },
                        },
                        "required": ["sift_id", "kind", "title", "pipeline"],
                    },
                }
            },
            "required": ["widgets"],
        },
    },
}

_WIDGET_TOOLS = AGENT_TOOL_SCHEMAS + [_PROPOSE_TOOL]


_SYSTEM_PROMPT = """You are a dashboard designer. Given a user's natural-language request, you build a small set (3-6) of complementary widgets that together answer it.

## Your process

1. Call `list_sifts` if you don't yet know what data is available.
2. Call `get_sift` on relevant sifts to discover their `schema_fields` — these are the fields available under `$extracted_data.<field>` in pipelines.
3. For each widget idea, prototype its pipeline using `aggregate_sift` to make sure it returns useful results. Fix it if it returns nothing or an error.
4. When satisfied, call `propose_widgets` ONCE with the final list. This ends the loop.

## Widget design rules

- Each widget's `pipeline` runs on `sift_results`. The `sift_id` filter is injected automatically — never include `$match` on `sift_id`.
- Always reference extracted fields as `$extracted_data.<fieldname>` (example: `"$sum": "$extracted_data.amount"`).
- KPI: `[{"$group": {"_id": null, "value": {...}}}]`. Result shape must have a `value` key.
- Bar chart: group by a category field and surface a metric. Set `chart_x="_id"` and `chart_y` to your metric key.
- Line chart: group by a date (use `{"$substr": ["$extracted_data.date", 0, 7]}` for month), sort by `_id` asc.
- Table: keep pipeline small (sort/limit) so only the most relevant rows show.

## Output quality

- Favour variety: mix KPIs, charts and tables. Don't produce four similar bar charts.
- If the user mentions a specific sift or topic, focus widgets there. If ambiguous, pick the most relevant sift yourself.
- Titles must be concise and human — "Revenue by client" not "Group by client sum amount".
- If the data cannot answer the prompt at all, call `propose_widgets` with an empty list and explain in your next turn.
"""


@dataclass
class WidgetAgentResult:
    widgets: list[dict]
    trace: list[ToolCallTrace] = field(default_factory=list)


async def generate_widgets(
    prompt: str,
    sift_hint: Optional[str],
    db,
) -> WidgetAgentResult:
    runner = AgentToolRunner(db)
    trace: list[ToolCallTrace] = []

    system = _SYSTEM_PROMPT
    if sift_hint:
        system += f"\n\n## Hint\nThe user is focused on sift `{sift_hint}`. Prefer it unless the prompt says otherwise."

    messages: list[dict] = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt.strip() or "Build a useful overview dashboard."},
    ]

    for _ in range(MAX_ITERATIONS):
        response = await litellm.acompletion(
            model=config.dashboard_model,
            messages=messages,
            tools=_WIDGET_TOOLS,
            tool_choice="auto",
            temperature=0.3,
            api_key=config.llm_api_key or None,
        )

        msg = response.choices[0].message
        msg_dict: dict = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            msg_dict["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        messages.append(msg_dict)

        if not msg.tool_calls:
            logger.warning("widget_agent_no_tool_call", content=(msg.content or "")[:200])
            return WidgetAgentResult(widgets=[], trace=trace)

        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            if name == "propose_widgets":
                widgets = _sanitize_widgets(args.get("widgets", []))
                return WidgetAgentResult(widgets=widgets, trace=trace)

            try:
                result, call_trace = await runner.call(name, args)
                trace.append(call_trace)
            except Exception as e:
                logger.warning("widget_agent_tool_error", tool=name, error=str(e))
                result = {"error": str(e)}

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str)[:8000],
            })

    logger.warning("widget_agent_max_iterations")
    return WidgetAgentResult(widgets=[], trace=trace)


def _sanitize_widgets(raw: list) -> list[dict]:
    """Keep only well-formed tile specs."""
    out: list[dict] = []
    for w in raw[:6]:
        if not isinstance(w, dict):
            continue
        if not all(k in w for k in ("sift_id", "kind", "title", "pipeline")):
            continue
        if w["kind"] not in ("kpi", "table", "bar_chart", "line_chart"):
            continue
        if not isinstance(w["pipeline"], list):
            continue
        out.append({
            "sift_id": str(w["sift_id"]),
            "kind": w["kind"],
            "title": str(w["title"])[:80],
            "pipeline": w["pipeline"],
            "chart_x": w.get("chart_x"),
            "chart_y": w.get("chart_y"),
        })
    return out
