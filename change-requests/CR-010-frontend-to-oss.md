---
title: "Frontend moves to OSS: React UI in code/frontend/, mode-aware via /api/config"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-15T00:00:00.000Z"
---

## Summary

The React frontend moves from `sifter-cloud` to the OSS repo. A single frontend codebase adapts its UI based on a `GET /api/config` response from the server it connects to. OSS deployments show the full extraction/folder/chat UI; cloud deployments additionally show billing, team management, and org switching. There is no per-tenant frontend difference — it is deployment-level configuration.

---

## 1. Frontend location

The React frontend lives in `code/frontend/` of this repo (sifter OSS):

```
code/frontend/
├── package.json
├── vite.config.ts          ← proxies /api → FastAPI :8000 in dev
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── context/
    │   └── AuthContext.tsx  ← JWT state + 401 handler
    ├── lib/
    │   └── apiFetch.ts     ← auth-injecting fetch wrapper
    ├── api/                ← one file per resource
    ├── hooks/              ← React Query hooks
    ├── pages/              ← route-level components
    └── components/         ← shared UI (shadcn/ui)
```

Tech stack: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + TanStack React Query + React Router v6.

---

## 2. New endpoint: `GET /api/config`

The server exposes a config endpoint that returns deployment-level metadata:

```http
GET /api/config
```

Response (OSS):
```json
{ "mode": "oss" }
```

Response (Cloud — overridden by sifter-cloud):
```json
{ "mode": "cloud" }
```

No auth required. The frontend fetches this once on startup and stores the result in a `ConfigContext`. The endpoint lives in `sifter/api/config.py` and returns `mode: "oss"` by default.

---

## 3. Mode-aware frontend

The frontend shows or hides UI elements based on `config.mode`:

| UI element | `oss` | `cloud` |
|------------|-------|---------|
| Billing tab in Settings | — | ✓ |
| Team tab in Settings | — | ✓ |
| Org switcher in navbar | — | ✓ |
| Usage quota bar | — | ✓ |
| Upgrade prompts | — | ✓ |
| Everything else (sifts, folders, chat, API keys) | ✓ | ✓ |

Auth info (user, org, plan) comes from `GET /api/auth/me` — per-session, not per-deployment.

---

## 4. Dev and production setup

### Dev (OSS)

```bash
cd code/server && ./run.sh    # FastAPI on :8000
cd code/frontend && npm run dev  # Vite on :3000
```

Vite proxies `/api` → `http://localhost:8000`.

### Production (OSS)

FastAPI serves the built frontend via `StaticFiles`:

```python
# sifter/server.py
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(_FRONTEND_DIST):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
```

Single process, single port (`:8000`), serves both API and UI.

---

## 5. Documentation files to update

### `system/architecture.md`

Remove: `> **No frontend in this repo.**`

Add a **Frontend** section:

```
## Frontend

- **Framework**: React 18 + Vite + TypeScript
- **UI components**: shadcn/ui + Tailwind CSS
- **State**: TanStack React Query + React Router v6
- **Location**: `code/frontend/`
- **Mode-aware**: adapts to `GET /api/config` response (`mode: "oss"` | `"cloud"`)
- In dev: Vite on :3000 proxies /api to FastAPI :8000
- In production: FastAPI serves `frontend/dist/` via StaticFiles on /
```

Update project layout to include `code/frontend/`.

### `system/api.md`

Add to the **Health** section (or as its own section):

```markdown
## Config

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Deployment config. No auth required. |

Response: `{ "mode": "oss" | "cloud" }`
```

### `product/vision.md`

Add to **Core Value Propositions**:

- **Web UI included**: Sifter ships with a built-in React UI for managing sifts, folders, chat, and settings — no separate frontend deployment needed

Update **Long-term Direction** to mention the web UI as a first-class interface alongside the REST API and SDK.

---

## 6. New documentation file to create

### `system/frontend.md`

New file documenting the OSS frontend:

- Tech stack (React 18, Vite, TypeScript, Tailwind, shadcn/ui)
- Auth: JWT in localStorage, `apiFetch` wrapper, `AuthContext`, 401 handling
- Routing: all routes (unauthenticated + authenticated)
- Mode-aware behavior: what `ConfigContext` drives, which components check `mode`
- Dev setup: Vite proxy config
- Production: StaticFiles mounting in `sifter/server.py`
- shadcn/ui component inventory

---

## Files to Create

- `system/frontend.md` — full frontend architecture doc
- `code/frontend/` — React app (actual code, not just doc)
- `sifter/api/config.py` — `GET /api/config` router returning `{ "mode": "oss" }`

## Files to Modify

- `system/architecture.md` — add Frontend section, update project layout
- `system/api.md` — add `GET /api/config` endpoint
- `product/vision.md` — add web UI to value propositions
- `sifter/server.py` — include config router, mount StaticFiles if dist exists
