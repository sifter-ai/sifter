"""
UsageLimiter — extension interface for usage enforcement.

The OSS ships with NoopLimiter (allows everything).
The sifter-cloud repo overrides get_usage_limiter() with StripeLimiter.
"""
from typing import Protocol, runtime_checkable


@runtime_checkable
class UsageLimiter(Protocol):
    async def check_upload(self, org_id: str, file_size_bytes: int) -> None:
        """Called before document upload. Raise HTTPException(402) to block."""
        ...

    async def check_sift_create(self, org_id: str) -> None:
        """Called before sift creation. Raise HTTPException(402) to block."""
        ...

    async def record_processed(self, org_id: str, doc_count: int) -> None:
        """Called after successful extraction. For usage metering."""
        ...


class NoopLimiter:
    """Default OSS implementation — allows everything, records nothing."""

    async def check_upload(self, org_id: str, file_size_bytes: int) -> None:
        pass

    async def check_sift_create(self, org_id: str) -> None:
        pass

    async def record_processed(self, org_id: str, doc_count: int) -> None:
        pass


def get_usage_limiter() -> NoopLimiter:
    """FastAPI dependency. Cloud repo overrides via app.dependency_overrides."""
    return NoopLimiter()
