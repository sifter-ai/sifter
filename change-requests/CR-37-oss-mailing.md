---
title: "Mailing events"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-21T00:00:00.000Z"
---

## Summary

Send transactional emails for the main authentication lifecycle events in the OSS server: registration (welcome), password reset, password change notification, email change verification, and account deletion confirmation.

Organization invitation emails are out of scope for OSS (multi-tenancy lives in sifter-cloud; a separate CR will cover that).

## Motivation

Currently the OSS server has a `NoopEmailSender` that silently drops all email calls. The `EmailSender` protocol defines `send_invite`, `send_password_reset`, `send_usage_alert`, and `send_enterprise_lead` — but only the enterprise lead method is actually called anywhere. The password reset flow does not exist at all (no endpoint, no token generation), so users who forget their password have no self-service recovery path.

Adding real email delivery unblocks:
- **Self-hosted users** who need a working password reset without manually editing the database
- **Security hygiene** — users are notified when their password or email changes
- **Account cleanup** — users get confirmation when they delete their account

## Detailed Design

### EmailSender protocol extensions

`sifter/services/email.py` — extend the `EmailSender` Protocol with the new methods:

```python
class EmailSender(Protocol):
    # existing
    async def send_invite(self, to: str, org_name: str, invite_url: str) -> None: ...
    async def send_password_reset(self, to: str, reset_url: str) -> None: ...
    async def send_usage_alert(self, to: str, org_name: str, usage_pct: float) -> None: ...
    async def send_enterprise_lead(self, to: str, lead: dict) -> None: ...
    # new
    async def send_welcome(self, to: str, full_name: str) -> None: ...
    async def send_password_changed(self, to: str) -> None: ...
    async def send_email_change_verification(self, to: str, verification_url: str) -> None: ...
    async def send_account_deleted(self, to: str, full_name: str) -> None: ...
```

`NoopEmailSender` gets stub implementations for all new methods.

### Event 1 — Registration / Welcome

**Trigger:** `POST /api/auth/register` success  
**Call:** `await email_sender.send_welcome(to=user["email"], full_name=user["full_name"])`  
**Content:** welcome message, link to quickstart docs, link to app  
**Note:** no email verification gate — OSS keeps onboarding frictionless. Self-hosters who need verification can override the dependency.

### Event 2 — Password Reset

This is the largest change: two new endpoints are required.

**New endpoint 1:** `POST /api/auth/forgot-password`
- Body: `{ "email": "..." }`
- Always returns 200 (no user enumeration)
- If user exists and uses email auth: generate a short-lived JWT token
  - Payload: `{ "sub": user_id, "type": "password_reset", "exp": now + 15min }`
  - Sign with `config.jwt_secret`, algorithm HS256
- Call `await email_sender.send_password_reset(to=email, reset_url=f"{config.app_url}/reset-password?token={token}")`

**New config var:** `SIFTER_APP_URL` (used to build the reset link; defaults to `http://localhost:3000`)

**New endpoint 2:** `POST /api/auth/reset-password`
- Body: `{ "token": "...", "new_password": "..." }`
- Decode and verify JWT; reject if `type != "password_reset"` or expired
- Validate new password (min 8 chars)
- Update `hashed_password` in users collection
- Respond 200; do not reuse the token (JWT expiry is the only guard — no server-side blacklist needed for OSS)

### Event 3 — Password Change Notification

**Trigger:** `POST /api/auth/change-password` success  
**Call:** `await email_sender.send_password_changed(to=user["email"])`  
**Content:** "Your password was changed. If this wasn't you, contact support." No action links.

### Event 4 — Email Change Verification

Current behaviour: `PATCH /api/auth/me` with a new email applies the change immediately. This should require verification of the new address before the change takes effect.

**Flow:**
1. User submits `PATCH /api/auth/me` with `email = new_address`
2. Server stores `pending_email` field on the user document (does not change `email` yet)
3. Generates a short-lived JWT: `{ "sub": user_id, "type": "email_change", "new_email": new_address, "exp": now + 24h }`
4. Calls `await email_sender.send_email_change_verification(to=new_address, verification_url=f"{config.app_url}/verify-email?token={token}")`
5. **New endpoint:** `GET /api/auth/verify-email?token=...`
   - Decode JWT; reject if `type != "email_change"` or expired
   - Set `email = token["new_email"]`, clear `pending_email`
   - Return 200 with a redirect hint (frontend handles the redirect to app)

**User model change:** add `pending_email: str | None = None` field.

### Event 5 — Account Deletion

`DELETE /api/auth/me` does not exist yet and must be added.

**New endpoint:** `DELETE /api/auth/me`
- Requires authentication (existing `get_current_user` dependency)
- Body (optional): `{ "confirm": true }` — prevents accidental deletes
- Steps:
  1. Capture `email` and `full_name` before deletion
  2. Delete user document from `users` collection
  3. Soft-delete or hard-delete owned resources (sifts, documents, results) — **out of scope for this CR; add a TODO comment**
  4. Call `await email_sender.send_account_deleted(to=email, full_name=full_name)`
  5. Return 204

**Content:** "Your account has been deleted. All your data has been removed."

## Configuration

New env var to add to `SifterConfig`:

| Variable | Purpose | Default |
|---|---|---|
| `SIFTER_APP_URL` | Base URL used in email links (reset, verify) | `http://localhost:3000` |

This var is already needed by the cloud layer; adding it to OSS config keeps the two layers consistent.

## Affected Files

| File | Change |
|---|---|
| `sifter/services/email.py` | Extend `EmailSender` protocol + `NoopEmailSender` stubs |
| `sifter/config.py` | Add `app_url: str` field |
| `sifter/api/auth.py` | Add `forgot-password`, `reset-password`, `verify-email` endpoints; hook `send_welcome`, `send_password_changed`, `send_email_change_verification` into existing flows |
| `sifter/models/user.py` | Add `pending_email` field to user schema |

## Acceptance Criteria

1. `POST /api/auth/register` triggers a welcome email (captured in `NoopEmailSender` logs in tests)
2. `POST /api/auth/forgot-password` always returns 200; a reset email is sent when the user exists
3. `POST /api/auth/reset-password` with a valid token updates the password; token cannot be re-used after it expires
4. `POST /api/auth/reset-password` with an invalid or expired token returns 400
5. `POST /api/auth/change-password` triggers a password-changed notification email
6. `PATCH /api/auth/me` with a new email stores `pending_email` and sends verification email; `email` field is unchanged until verification
7. `GET /api/auth/verify-email` with a valid token applies the email change
8. `DELETE /api/auth/me` deletes the user and sends account-deleted confirmation
9. All new endpoints have corresponding pytest tests (no mocked email sender — assert method calls on a spy/fake)
10. `NoopEmailSender` implements all new `EmailSender` methods (mypy / Protocol check passes)

## Out of Scope

- Organization invitation emails (multi-tenancy is sifter-cloud; covered by a separate cloud CR)
- Usage alert emails (`send_usage_alert`) — triggered by billing quotas, cloud-only
- SMTP transport in OSS — `NoopEmailSender` ships with OSS; cloud overrides with `ResendEmailSender`
- Email templates / HTML rendering in OSS — content format is delegated to the concrete sender implementation
- Hard-delete cascade of user-owned resources on account deletion (tracked as a TODO in the endpoint)
- Rate limiting on `forgot-password` beyond the existing slowapi setup
