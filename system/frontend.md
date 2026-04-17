---
title: Frontend Architecture
status: synced
---

# Frontend Architecture

React 18 + Vite + TypeScript + shadcn/ui. Lives in `code/frontend/`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite + TypeScript |
| UI components | shadcn/ui + Tailwind CSS |
| State / data fetching | TanStack React Query |
| Routing | React Router v6 |
| Auth state | Context API (`AuthContext`) |
| HTTP | `apiFetch` wrapper (injects auth header) |

## Auth

- JWT stored in `localStorage` under key `sifter_token`
- All API calls go through `apiFetch` (`src/lib/apiFetch.ts`), which injects `Authorization: Bearer <token>`
- On 401: `apiFetch` clears the token and dispatches a `sifter:auth-expired` custom event
- `AuthContext` (`src/context/AuthContext.tsx`) listens to that event, clears state, navigates to `/login`
- `ProtectedRoute` wraps all authenticated routes
- Google OAuth: `AuthContext` also exposes `loginWithGoogle(code)` which calls `POST /api/auth/google`, stores the JWT, and updates auth state. Uses `@react-oauth/google` library for the Sign-In button.

## Mode-aware behavior

On startup, the frontend calls `GET /api/config` once and stores the result in `ConfigContext` (`src/context/ConfigContext.tsx`). The response is `{ "mode": "oss" }` or `{ "mode": "cloud" }`.

UI elements gated on `config.mode`:

| Element | `oss` | `cloud` |
|---------|-------|---------|
| Billing tab in Settings | — | ✓ |
| Team tab in Settings | — | ✓ |
| Org switcher in navbar | — | ✓ |
| Usage quota bar | — | ✓ |
| Upgrade / limit prompts | — | ✓ |
| Everything else | ✓ | ✓ |

Auth info (current user, org, plan) comes from `GET /api/auth/me` — per-session, refreshed on login.

## Routing

### Unauthenticated

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | `LoginPage` | Email + password login + Google OAuth (when enabled) |
| `/register` | `RegisterPage` | New account registration + Google OAuth (when enabled) |
| `/invite/accept` | (redirect) | Accept org invite via `?token=` param |

### Authenticated

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `SiftsPage` | Sift list (dashboard) |
| `/sifts/:id` | `SiftDetailPage` | Sift detail: records, query, chat tabs |
| `/folders` | `FolderBrowserPage` | Folder list |
| `/folders/:id` | `FolderDetailPage` | Folder detail: documents, linked sifts |
| `/documents/:id` | `DocumentDetailPage` | Document: per-sift extraction status |
| `/chat` | `ChatPage` | Global chat with optional sift selector |
| `/settings` | `SettingsPage` | API keys, billing (cloud), team (cloud) |

## Architecture Principles

- `src/lib/apiFetch.ts` — single auth-injecting fetch wrapper + 401 handler
- `src/context/AuthContext.tsx` — JWT state, login/register/logout functions
- `src/context/ConfigContext.tsx` — deployment mode, fetched once on startup
- `src/api/` — one file per resource, all use `apiFetch`
- `src/hooks/` — React Query hooks wrapping every API call
- Components only consume hooks, never call fetch directly
- `useMutation` for writes, `useQuery` with polling for async progress (aggregations, document processing)

## Dev setup

```bash
cd code/frontend
npm install
npm run dev        # Vite on :3000, proxies /api → localhost:8000
```

`vite.config.ts` proxy:
```ts
server: {
  proxy: {
    "/api": { target: "http://localhost:8000", changeOrigin: true },
    "/health": { target: "http://localhost:8000", changeOrigin: true },
  }
}
```

## Production

```bash
cd code/frontend
npm run build      # outputs to dist/
```

FastAPI serves `dist/` via `StaticFiles(html=True)` on `/` when the directory exists:

```python
# sifter/server.py
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(_FRONTEND_DIST):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
```

Single process, single port (`:8000`), serves both API and UI.

## shadcn/ui Components Used

Button, Input, Textarea, Table, Card, Badge, Progress, Dialog, DropdownMenu, Tabs, ScrollArea, Skeleton, Alert, Tooltip, Select, Separator
