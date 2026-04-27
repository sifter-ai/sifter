"""
Unit tests for limits.py and email.py — pure classes, no external dependencies.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from sifter.services.limits import NoopLimiter, get_usage_limiter, set_global_limiter
from sifter.services.email import NoopEmailSender, SmtpEmailSender, get_email_sender


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
    import sifter.config as cfg_mod
    monkeypatch.setattr(cfg_mod.config, "smtp_host", "smtp.example.com")
    result = get_email_sender()
    assert isinstance(result, SmtpEmailSender)


# ── SmtpEmailSender ───────────────────────────────────────────────────────────

def _make_smtp_sender(monkeypatch) -> SmtpEmailSender:
    import sifter.config as cfg_mod
    monkeypatch.setattr(cfg_mod.config, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(cfg_mod.config, "smtp_port", 587)
    monkeypatch.setattr(cfg_mod.config, "smtp_from", "noreply@example.com")
    monkeypatch.setattr(cfg_mod.config, "smtp_user", "")
    monkeypatch.setattr(cfg_mod.config, "smtp_password", "")
    monkeypatch.setattr(cfg_mod.config, "smtp_tls", True)
    monkeypatch.setattr(cfg_mod.config, "app_url", "https://sifter.example.com")
    return SmtpEmailSender()


def test_smtp_sender_send_with_tls(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    mock_smtp = MagicMock()
    mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp.__exit__ = MagicMock(return_value=False)
    with patch("smtplib.SMTP", return_value=mock_smtp):
        sender._send("to@example.com", "Subject", "<p>Body</p>")
    mock_smtp.sendmail.assert_called_once()


def test_smtp_sender_send_with_tls_and_login(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    import sifter.config as cfg_mod
    monkeypatch.setattr(cfg_mod.config, "smtp_user", "user@example.com")
    monkeypatch.setattr(cfg_mod.config, "smtp_password", "pass")
    mock_smtp = MagicMock()
    mock_smtp.__enter__ = MagicMock(return_value=mock_smtp)
    mock_smtp.__exit__ = MagicMock(return_value=False)
    with patch("smtplib.SMTP", return_value=mock_smtp):
        sender._send("to@example.com", "Subject", "<p>Body</p>")
    mock_smtp.login.assert_called_once_with("user@example.com", "pass")


def test_smtp_sender_send_without_tls(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    import sifter.config as cfg_mod
    monkeypatch.setattr(cfg_mod.config, "smtp_tls", False)
    mock_smtp_ssl = MagicMock()
    mock_smtp_ssl.__enter__ = MagicMock(return_value=mock_smtp_ssl)
    mock_smtp_ssl.__exit__ = MagicMock(return_value=False)
    with patch("smtplib.SMTP_SSL", return_value=mock_smtp_ssl):
        sender._send("to@example.com", "Subject", "<p>Body</p>")
    mock_smtp_ssl.sendmail.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_sender_send_invite(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_invite("to@example.com", "MyOrg", "https://example.com/invite")
    mock_send.assert_called_once()
    assert "MyOrg" in mock_send.call_args[0][0] or "MyOrg" in mock_send.call_args[0][1] or "MyOrg" in mock_send.call_args[0][2]


@pytest.mark.asyncio
async def test_smtp_sender_send_password_reset(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_password_reset("to@example.com", "https://example.com/reset")
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_sender_send_usage_alert(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_usage_alert("to@example.com", "MyOrg", 85.0)
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_sender_send_enterprise_lead(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_enterprise_lead("to@example.com", {"company": "Acme"})
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_sender_send_welcome(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_welcome("to@example.com", "Alice")
    mock_send.assert_called_once()
    assert "Alice" in mock_send.call_args[0][1] or "Alice" in mock_send.call_args[0][2]


@pytest.mark.asyncio
async def test_smtp_sender_send_password_changed(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_password_changed("to@example.com")
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_sender_send_email_change_verification(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_email_change_verification("to@example.com", "https://example.com/verify")
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_sender_send_account_deleted(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch.object(sender, "_async_send", new_callable=AsyncMock) as mock_send:
        await sender.send_account_deleted("to@example.com", "Alice")
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_smtp_sender_async_send_calls_thread(monkeypatch):
    sender = _make_smtp_sender(monkeypatch)
    with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
        await sender._async_send("to@example.com", "Subject", "<p>Body</p>")
    mock_thread.assert_called_once_with(sender._send, "to@example.com", "Subject", "<p>Body</p>")


def test_smtp_sender_ssl_with_login(monkeypatch):
    """SMTP_SSL path with smtp_user set → s.login() called (line 87)."""
    sender = _make_smtp_sender(monkeypatch)
    import sifter.config as cfg_mod
    monkeypatch.setattr(cfg_mod.config, "smtp_tls", False)
    monkeypatch.setattr(cfg_mod.config, "smtp_user", "user@example.com")
    monkeypatch.setattr(cfg_mod.config, "smtp_password", "secret")
    mock_smtp_ssl = MagicMock()
    mock_smtp_ssl.__enter__ = MagicMock(return_value=mock_smtp_ssl)
    mock_smtp_ssl.__exit__ = MagicMock(return_value=False)
    with patch("smtplib.SMTP_SSL", return_value=mock_smtp_ssl):
        sender._send("to@example.com", "Subject", "<p>Body</p>")
    mock_smtp_ssl.login.assert_called_once_with("user@example.com", "secret")
