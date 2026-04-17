---
title: "Add google authentication support to login"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-16T00:00:00.000Z"
---

## Summary

Add support for Google authentication to the login system. This will allow users to log in using their Google accounts, improving accessibility and user experience.

## Motivation

Many users prefer using their existing accounts from popular services like Google for authentication. By integrating Google authentication, we can provide a more seamless login experience and potentially increase user engagement.

## Detailed Design

### Approach: Google OAuth 2.0 Authorization Code Flow

Use the standard OAuth 2.0 authorization code flow (not implicit flow). The frontend uses `@react-oauth/google` to render the Google Sign-In button and obtain an authorization code. The backend exchanges the code for tokens and verifies the Google ID token server-side.

### Configuration

Add the following environment variables to `sifter/config.py` (all prefixed with `SIFTER_`):

| Variable | Required | Description |
|---|---|---|
| `SIFTER_GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID |
| `SIFTER_GOOGLE_CLIENT_SECRET` | Yes | Google OAuth 2.0 Client Secret |
| `SIFTER_GOOGLE_REDIRECT_URI` | No | Override for redirect URI (defaults to `{FRONTEND_URL}/auth/callback`) |

When `SIFTER_GOOGLE_CLIENT_ID` is set, Google auth is enabled; otherwise the feature is disabled and no Google UI is shown.

### User Model Changes

The existing `users` collection already has `hashed_password` — Google-authenticated users will have this field set to `None`. Add two new fields:

- `google_id: str | None` — The Google `sub` claim from the ID token. Indexed uniquely (partial, for non-null values).
- `auth_provider: str` — Enum: `"email"` (default) or `"google"`. Allows future extension to other providers.

Lookup logic: when a Google user logs in, find by `google_id`. If not found but an existing user has the same `email`, link the Google account to that user (set `google_id` and `auth_provider`). Otherwise create a new user.

### Backend Changes

**`sifter/config.py`** — Add `google_client_id`, `google_client_secret`, `google_redirect_uri` fields.

**`sifter/services/auth_service.py`** — Add method `google_login(code: str) -> tuple[dict, str]`:
1. Exchange authorization code for tokens via `POST https://oauth2.googleapis.com/token`
2. Decode and verify the ID token using `google_client_id` as audience (use `python-jose` or `google-auth` library)
3. Extract `sub` (Google user ID), `email`, `name`, `picture`
4. Look up user by `google_id`; if not found, look up by `email`; if still not found, create new user
5. Generate a Sifter JWT (same as email login)
6. Return user info + JWT

**`sifter/api/auth.py`** — Add endpoint:
- `POST /api/auth/google` — Body: `{ "code": "..." }`. Calls `auth_service.google_login()`, returns `{ "token": "...", "user": {...} }`.

**`sifter/auth.py`** — No changes needed. The existing `get_current_principal()` dependency already resolves JWT tokens the same way regardless of how the user registered.

**Dependencies** — Add `google-auth` (or rely on existing `python-jose` for JWT verification of Google tokens) to `pyproject.toml`.

### Frontend Changes

**New dependency** — Add `@react-oauth/google` to `package.json`.

**`src/api/auth.ts`** — Add `googleAuth(code: string)` API call: `POST /api/auth/google` with `{ code }`.

**`src/context/AuthContext.tsx`** — Add `loginWithGoogle(code: string)` method that calls `googleAuth()`, stores the returned JWT in localStorage, and updates auth state.

**`src/pages/LoginPage.tsx`** — Add a "Sign in with Google" button using `@react-oauth/google`'s `GoogleLogin` component. On success, pass the authorization code to `loginWithGoogle()`. Show the button only when Google auth is enabled (gated by `/api/config` or a feature flag).

**`src/pages/RegisterPage.tsx`** — Add the same "Sign up with Google" button. Google auth handles both login and registration — if the user doesn't exist, they are created automatically.

**`src/context/ConfigContext.tsx`** — Extend `/api/config` response to include `googleAuthEnabled: boolean` so the frontend knows whether to render Google buttons.

### API Endpoint

```
POST /api/auth/google
Content-Type: application/json

Request:
{
  "code": "<authorization code from Google>"
}

Response (200):
{
  "token": "<sifter JWT>",
  "user": {
    "id": "...",
    "email": "...",
    "full_name": "...",
    "auth_provider": "google"
  }
}

Error (401):
{
  "detail": "Invalid Google authorization code"
}
```

## Acceptance Criteria

1. Users can click "Sign in with Google" on the login page and authenticate via their Google account
2. A new user is automatically created on first Google login with `auth_provider: "google"` and no password
3. An existing user with the same email as the Google account gets their account linked (`google_id` set)
4. After Google login, the user receives a standard Sifter JWT and the session works identically to email login
5. The "Sign in with Google" button is hidden when `SIFTER_GOOGLE_CLIENT_ID` is not configured
6. Email/password login continues to work unchanged
7. Google login is available on both login and register pages
8. The `/api/auth/google` endpoint validates the authorization code server-side and never trusts client-side tokens directly
9. Cloud mode: the `CloudPrincipal` override still works because Google auth produces the same JWT structure
10. Appropriate error messages are shown for failed Google authentication attempts

## Edge Cases

- **Google account with unverified email**: Reject and show message asking user to verify their Google email first
- **Account linking conflict**: If a user with `auth_provider: "google"` tries to login with email/password (and has no password set), show a clear error: "This account uses Google authentication. Please sign in with Google."
- **Disabled Google auth**: If `SIFTER_GOOGLE_CLIENT_ID` is not set, the `/api/auth/google` endpoint returns 404
- **Expired/invalid authorization code**: Return 401 with clear error message
- **Google API unreachable**: Return 503 with "Authentication service temporarily unavailable"
- **Account already linked to a different Google ID**: Reject and show error — one email cannot be linked to multiple Google accounts

## Security Considerations

- The authorization code is exchanged server-side only; the client never sees the access/refresh tokens
- ID token verification checks `aud` claim against `SIFTER_GOOGLE_CLIENT_ID`
- CSRF protection via `@react-oauth/google`'s built-in nonce handling
- Rate limiting applies to `POST /api/auth/google` the same as `POST /api/auth/login`
- No Google access tokens or refresh tokens are stored — only the `google_id` is persisted

## Out of Scope

- Google Workspace / organization-level authentication
- Other OAuth providers (GitHub, Microsoft, etc.) — can be added later via the `auth_provider` field
- Merging of separate email and Google accounts (beyond automatic linking by email)
- Google profile picture storage or display (future enhancement)
