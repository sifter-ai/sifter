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

### Settings — Account (`/settings/account`)

First tab in the Settings sidebar. Sections:

**Profile section**
- **Full name** text input (editable for all users).
- **Email** text input — disabled for Google-auth users with tooltip "Managed by Google".
- Save button — calls `PATCH /api/auth/me`; shows success/error toast.

**Avatar section**
- Circular avatar preview (falls back to user initials if `avatar_url` is `null`).
- "Upload photo" button opens file picker (JPEG/PNG/WebP, max 2 MB); shows inline preview before upload.
- "Save avatar" button — calls `POST /api/auth/avatar`; updates avatar in nav header on success.

**Password section**
- Visible only when `auth_provider === "email"`. Hidden entirely for Google OAuth users.
- Fields: **Current password**, **New password**, **Confirm new password**.
- Client-side validation: new password ≥ 8 chars, new === confirm.
- Save button — calls `POST /api/auth/change-password`; clears fields on success.

**Organisation card** _(Cloud only — rendered when `config.mode === "cloud"`)_
- Read-only: org name, plan tier (Free / Pro / Enterprise), seats used / total.
- "Manage billing →" deep-link to `/settings/billing`.

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
- `updateUser(partial)` — merges updated fields into stored `user` object (used after profile/avatar save)
- On app load: reads token from `localStorage`, calls `GET /api/auth/me` to validate + load user

## User type (`User`)

```ts
interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  auth_provider: "email" | "google";
  avatar_url: string | null;
}
```

Avatar display: show `avatar_url` if set; otherwise render a circle with the user's initials (first letter of each word in `full_name`, max 2). Used in the nav header and the Account settings avatar preview.

## Config (`ConfigContext`)

`/api/config` response extended with `googleAuthEnabled: boolean`. Frontend gates Google buttons on this flag. `GoogleOAuthProvider` (from `@react-oauth/google`) wraps the app with `clientId` when enabled.

## 401 Handling

- `apiFetch` detects 401 responses, clears token, dispatches `sifter:auth-expired` event
- `AuthContext` listens, clears state, navigates to `/login` with a session-expired message

## Protected Routes

All authenticated routes are wrapped in `ProtectedRoute`. Unauthenticated access redirects to `/login?redirect=<original_path>`. After login, the user is redirected back to the original path.
