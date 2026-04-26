"""
Q&A Agent: agentic chat loop with tool-calling.
Uses LiteLLM tool-calling to give the LLM access to sift query tools.
"""
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import litellm
import structlog

from ..config import config, api_kwargs_for
from .agent_tools import AGENT_TOOL_SCHEMAS, AgentToolRunner, ToolCallTrace

logger = structlog.get_logger()

_SYSTEM_PROMPT = """You are Sifter, an AI assistant that helps users explore and analyze their document data.

You have tools to query extracted records from documents (invoices, contracts, receipts, reports, etc.).

## Guidelines

- Call `list_sifts` first if you don't know which sift contains the relevant data.
- Use `query_sift` for most data questions — it translates natural language to queries automatically.
- Use `aggregate_sift` only when you need precise control over aggregation logic.
- Use `find_records` for structured filtering without a natural language roundtrip.
- You can call tools for multiple sifts in sequence to answer cross-sift questions.
- Provide a clear, concise summary of your findings. Include numbers with context (currency, units) when evident.
- If no data is found, say so clearly and suggest alternatives.
"""

MAX_ITERATIONS = 8


@dataclass
class QAResponse:
    response: str
    data: Optional[list[dict[str, Any]]]
    pipeline: Optional[list]
    trace: list[ToolCallTrace] = field(default_factory=list)


async def chat(
    extraction_id: Optional[str],
    message: str,
    history: list[dict],
    db,
    org_id: str = "default",
) -> QAResponse:
    runner = AgentToolRunner(db, org_id=org_id)
    trace: list[ToolCallTrace] = []

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    system_content = _SYSTEM_PROMPT + f"\n\nCurrent date and time: {now}"
    if extraction_id:
        system_content += f"\n\nThe user is currently viewing sift with ID: {extraction_id}. Prefer this sift when relevant."

    messages: list[dict] = [{"role": "system", "content": system_content}]
    for msg in history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    last_data: Optional[list] = None
    last_pipeline: Optional[list] = None

    for _ in range(MAX_ITERATIONS):
        response = await litellm.acompletion(
            model=config.chat_model,
            messages=messages,
            tools=AGENT_TOOL_SCHEMAS,
            tool_choice="auto",
            temperature=0.3,
            **api_kwargs_for("chat"),
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
            return QAResponse(
                response=msg.content or "",
                data=last_data,
                pipeline=last_pipeline,
                trace=trace,
            )

        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            logger.debug("agent_tool_call", tool=tc.function.name, args=args)

            try:
                result, call_trace = await runner.call(tc.function.name, args)
                trace.append(call_trace)
                if isinstance(result, dict) and "results" in result:
                    last_data = result["results"]
                    if "pipeline" in result:
                        last_pipeline = result["pipeline"]
            except Exception as e:
                logger.warning("agent_tool_error", tool=tc.function.name, error=str(e))
                result = {"error": str(e)}

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str),
            })

    # Exceeded max iterations — return last assistant content
    last_msg = next(
        (m for m in reversed(messages) if m["role"] == "assistant" and m.get("content")),
        None,
    )
    return QAResponse(
        response=(last_msg["content"] if last_msg else "I couldn't complete the analysis."),
        data=last_data,
        pipeline=last_pipeline,
        trace=trace,
    )
