"""
EmailSender — extension interface for transactional email.

The OSS ships with NoopEmailSender (drops all emails silently).
The sifter-cloud repo overrides get_email_sender() with ResendEmailSender.
"""
from typing import Protocol, runtime_checkable


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


def get_email_sender() -> NoopEmailSender:
    """FastAPI dependency. Cloud repo overrides via app.dependency_overrides."""
    return NoopEmailSender()
