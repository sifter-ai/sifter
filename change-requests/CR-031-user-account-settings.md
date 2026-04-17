---
title: "User account settings: profile, password, avatar"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Add a full **Account** section to the Settings page so users can manage their own profile: update display name and email, change password (email-auth users only), and upload a profile avatar. Currently the Settings page only exposes API Keys and Webhooks — there is no way for a user to edit their own account information post-registration.

## Motivation

Users expect to personalise their account and maintain security hygiene (password rotation). Without this, the Settings page feels incomplete and users must contact support to change even their display name. This is table-stakes for any SaaS product and becomes more important in the Cloud tier where multiple team members may share an org workspace.

## Detailed Design

### Backend endpoints

All endpoints sit under `/api/auth` and require a valid JWT (`get_current_user` dependency).

#### `PATCH /api/auth/me`
Update name and/or email for the authenticated user.

```python
class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
```

- Validates that the new email is not already taken.
- Returns the updated `UserOut` object.
- Works for both `email` and `google` auth providers (name change always allowed; email change only for `email` provider — Google users' email is managed by Google).

#### `POST /api/auth/change-password`
Change password for email-auth users. Rejected with 400 for Google-auth users.

```python
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str        # min 8 chars
```

- Verifies `current_password` against stored bcrypt hash.
- Hashes and stores `new_password`.
- Returns `{"ok": true}`.

#### `POST /api/auth/avatar`
Upload a profile avatar image (multipart form).

- Accepts `image/jpeg`, `image/png`, `image/webp`; max 2 MB.
- Stores the file using the existing storage backend (same as document uploads).
- Sets `avatar_url` on the user document (publicly accessible URL or data-URL for OSS self-host).
- Returns updated `UserOut` (which now includes `avatar_url`).

### User model changes

Add `avatar_url: str | None = None` to the user document and to `UserOut`.

### Frontend — Account tab

Add a new route `/settings/account` and corresponding `AccountSettingsPage` component. Add "Account" as the first item in the Settings sidebar.

#### Profile section
- Fields: **Full name** (text input), **Email** (text input — disabled for Google-auth users with a tooltip "Managed by Google").
- Save button — calls `PATCH /api/auth/me`, shows success toast.

#### Avatar section
- Circular avatar preview (falls back to initials if no avatar set).
- "Upload photo" button opens file picker (JPEG/PNG/WebP, max 2 MB).
- Inline preview before upload; "Save avatar" button calls `POST /api/auth/avatar`.

#### Password section
- Visible only when `auth_provider === "email"`.
- Fields: **Current password**, **New password**, **Confirm new password**.
- Client-side validation: new ≥ 8 chars, new === confirm.
- Save button — calls `POST /api/auth/change-password`, clears fields on success.

### Cloud additions

In the Cloud tier, the Account settings page also shows a read-only **Organisation** card:
- Org name, plan tier (Free / Pro / Enterprise), seats used / total.
- "Manage billing →" deep-link to `/settings/billing`.

This card is conditionally rendered only when the Cloud feature flag is active (same pattern used by BillingPage / UsagePage lazy-loaded routes).

## Files

- `code/server/sifter/api/auth.py` — CHANGED (add PATCH /me, POST /change-password, POST /avatar)
- `code/server/sifter/models/user.py` — CHANGED (add avatar_url to user schema and UserOut)
- `code/frontend/src/pages/SettingsPage.tsx` — CHANGED (add Account route + sidebar entry)
- `code/frontend/src/pages/AccountSettingsPage.tsx` — NEW
- `code/frontend/src/api/auth.ts` — CHANGED (add updateProfile, changePassword, uploadAvatar helpers)
- `code/frontend/src/api/types.ts` — CHANGED (add avatar_url to User type)
- `system/interfaces/rest-api.md` — CHANGED (document new endpoints)
- `product/features/auth.md` — CHANGED (add account management section)

## Acceptance Criteria

1. `PATCH /api/auth/me` updates name/email and returns updated user; rejects duplicate email with 409.
2. `POST /api/auth/change-password` succeeds with correct current password; returns 400 for wrong current password and for Google-auth users.
3. `POST /api/auth/avatar` stores image and returns `avatar_url` in user object.
4. Account settings page is accessible at `/settings/account` and linked from the Settings sidebar.
5. Avatar is displayed in the sidebar/nav header once set; falls back to initials otherwise.
6. Password section is hidden for Google OAuth users.
7. Email field is disabled (with tooltip) for Google OAuth users.
8. All forms show success/error toast feedback.

## Out of Scope

- Email verification flow for email changes (v1 updates immediately; add email confirmation in a future CR if needed).
- Two-factor authentication (separate CR).
- Org member management / invites (separate CR).
- Account deletion / GDPR right-to-erasure (separate CR).
