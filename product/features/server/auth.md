---
title: "Server: Authentication & API Keys"
status: synced
---

# Authentication & API Keys — Server

> **OSS scope:** Sifter OSS is single-tenant. There are no organizations or org switching in the OSS. Multi-tenancy, org management, and team invites are cloud-only features (see `system/cloud.md`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register user; returns JWT + user info |
| POST | `/api/auth/login` | Login with email + password; returns JWT + user info |
| POST | `/api/auth/google` | Login/register with Google ID token; returns JWT + user info |
| GET | `/api/auth/me` | Current user info (requires JWT or API key) |
| GET | `/api/keys` | List active API keys (prefix + metadata, no hashes) |
| POST | `/api/keys` | Create API key; returns full key **once** |
| DELETE | `/api/keys/{key_id}` | Revoke API key |

Register/Login body: `{ "email", "password", "full_name"? }`
JWT response: `{ "access_token": str, "token_type": "bearer", "user": { id, email, full_name, created_at, auth_provider } }`

Google auth body: `{ "credential": "<Google ID token>" }`
Google auth response: same JWT response shape as login.
Returns 404 if `SIFTER_GOOGLE_CLIENT_ID` is not configured.
Returns 401 with `"Invalid Google credential"` if the token is invalid or unverified.

Create key body: `{ "name": str }`
Create key response: `{ "key": {...metadata}, "plaintext": "sk-..." }`

## Auth Mechanisms

Three credential types are accepted on all protected endpoints, in priority order:

| Priority | Mechanism | How |
|----------|-----------|-----|
| 1 | Bootstrap API key | `X-API-Key: <SIFTER_API_KEY config value>` |
| 2 | DB API key | `X-API-Key: sk-...` (key created via `/api/keys`) |
| 3 | JWT Bearer | `Authorization: Bearer <token>` |

If none are present and `SIFTER_REQUIRE_API_KEY=false` (default), the request proceeds as `anonymous`. Set `SIFTER_REQUIRE_API_KEY=true` in production to require auth on every endpoint.

An invalid key (present but unrecognized) always returns HTTP 401.

## API Key Mechanics

- Format: `sk-<48 random URL-safe chars>` (~50 chars total)
- Full key shown **once** at creation — only `SHA-256(key_without_prefix)` is stored
- Display shows only the key prefix (first 12 chars, e.g. `sk-AbCdEfGh...`) + creation date
- Keys can be individually revoked (`is_active=false`); revoked keys are excluded from list

## JWT Configuration

- Algorithm: HS256
- Secret: `SIFTER_JWT_SECRET` env var
- Expiry: `SIFTER_JWT_EXPIRE_MINUTES` (default: 1440 = 24h)
- Payload: `{ "sub": user_id, "exp": ... }`

## User Model

| Field | Type | Description |
|-------|------|-------------|
| `email` | str | Unique, lowercased |
| `full_name` | str | Display name |
| `hashed_password` | str \| None | `None` for Google-only accounts |
| `google_id` | str \| None | Google `sub` claim; uniquely indexed (sparse) |
| `auth_provider` | str | `"email"` (default) or `"google"` |

Google login flow:
1. Verify Google ID token server-side using `google-auth` and `SIFTER_GOOGLE_CLIENT_ID` as audience
2. Look up user by `google_id`; if not found, look up by `email`
3. If email match found: link account (set `google_id`, `auth_provider="google"`)
4. If no match: create new user (no password)
5. Issue standard Sifter JWT

Edge cases:
- Unverified Google email → 401 with `"Google account email is not verified"`
- Email/password login on a Google-only account → 401 with `"This account uses Google sign-in"`

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 10 requests / minute |
| `POST /api/auth/register` | 5 requests / minute |
| `POST /api/auth/google` | 10 requests / minute |
