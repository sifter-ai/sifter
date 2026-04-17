---
title: "Cloud: GitHub SSO login button"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-018"
---

## Summary

Add a "Continue with GitHub" button to the login page alongside the existing "Continue with Google" button. The flow exchanges a GitHub OAuth code for a JWT via `POST /api/auth/github`. Only rendered when `config.mode === "cloud"`.

## Motivation

The cloud backend now supports GitHub as a second OAuth provider. Business users often prefer GitHub identity for B2B tools. Adding the button on the frontend completes the flow end-to-end.

## Detailed Design

### Login page changes

Add a GitHub button to `LoginPage.tsx` (or equivalent auth entry point):

```
LoginPage
├── ContinueWithGoogleBtn  (existing)
├── ContinueWithGithubBtn  (new — cloud only)
└── DividerOrSeparator
```

**GitHub button**: standard GitHub logo + "Continue with GitHub" label.

### OAuth flow

1. User clicks button.
2. Frontend redirects to:
   ```
   https://github.com/login/oauth/authorize?client_id={VITE_GITHUB_CLIENT_ID}&scope=user:email&redirect_uri={VITE_GITHUB_REDIRECT_URI}
   ```
   `VITE_GITHUB_CLIENT_ID` and `VITE_GITHUB_REDIRECT_URI` are Vite env vars injected at build time.

3. GitHub redirects to `VITE_GITHUB_REDIRECT_URI` (e.g. `https://app.sifter.app/auth/github/callback`) with `?code=`.

4. `GitHubCallbackPage.tsx` reads the `code` param and calls `POST /api/auth/github` with `{code}`.

5. On success, stores JWT in localStorage (same as Google flow) and redirects to `/`.

6. On error, redirects to `/login?error=github_auth_failed`.

### New env vars (frontend)

| Variable | Description |
|----------|-------------|
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `VITE_GITHUB_REDIRECT_URI` | Callback URL registered in GitHub OAuth App |

Add to `.env.example` in `code/frontend/`.

## Components

- `GitHubButton.tsx` — button with GitHub SVG icon
- `GitHubCallbackPage.tsx` — handles redirect, calls API, stores JWT

## Route

Add `{ path: "/auth/github/callback", element: <GitHubCallbackPage /> }` to the router.

## API calls

| Action | Method | Path |
|--------|--------|------|
| Exchange code for JWT | POST | `/api/auth/github` |

## Out of scope

- SAML SSO UI (backend stub only for now — future CR)
- "Link GitHub to existing account" flow
- GitHub org membership enforcement
