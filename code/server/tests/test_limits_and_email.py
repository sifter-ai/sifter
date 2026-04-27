"""
Unit tests for limits.py and email.py — pure classes, no external dependencies.
"""
import pytest
from unittest.mock import patch

from sifter.services.limits import NoopLimiter, get_usage_limiter, set_global_limiter
from sifter.services.email import NoopEmailSender, get_email_sender


# ── NoopLimiter ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_noop_limiter_check_extraction():
    lim = NoopLimiter()
    await lim.check_extraction("org1")  # must not raise


@pytest.mark.asyncio
async def test_noop_limiter_check_sift_create():
    lim = NoopLimiter()
    await lim.check_sift_create("org1")


@pytest.mark.asyncio
async def test_noop_limiter_check_org_create():
    lim = NoopLimiter()
    await lim.check_org_create("user1")


@pytest.mark.asyncio
async def test_noop_limiter_record_processed():
    lim = NoopLimiter()
    await lim.record_processed("org1", 5)


def test_get_usage_limiter_returns_noop_by_default():
    import sifter.services.limits as lim_mod
    old_factory = lim_mod._limiter_factory
    lim_mod._limiter_factory = None
    try:
        result = get_usage_limiter()
        assert isinstance(result, NoopLimiter)
    finally:
        lim_mod._limiter_factory = old_factory


def test_set_global_limiter_then_get():
    import sifter.services.limits as lim_mod
    old_factory = lim_mod._limiter_factory

    custom = NoopLimiter()
    set_global_limiter(lambda: custom)
    try:
        result = get_usage_limiter()
        assert result is custom
    finally:
        lim_mod._limiter_factory = old_factory


# ── NoopEmailSender ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_noop_email_send_invite():
    sender = NoopEmailSender()
    await sender.send_invite("a@b.com", "MyOrg", "https://example.com/invite")


@pytest.mark.asyncio
async def test_noop_email_send_password_reset():
    sender = NoopEmailSender()
    await sender.send_password_reset("a@b.com", "https://example.com/reset")


@pytest.mark.asyncio
async def test_noop_email_send_usage_alert():
    sender = NoopEmailSender()
    await sender.send_usage_alert("a@b.com", "MyOrg", 90.0)


@pytest.mark.asyncio
async def test_noop_email_send_enterprise_lead():
    sender = NoopEmailSender()
    await sender.send_enterprise_lead("a@b.com", {"company": "Acme", "size": "50"})


@pytest.mark.asyncio
async def test_noop_email_send_welcome():
    sender = NoopEmailSender()
    await sender.send_welcome("a@b.com", "Alice")


@pytest.mark.asyncio
async def test_noop_email_send_password_changed():
    sender = NoopEmailSender()
    await sender.send_password_changed("a@b.com")


@pytest.mark.asyncio
async def test_noop_email_send_email_change_verification():
    sender = NoopEmailSender()
    await sender.send_email_change_verification("a@b.com", "https://example.com/verify")


@pytest.mark.asyncio
async def test_noop_email_send_account_deleted():
    sender = NoopEmailSender()
    await sender.send_account_deleted("a@b.com", "Alice")


def test_get_email_sender_returns_noop_without_smtp(monkeypatch):
    import sifter.config as cfg_mod
    monkeypatch.setattr(cfg_mod.config, "smtp_host", "")
    result = get_email_sender()
    assert isinstance(result, NoopEmailSender)


def test_get_email_sender_returns_smtp_when_configured(monkeypatch):
    from sifter.services.email import SmtpEmailSender
    import sifter.config as cfg_mod
    monkeypatch.setattr(cfg_mod.config, "smtp_host", "smtp.example.com")
    result = get_email_sender()
    assert isinstance(result, SmtpEmailSender)
