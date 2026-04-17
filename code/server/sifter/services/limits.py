"""
UsageLimiter — extension interface for usage enforcement.

The OSS ships with NoopLimiter (allows everything).
The sifter-cloud repo overrides get_usage_limiter() with StripeLimiter.
"""
from typing import Callable, Optional, Protocol, runtime_checkable


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


# Module-level overrides — set by cloud at startup so background workers use StripeLimiter.
# FastAPI dependency_overrides only apply to HTTP request handlers, not background tasks.
_limiter_factory: Optional[Callable[[], "NoopLimiter"]] = None
_default_org_id: str = "default"


def set_global_limiter(factory: Callable[[], "NoopLimiter"], org_id: str = "default") -> None:
    """Called by cloud at startup to wire StripeLimiter into background workers."""
    global _limiter_factory, _default_org_id
    _limiter_factory = factory
    _default_org_id = org_id


def get_usage_limiter() -> NoopLimiter:
    """FastAPI dependency. Cloud repo overrides via app.dependency_overrides.
    Also called directly by background workers — uses module-level factory if set."""
    if _limiter_factory is not None:
        return _limiter_factory()
    return NoopLimiter()
