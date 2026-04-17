---
title: "OSS/Cloud split: extension interfaces + sifter-cloud repo structure"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Implement the open-core architecture described in `system/cloud.md`. Add two no-op extension interfaces to the OSS repo that the private `sifter-cloud` repo will implement. Do not remove any existing features from the OSS.

---

## 1. UsageLimiter Protocol (`sifter/services/limits.py`)

New file. Default no-op implementation always allows everything.

```python
from typing import Protocol
from fastapi import HTTPException


class UsageLimiter(Protocol):
    async def check_upload(self, org_id: str, file_size_bytes: int) -> None:
        """Called before document upload. Raise HTTPException(402) to block."""

    async def check_sift_create(self, org_id: str) -> None:
        """Called before sift creation. Raise HTTPException(402) to block."""

    async def record_processed(self, org_id: str, doc_count: int) -> None:
        """Called after successful extraction. For usage metering."""


class NoopLimiter:
    """Default implementation — allows everything, records nothing."""

    async def check_upload(self, org_id: str, file_size_bytes: int) -> None:
        pass

    async def check_sift_create(self, org_id: str) -> None:
        pass

    async def record_processed(self, org_id: str, doc_count: int) -> None:
        pass
```

Wire `NoopLimiter` as a FastAPI dependency:

```python
# sifter/deps.py (new file)
from .services.limits import NoopLimiter

def get_usage_limiter() -> NoopLimiter:
    return NoopLimiter()
```

Call `await limiter.check_upload(...)` in `POST /api/folders/{id}/documents` and `POST /api/sifts/{id}/upload` before saving the file.
Call `await limiter.check_sift_create(...)` in `POST /api/sifts`.
Call `await limiter.record_processed(...)` in `document_processor.py` after successful extraction.

The cloud repo overrides via `app.dependency_overrides[get_usage_limiter] = lambda: StripeLimiter(...)`.

---

## 2. EmailSender Protocol (`sifter/services/email.py`)

New file. Default no-op implementation silently drops all emails.

```python
from typing import Protocol


class EmailSender(Protocol):
    async def send_invite(self, to: str, org_name: str, invite_url: str) -> None: ...
    async def send_password_reset(self, to: str, reset_url: str) -> None: ...
    async def send_usage_alert(self, to: str, org_name: str, usage_pct: float) -> None: ...


class NoopEmailSender:
    """Default implementation — silently discards all emails."""

    async def send_invite(self, to: str, org_name: str, invite_url: str) -> None:
        pass

    async def send_password_reset(self, to: str, reset_url: str) -> None:
        pass

    async def send_usage_alert(self, to: str, org_name: str, usage_pct: float) -> None:
        pass


def get_email_sender() -> NoopEmailSender:
    return NoopEmailSender()
```

---

## 3. Update `system/architecture.md` Project Layout

Update the `sifter/services/` section in the project layout to include the new files:
- `limits.py` — UsageLimiter protocol + NoopLimiter
- `email.py` — EmailSender protocol + NoopEmailSender

---

## Files to Create/Modify

- NEW: `sifter/services/limits.py` — UsageLimiter + NoopLimiter
- NEW: `sifter/services/email.py` — EmailSender + NoopEmailSender
- NEW: `sifter/deps.py` — FastAPI dependency providers
- `sifter/api/sifts.py` — inject limiter, call check_sift_create + check_upload + record_processed
- `sifter/api/folders.py` — inject limiter, call check_upload
- `sifter/services/document_processor.py` — call record_processed after extraction
- `system/architecture.md` — update project layout section
