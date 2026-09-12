"""
Model strings come from the environment, where they are easy to mistype.

A stray leading space or a missing provider prefix used to surface only as a
LiteLLM "LLM Provider NOT provided" error on every single document.
"""
import logging

from sifter.config import SifterConfig


def test_surrounding_whitespace_is_stripped():
    config = SifterConfig(default_model=" fireworks_ai/accounts/fireworks/models/x \n")
    assert config.default_model == "fireworks_ai/accounts/fireworks/models/x"


def test_whitespace_is_stripped_on_task_models():
    config = SifterConfig(extractor_model="  gemini/gemini-2.5-flash")
    assert config.extractor_model == "gemini/gemini-2.5-flash"


def test_missing_provider_prefix_is_reported(caplog):
    with caplog.at_level(logging.WARNING, logger="sifter.config"):
        SifterConfig(default_model="deepseek-v4p1-flash")
    assert any("no LiteLLM provider prefix" in r.getMessage() for r in caplog.records)


def test_a_valid_model_string_is_quiet(caplog):
    with caplog.at_level(logging.WARNING, logger="sifter.config"):
        SifterConfig(default_model="fireworks_ai/accounts/fireworks/models/deepseek-v4p1-flash")
    assert not [r for r in caplog.records if "provider prefix" in r.getMessage()]
