"""
EmailSender — extension interface for transactional email.

The OSS ships with NoopEmailSender (drops all emails silently) and
SmtpEmailSender (activated when SIFTER_SMTP_HOST is set).
The sifter-cloud repo overrides get_email_sender() with ResendEmailSender.
"""
import asyncio
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Protocol, runtime_checkable

import structlog

logger = structlog.get_logger()


@runtime_checkable
class EmailSender(Protocol):
    async def send_invite(self, to: str, org_name: str, invite_url: str) -> None: ...
    async def send_password_reset(self, to: str, reset_url: str) -> None: ...
    async def send_usage_alert(self, to: str, org_name: str, usage_pct: float) -> None: ...
    async def send_enterprise_lead(self, to: str, lead: dict) -> None: ...
    async def send_welcome(self, to: str, full_name: str) -> None: ...
    async def send_password_changed(self, to: str) -> None: ...
    async def send_email_change_verification(self, to: str, verification_url: str) -> None: ...
    async def send_account_deleted(self, to: str, full_name: str) -> None: ...


class NoopEmailSender:
    """Default OSS implementation — silently discards all emails."""

    async def send_invite(self, to: str, org_name: str, invite_url: str) -> None:
        pass

    async def send_password_reset(self, to: str, reset_url: str) -> None:
        pass

    async def send_usage_alert(self, to: str, org_name: str, usage_pct: float) -> None:
        pass

    async def send_enterprise_lead(self, to: str, lead: dict) -> None:
        pass

    async def send_welcome(self, to: str, full_name: str) -> None:
        pass

    async def send_password_changed(self, to: str) -> None:
        pass

    async def send_email_change_verification(self, to: str, verification_url: str) -> None:
        pass

    async def send_account_deleted(self, to: str, full_name: str) -> None:
        pass


class SmtpEmailSender:
    """Send transactional email via SMTP (stdlib smtplib, no extra deps).

    Activated when SIFTER_SMTP_HOST is set. Uses STARTTLS by default (port 587).
    Set SIFTER_SMTP_TLS=false for plain or implicit-SSL connections on port 465.
    """

    def _send(self, to: str, subject: str, html: str) -> None:
        from sifter.config import config

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = config.smtp_from
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))

        if config.smtp_tls:
            with smtplib.SMTP(config.smtp_host, config.smtp_port) as s:
                s.ehlo()
                s.starttls(context=ssl.create_default_context())
                if config.smtp_user:
                    s.login(config.smtp_user, config.smtp_password)
                s.sendmail(config.smtp_from, to, msg.as_string())
        else:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, context=ctx) as s:
                if config.smtp_user:
                    s.login(config.smtp_user, config.smtp_password)
                s.sendmail(config.smtp_from, to, msg.as_string())

        logger.info("smtp_email_sent", to=to, subject=subject)

    async def _async_send(self, to: str, subject: str, html: str) -> None:
        await asyncio.to_thread(self._send, to, subject, html)

    async def send_invite(self, to: str, org_name: str, invite_url: str) -> None:
        await self._async_send(
            to, f"You've been invited to {org_name} on Sifter",
            f"<p>You've been invited to join <strong>{org_name}</strong> on Sifter.</p>"
            f'<p><a href="{invite_url}">Accept invitation</a></p>',
        )

    async def send_password_reset(self, to: str, reset_url: str) -> None:
        await self._async_send(
            to, "Reset your Sifter password",
            f'<p>Click <a href="{reset_url}">here</a> to reset your password.</p>'
            "<p>This link expires in 1 hour.</p>",
        )

    async def send_usage_alert(self, to: str, org_name: str, usage_pct: float) -> None:
        await self._async_send(
            to, f"Sifter usage alert — {org_name}",
            f"<p>Your organization <strong>{org_name}</strong> has used "
            f"{usage_pct:.0f}% of its monthly quota.</p>",
        )

    async def send_enterprise_lead(self, to: str, lead: dict) -> None:
        lines = "".join(f"<li><strong>{k}:</strong> {v}</li>" for k, v in lead.items())
        await self._async_send(to, "New Sifter enterprise enquiry", f"<ul>{lines}</ul>")

    async def send_welcome(self, to: str, full_name: str) -> None:
        from sifter.config import config
        await self._async_send(
            to, f"Welcome to Sifter, {full_name}!",
            f"<p>Hi {full_name}, welcome to Sifter!</p>"
            f'<p><a href="{config.app_url}">Get started</a></p>',
        )

    async def send_password_changed(self, to: str) -> None:
        await self._async_send(
            to, "Your Sifter password was changed",
            "<p>Your Sifter password was changed.</p>"
            "<p>If this wasn't you, please reset your password immediately.</p>",
        )

    async def send_email_change_verification(self, to: str, verification_url: str) -> None:
        await self._async_send(
            to, "Verify your new Sifter email address",
            "<p>Please verify your new Sifter email address.</p>"
            f'<p><a href="{verification_url}">Verify email address</a></p>',
        )

    async def send_account_deleted(self, to: str, full_name: str) -> None:
        await self._async_send(
            to, "Your Sifter account has been deleted",
            f"<p>Hi {full_name}, your Sifter account has been deleted.</p>",
        )


def get_email_sender() -> "NoopEmailSender | SmtpEmailSender":
    """FastAPI dependency. Cloud repo overrides via app.dependency_overrides."""
    from sifter.config import config
    if config.smtp_host:
        return SmtpEmailSender()
    return NoopEmailSender()
