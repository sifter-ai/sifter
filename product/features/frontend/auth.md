---
title: "Frontend: Authentication"
status: synced
---

# Authentication — Frontend

## Pages

### Login (`/login`)

- Email + password form
- "Sign in with Google" button (shown only when `googleAuthEnabled: true` from `/api/config`)
- Link to Register
- On success: stores JWT in `localStorage`, navigates to `/`
- On failure: inline error message

### Register (`/register`)

- Full name, email, password form
- "Sign up with Google" button (same gate as login)
- Auto-login on success (same flow as Login)
- Link to Login

### Settings — API Keys tab (`/settings`)

- Lists active API keys: name, masked prefix (first 12 chars), creation date, Revoke button
- "Create API Key" button opens a dialog:
  - Name input field
  - On submit: calls `POST /api/keys`
  - Shows full key **once** with copy-to-clipboard button and warning
  - Key is never shown again after dialog close

## Auth State (`AuthContext`)

- Stores: `token`, `user`, `isAuthenticated`
- `login(email, password)` — calls `POST /api/auth/login`, stores token
- `register(email, password, fullName)` — calls `POST /api/auth/register`, stores token
- `loginWithGoogle(credential)` — calls `POST /api/auth/google`, stores token
- `logout()` — clears token, navigates to `/login`
- On app load: reads token from `localStorage`, calls `GET /api/auth/me` to validate + load user

## Config (`ConfigContext`)

`/api/config` response extended with `googleAuthEnabled: boolean`. Frontend gates Google buttons on this flag. `GoogleOAuthProvider` (from `@react-oauth/google`) wraps the app with `clientId` when enabled.

## 401 Handling

- `apiFetch` detects 401 responses, clears token, dispatches `sifter:auth-expired` event
- `AuthContext` listens, clears state, navigates to `/login` with a session-expired message

## Protected Routes

All authenticated routes are wrapped in `ProtectedRoute`. Unauthenticated access redirects to `/login?redirect=<original_path>`. After login, the user is redirected back to the original path.
