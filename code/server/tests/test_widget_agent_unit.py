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


# ── debug_llm logging (lines 142, 175) ───────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_widgets_debug_llm_logging(mock_motor_db):
    """debug_llm=True triggers LLM request/response logging (lines 142, 175)."""
    from unittest.mock import patch as _patch
    import sifter.services.widget_agent as wa_module

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

    mock_cfg = MagicMock()
    mock_cfg.debug_llm = True
    mock_cfg.dashboard_model = "openai/gpt-4o"

    with patch("sifter.services.widget_agent.config", mock_cfg), \
         patch("sifter.services.widget_agent.api_kwargs_for", return_value={}), \
         patch("sifter.services.widget_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.widget_agent.AgentToolRunner"):
        mock_llm.return_value = llm_response
        result = await generate_widgets("Show data", sift_hint=None, db=mock_motor_db)

    assert len(result.widgets) == 1


# ── invalid JSON in tool arguments (lines 204-205) ───────────────────────────

@pytest.mark.asyncio
async def test_generate_widgets_invalid_json_tool_args(mock_motor_db):
    """Tool call with invalid JSON arguments → args = {} (lines 204-205)."""
    widget = _valid_widget()
    propose_args = json.dumps({"widgets": [widget]})

    bad_tool_call = MagicMock()
    bad_tool_call.id = "tc0"
    bad_tool_call.function.name = "list_sifts"
    bad_tool_call.function.arguments = "INVALID JSON{"

    propose_tool_call = MagicMock()
    propose_tool_call.id = "tc1"
    propose_tool_call.function.name = "propose_widgets"
    propose_tool_call.function.arguments = propose_args

    msg_with_bad = MagicMock()
    msg_with_bad.content = None
    msg_with_bad.tool_calls = [bad_tool_call]

    msg_with_propose = MagicMock()
    msg_with_propose.content = None
    msg_with_propose.tool_calls = [propose_tool_call]

    resp_bad = MagicMock()
    resp_bad.choices = [MagicMock()]
    resp_bad.choices[0].message = msg_with_bad

    resp_propose = MagicMock()
    resp_propose.choices = [MagicMock()]
    resp_propose.choices[0].message = msg_with_propose

    mock_runner = MagicMock()
    mock_runner.call = AsyncMock(return_value=(
        [{"id": "s1", "name": "Invoices"}],
        MagicMock(tool="list_sifts", args={}, result_preview="1 items", duration_ms=1),
    ))

    with patch("sifter.services.widget_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.widget_agent.AgentToolRunner", return_value=mock_runner):
        mock_llm.side_effect = [resp_bad, resp_propose]
        result = await generate_widgets("Show data", sift_hint=None, db=mock_motor_db)

    assert len(result.widgets) == 1


# ── all widgets rejected — propose_retry path (lines 216-246) ────────────────

@pytest.mark.asyncio
async def test_generate_widgets_all_rejected_retry(mock_motor_db):
    """All proposed widgets fail validation → feedback sent and retry (lines 216-246)."""
    bad_widget = {"sift_id": "sift1", "kind": "heatmap", "title": "Bad"}
    good_widget = _valid_widget()

    bad_propose = json.dumps({"widgets": [bad_widget]})
    good_propose = json.dumps({"widgets": [good_widget]})

    tool_call_bad = MagicMock()
    tool_call_bad.id = "tc1"
    tool_call_bad.function.name = "propose_widgets"
    tool_call_bad.function.arguments = bad_propose

    tool_call_good = MagicMock()
    tool_call_good.id = "tc2"
    tool_call_good.function.name = "propose_widgets"
    tool_call_good.function.arguments = good_propose

    msg_bad = MagicMock()
    msg_bad.content = None
    msg_bad.tool_calls = [tool_call_bad]

    msg_good = MagicMock()
    msg_good.content = None
    msg_good.tool_calls = [tool_call_good]

    resp_bad = MagicMock()
    resp_bad.choices = [MagicMock()]
    resp_bad.choices[0].message = msg_bad

    resp_good = MagicMock()
    resp_good.choices = [MagicMock()]
    resp_good.choices[0].message = msg_good

    with patch("sifter.services.widget_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.widget_agent.AgentToolRunner"):
        mock_llm.side_effect = [resp_bad, resp_good]
        result = await generate_widgets("Show data", sift_hint="sift1", db=mock_motor_db)

    assert len(result.widgets) == 1
    assert result.widgets[0]["kind"] == "kpi"


# ── tool call exception swallowed (lines 235-237) ────────────────────────────

@pytest.mark.asyncio
async def test_generate_widgets_tool_error_swallowed(mock_motor_db):
    """Non-propose tool raises → error captured and loop continues (lines 235-237)."""
    widget = _valid_widget()
    propose_args = json.dumps({"widgets": [widget]})

    list_tool_call = MagicMock()
    list_tool_call.id = "tc0"
    list_tool_call.function.name = "list_sifts"
    list_tool_call.function.arguments = "{}"

    propose_tool_call = MagicMock()
    propose_tool_call.id = "tc1"
    propose_tool_call.function.name = "propose_widgets"
    propose_tool_call.function.arguments = propose_args

    msg_list = MagicMock()
    msg_list.content = None
    msg_list.tool_calls = [list_tool_call]

    msg_propose = MagicMock()
    msg_propose.content = None
    msg_propose.tool_calls = [propose_tool_call]

    resp_list = MagicMock()
    resp_list.choices = [MagicMock()]
    resp_list.choices[0].message = msg_list

    resp_propose = MagicMock()
    resp_propose.choices = [MagicMock()]
    resp_propose.choices[0].message = msg_propose

    mock_runner = MagicMock()
    mock_runner.call = AsyncMock(side_effect=RuntimeError("tool exploded"))

    with patch("sifter.services.widget_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.widget_agent.AgentToolRunner", return_value=mock_runner):
        mock_llm.side_effect = [resp_list, resp_propose]
        result = await generate_widgets("Show data", sift_hint=None, db=mock_motor_db)

    assert len(result.widgets) == 1
