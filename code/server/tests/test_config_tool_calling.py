"""
LiteLLM gates `tools`/`tool_choice` on a static capability map, not on the endpoint.
Most fireworks_ai entries carry no `supports_tool_choice` and new models are missing
from the map altogether, so an agent call used to die with

    UnsupportedParamsError: fireworks_ai does not support parameters: ['tool_choice']

before a request was ever sent. `allowed_openai_params` forwards them anyway.
"""
import pytest

from sifter.config import TOOL_CALLING_PARAMS, api_kwargs_for, config, tool_calling_kwargs


@pytest.fixture
def fireworks_chat(monkeypatch):
    monkeypatch.setattr(config, "chat_model", "fireworks_ai/accounts/fireworks/models/qwen3p8-2p4t-a95b")
    monkeypatch.setattr(config, "chat_api_key", "fw-key")
    monkeypatch.setattr(config, "chat_base_url", "https://api.fireworks.ai/inference/v1")


def test_tool_calling_allows_tools_and_tool_choice(fireworks_chat):
    kwargs = api_kwargs_for("chat", tool_calling=True)
    assert kwargs["allowed_openai_params"] == ["tools", "tool_choice"]
    assert kwargs["api_key"] == "fw-key"
    assert kwargs["api_base"] == "https://api.fireworks.ai/inference/v1"


def test_plain_calls_do_not_set_allowed_params(fireworks_chat):
    assert "allowed_openai_params" not in api_kwargs_for("chat")


def test_native_credential_models_still_get_allowed_params(monkeypatch):
    # vertex_ai/gemini authenticate through the environment, so no api_key is passed —
    # the capability map still gates tool_choice, so the escape hatch must survive.
    monkeypatch.setattr(config, "dashboard_model", "vertex_ai/gemini-2.5-flash")
    kwargs = api_kwargs_for("dashboard", tool_calling=True)
    assert kwargs == {"allowed_openai_params": ["tools", "tool_choice"]}


def test_callers_cannot_mutate_the_shared_list(fireworks_chat):
    api_kwargs_for("chat", tool_calling=True)["allowed_openai_params"].append("junk")
    tool_calling_kwargs()["allowed_openai_params"].clear()
    assert TOOL_CALLING_PARAMS == ["tools", "tool_choice"]
