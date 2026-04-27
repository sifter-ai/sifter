"""
Unit tests for widget_agent — LLM and AgentToolRunner are mocked.
Focuses on _sanitize_widgets, _describe_rejections, _infer_sift_id_from_trace,
and the generate_widgets happy path.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sifter.services.widget_agent import (
    WidgetAgentResult,
    _describe_rejections,
    _infer_sift_id_from_trace,
    _sanitize_widgets,
    generate_widgets,
)
from sifter.services.agent_tools import ToolCallTrace


# ── _sanitize_widgets ─────────────────────────────────────────────────────────

def _valid_widget(**overrides):
    w = {
        "sift_id": "sift1",
        "kind": "kpi",
        "title": "Total Revenue",
        "pipeline": [{"$group": {"_id": None, "value": {"$sum": "$extracted_data.amount"}}}],
    }
    w.update(overrides)
    return w


def test_sanitize_accepts_valid_widget():
    result = _sanitize_widgets([_valid_widget()])
    assert len(result) == 1
    assert result[0]["kind"] == "kpi"


def test_sanitize_all_valid_kinds():
    for kind in ("kpi", "table", "bar_chart", "line_chart"):
        result = _sanitize_widgets([_valid_widget(kind=kind)])
        assert result[0]["kind"] == kind


def test_sanitize_kind_aliases():
    aliases = {
        "bar": "bar_chart",
        "line": "line_chart",
        "number": "kpi",
        "metric": "kpi",
        "stat": "kpi",
        "pie_chart": "bar_chart",
        "pie": "bar_chart",
        "chart": "bar_chart",
    }
    for alias, expected in aliases.items():
        result = _sanitize_widgets([_valid_widget(kind=alias)])
        assert result[0]["kind"] == expected, f"{alias} → {expected}"


def test_sanitize_rejects_invalid_kind():
    result = _sanitize_widgets([_valid_widget(kind="heatmap")])
    assert result == []


def test_sanitize_rejects_missing_pipeline():
    w = _valid_widget()
    del w["pipeline"]
    result = _sanitize_widgets([w])
    assert result == []


def test_sanitize_rejects_pipeline_not_list():
    result = _sanitize_widgets([_valid_widget(pipeline="not a list")])
    assert result == []


def test_sanitize_rejects_missing_title():
    w = _valid_widget()
    del w["title"]
    result = _sanitize_widgets([w])
    assert result == []


def test_sanitize_rejects_non_dict():
    result = _sanitize_widgets(["not a dict"])
    assert result == []


def test_sanitize_missing_sift_id_with_fallback():
    w = _valid_widget()
    del w["sift_id"]
    result = _sanitize_widgets([w], fallback_sift_id="fallback_sift")
    assert result[0]["sift_id"] == "fallback_sift"


def test_sanitize_missing_sift_id_without_fallback():
    w = _valid_widget()
    del w["sift_id"]
    result = _sanitize_widgets([w], fallback_sift_id=None)
    assert result == []


def test_sanitize_title_truncated_at_80():
    long_title = "A" * 100
    result = _sanitize_widgets([_valid_widget(title=long_title)])
    assert len(result[0]["title"]) == 80


def test_sanitize_max_six_widgets():
    widgets = [_valid_widget(title=f"Widget {i}") for i in range(10)]
    result = _sanitize_widgets(widgets)
    assert len(result) <= 6


def test_sanitize_preserves_chart_axes():
    w = _valid_widget(kind="bar_chart", chart_x="_id", chart_y="total")
    result = _sanitize_widgets([w])
    assert result[0]["chart_x"] == "_id"
    assert result[0]["chart_y"] == "total"


# ── _describe_rejections ──────────────────────────────────────────────────────

def test_describe_rejections_missing_pipeline():
    w = _valid_widget()
    del w["pipeline"]
    issues = _describe_rejections([w], fallback_sift_id=None)
    assert any("pipeline" in issue for issue in issues)


def test_describe_rejections_missing_sift_id():
    w = _valid_widget()
    del w["sift_id"]
    issues = _describe_rejections([w], fallback_sift_id=None)
    assert any("sift_id" in issue for issue in issues)


def test_describe_rejections_invalid_kind():
    issues = _describe_rejections([_valid_widget(kind="heatmap")], fallback_sift_id=None)
    assert any("kind" in issue for issue in issues)


def test_describe_rejections_non_dict():
    issues = _describe_rejections(["bad"], fallback_sift_id=None)
    assert any("not an object" in issue for issue in issues)


def test_describe_rejections_pipeline_not_list():
    issues = _describe_rejections([_valid_widget(pipeline={})], fallback_sift_id=None)
    assert any("list" in issue for issue in issues)


# ── _infer_sift_id_from_trace ─────────────────────────────────────────────────

def test_infer_sift_id_from_aggregate_call():
    trace = [ToolCallTrace(tool="aggregate_sift", args={"sift_id": "sift42"}, result={}, result_preview="", duration_ms=0)]
    assert _infer_sift_id_from_trace(trace) == "sift42"


def test_infer_sift_id_from_get_sift_call():
    trace = [ToolCallTrace(tool="get_sift", args={"sift_id": "siftABC"}, result={}, result_preview="", duration_ms=0)]
    assert _infer_sift_id_from_trace(trace) == "siftABC"


def test_infer_sift_id_returns_first():
    trace = [
        ToolCallTrace(tool="list_sifts", args={}, result={}, result_preview="", duration_ms=0),
        ToolCallTrace(tool="get_sift", args={"sift_id": "first"}, result={}, result_preview="", duration_ms=0),
        ToolCallTrace(tool="aggregate_sift", args={"sift_id": "second"}, result={}, result_preview="", duration_ms=0),
    ]
    assert _infer_sift_id_from_trace(trace) == "first"


def test_infer_sift_id_returns_none_when_no_trace():
    assert _infer_sift_id_from_trace([]) is None


def test_infer_sift_id_returns_none_when_no_relevant_tools():
    trace = [ToolCallTrace(tool="list_sifts", args={}, result={}, result_preview="", duration_ms=0)]
    assert _infer_sift_id_from_trace(trace) is None


# ── generate_widgets — happy path ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_widgets_propose_on_first_call(mock_motor_db):
    widget = _valid_widget()
    propose_args = json.dumps({"widgets": [widget]})

    tool_call = MagicMock()
    tool_call.id = "tc1"
    tool_call.function.name = "propose_widgets"
    tool_call.function.arguments = propose_args

    llm_msg = MagicMock()
    llm_msg.content = None
    llm_msg.tool_calls = [tool_call]

    llm_response = MagicMock()
    llm_response.choices = [MagicMock()]
    llm_response.choices[0].message = llm_msg

    with patch("sifter.services.widget_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.widget_agent.AgentToolRunner"):
        mock_llm.return_value = llm_response
        result = await generate_widgets("Show revenue overview", sift_hint="sift1", db=mock_motor_db)

    assert isinstance(result, WidgetAgentResult)
    assert len(result.widgets) == 1
    assert result.widgets[0]["kind"] == "kpi"


@pytest.mark.asyncio
async def test_generate_widgets_returns_empty_on_max_iterations(mock_motor_db):
    """When LLM never calls propose_widgets, returns empty result after MAX_ITERATIONS."""
    llm_msg = MagicMock()
    llm_msg.content = "I need more data."
    llm_msg.tool_calls = None  # no tool call → triggers retry message

    llm_response = MagicMock()
    llm_response.choices = [MagicMock()]
    llm_response.choices[0].message = llm_msg

    with patch("sifter.services.widget_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.widget_agent.AgentToolRunner"):
        mock_llm.return_value = llm_response
        result = await generate_widgets("Show data", sift_hint=None, db=mock_motor_db)

    assert result.widgets == []
