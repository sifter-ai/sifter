---
title: "Cloud: GitHub SSO Login Button"
status: synced
cloud: true
---

# GitHub SSO — Frontend

Only rendered when `config.mode === "cloud"`.

## LoginPage changes

Add a "Continue with GitHub" button below the Google button on `LoginPage.tsx`. Only visible when `mode === "cloud"`.

## OAuth flow

1. User clicks button → redirect to `https://github.com/login/oauth/authorize?client_id={VITE_GITHUB_CLIENT_ID}&scope=user:email&redirect_uri={VITE_GITHUB_REDIRECT_URI}`
2. GitHub redirects to `/auth/github/callback?code=`
3. `GitHubCallbackPage.tsx` reads `code` → calls `POST /api/auth/github` with `{code}`
4. On success: stores JWT in localStorage, redirects to `/`
5. On error: redirects to `/login?error=github_auth_failed`

## New components

- `GitHubButton.tsx` — GitHub SVG icon + "Continue with GitHub" label
- `GitHubCallbackPage.tsx` — reads URL code, calls API, stores JWT, redirects

## New route

`/auth/github/callback` → `GitHubCallbackPage` (no auth required)

## New env vars

`VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_REDIRECT_URI` — add to `.env.example`

## API

`POST /api/auth/github` — `{code}` → `{access_token}`
