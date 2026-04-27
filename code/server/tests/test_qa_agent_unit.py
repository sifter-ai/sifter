"""
Unit tests for qa_agent.chat — LiteLLM and AgentToolRunner are mocked.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sifter.services.qa_agent import chat, QAResponse


def _make_llm_response(content: str, tool_calls=None):
    msg = MagicMock()
    msg.content = content
    msg.tool_calls = tool_calls
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message = msg
    return resp


# ── chat — happy path: direct response ───────────────────────────────────────

@pytest.mark.asyncio
async def test_chat_direct_response(mock_motor_db):
    llm_resp = _make_llm_response("The total revenue is $1000.", tool_calls=None)

    with patch("sifter.services.qa_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.qa_agent.AgentToolRunner"):
        mock_llm.return_value = llm_resp
        result = await chat(None, "What is total revenue?", [], mock_motor_db)

    assert isinstance(result, QAResponse)
    assert "revenue" in result.response.lower()
    assert result.data is None


# ── chat — tool call then response ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_chat_tool_call_then_response(mock_motor_db):
    import json

    tool_call = MagicMock()
    tool_call.id = "tc1"
    tool_call.function.name = "list_sifts"
    tool_call.function.arguments = "{}"

    tool_resp = _make_llm_response(None, tool_calls=[tool_call])
    final_resp = _make_llm_response("You have 2 sifts.", tool_calls=None)

    mock_runner = MagicMock()
    mock_runner.call = AsyncMock(return_value=(
        [{"id": "s1", "name": "Invoices"}],
        MagicMock(tool="list_sifts", args={}, result_preview="1 items", duration_ms=5),
    ))

    with patch("sifter.services.qa_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.qa_agent.AgentToolRunner", return_value=mock_runner):
        mock_llm.side_effect = [tool_resp, final_resp]
        result = await chat(None, "How many sifts?", [], mock_motor_db)

    assert result.response == "You have 2 sifts."
    assert len(result.trace) == 1


# ── chat — with history and sift hint ────────────────────────────────────────

@pytest.mark.asyncio
async def test_chat_with_history(mock_motor_db):
    llm_resp = _make_llm_response("OK", tool_calls=None)
    history = [
        {"role": "user", "content": "previous question"},
        {"role": "assistant", "content": "previous answer"},
    ]

    with patch("sifter.services.qa_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.qa_agent.AgentToolRunner"):
        mock_llm.return_value = llm_resp
        result = await chat("sift1", "follow-up", history, mock_motor_db)

    assert result.response == "OK"
    # Verify the LLM received messages including history
    call_args = mock_llm.call_args
    messages = call_args.kwargs["messages"]
    assert any(m["content"] == "previous question" for m in messages)


# ── chat — tool error is swallowed ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_chat_tool_error_is_swallowed(mock_motor_db):
    tool_call = MagicMock()
    tool_call.id = "tc1"
    tool_call.function.name = "get_sift"
    tool_call.function.arguments = '{"sift_id": "bad"}'

    tool_resp = _make_llm_response(None, tool_calls=[tool_call])
    final_resp = _make_llm_response("Could not retrieve.", tool_calls=None)

    mock_runner = MagicMock()
    mock_runner.call = AsyncMock(side_effect=ValueError("not found"))

    with patch("sifter.services.qa_agent.litellm.acompletion", new_callable=AsyncMock) as mock_llm, \
         patch("sifter.services.qa_agent.AgentToolRunner", return_value=mock_runner):
        mock_llm.side_effect = [tool_resp, final_resp]
        result = await chat(None, "Show sift details", [], mock_motor_db)

    assert "Could not retrieve" in result.response
