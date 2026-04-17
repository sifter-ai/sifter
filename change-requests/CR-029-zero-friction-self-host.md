---
title: "Zero-friction self-host: `docker run sifter/sifter`"
status: pending
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Make the self-host path a single `docker run` away. Provide an all-in-one image that boots MongoDB, the API, and the frontend with sane defaults and a guided setup screen. Keep the existing `docker-compose.yml` as the recommended production path, but give curious developers a sub-60-second evaluation path.

## Motivation

A dev-first OSS lives or dies on time-to-first-value. Today self-host requires:
1. `cp .env.example .env`
2. Edit `SIFTER_LLM_API_KEY`
3. `docker compose up -d`

That's fine for deployment but long for evaluation. The equivalent prompt for competitors (e.g. `docker run unstructured/unstructured-api`) is one line. A friction gap here costs real adoption.

The goal: a developer who wants to "try Sifter right now" runs

```
docker run -p 8000:8000 -e SIFTER_LLM_API_KEY=sk-... ghcr.io/sifter-ai/sifter
```

and sees the UI at `http://localhost:8000` within a minute. From there they can upload a document and extract.

## Detailed Design

### All-in-one image

New Dockerfile at `code/docker/Dockerfile.allinone` (multi-stage):

1. **Base**: `python:3.12-slim` with `supervisord` + `mongodb-org` (MongoDB 7) installed via the official apt repo.
2. **Build stage**: installs Python deps via `uv sync --frozen`; builds the React frontend with `npm run build`.
3. **Runtime stage**: copies the API, the built frontend (served by FastAPI as static), and the Mongo binaries. Config:
   - `supervisord` runs `mongod` (bound to `127.0.0.1:27017`, data in `/data/db`) and the FastAPI server (`uvicorn` on `0.0.0.0:8000`).
   - A first-boot script seeds an admin user and writes an `ADMIN_API_KEY` to stdout on first run.

### Environment: minimal vs. full

First-boot only requires `SIFTER_LLM_API_KEY`. Everything else has defaults that work. If the variable is missing, the container exits with a clear error explaining what's needed.

Full env compatibility with the existing `SIFTER_*` variables is preserved — power users can still point to an external MongoDB (`SIFTER_MONGODB_URI`) and disable the bundled one via `SIFTER_DISABLE_EMBEDDED_MONGO=true`.

### Persistence

Data lives in `/data` inside the container. To persist across runs:

```
docker run -p 8000:8000 -v sifter-data:/data -e SIFTER_LLM_API_KEY=... ghcr.io/sifter-ai/sifter
```

The image documents this in its `HEALTHCHECK` log and in the README.

### Guided setup screen

On first boot, if no admin user exists, the UI shows a `/setup` screen:

1. Set an admin email and password.
2. Verify the LLM key by issuing a tiny test completion (non-fatal if provider is down — a warning is shown and setup continues).
3. Emit a fresh API key for the admin and copy-paste it into the onboarding modal.

After setup, subsequent boots skip this screen. The setup state is stored in Mongo (`system.setup.completed: true`) so the same container can restart without re-triggering.

Route `/setup` is protected against re-entry once completed; visiting it returns a redirect to `/`.

### Image registry

- Published to `ghcr.io/sifter-ai/sifter:<tag>` on release.
- Tags: `latest`, `vX.Y.Z`, and `main` (bleeding edge from `main` branch).
- Multi-arch (linux/amd64, linux/arm64) via buildx.

### docker-compose still recommended for production

The README makes it explicit: the all-in-one image is for evaluation and small single-node deployments. Production stays on `docker-compose.yml` or Kubernetes with an external MongoDB. The all-in-one image shares no runtime code with the split image — they both point to the same `code/server` source.

### README first-run section

Rewrite the top of the root README to put self-host front and center:

```
## Try Sifter in 60 seconds

docker run -p 8000:8000 -e SIFTER_LLM_API_KEY=sk-... ghcr.io/sifter-ai/sifter

Open http://localhost:8000, create your admin account, upload a PDF.
```

### GitHub Actions

New workflow `allinone-image.yml`:
- Builds `Dockerfile.allinone` on push to `main` and on tags.
- Pushes to GHCR with multi-arch buildx.
- Runs a smoke test: boots the image, waits for `/health`, uploads a fixture PDF, asserts 200.

### Docs

- `docs/self-hosting/quickstart.mdx` — the 60-second path with the single `docker run`.
- `docs/self-hosting/production.mdx` — existing path via `docker-compose.yml`, Kubernetes notes.
- `docs/self-hosting/env-reference.mdx` — full env var table (moved from `system/deployment.md`).

## Files

- `code/docker/Dockerfile.allinone` — NEW
- `code/docker/supervisord.conf` — NEW
- `code/docker/entrypoint.sh` — NEW (validates env, initializes MongoDB dbpath, starts supervisor)
- `code/server/sifter/api/setup.py` — NEW (`/api/setup/*` routes used by the setup screen)
- `code/frontend/src/pages/SetupPage.tsx` — NEW
- `code/frontend/src/App.tsx` — CHANGED (route `/setup`, redirect logic)
- `.github/workflows/allinone-image.yml` — NEW
- `README.md` — CHANGED (60-second prompt at top)
- `system/deployment.md` — CHANGED (document all-in-one + link to docs)
- `docs/self-hosting/quickstart.mdx` — NEW
- `docs/self-hosting/production.mdx` — CHANGED
- `docs/self-hosting/env-reference.mdx` — NEW (or consolidated)

## Acceptance Criteria

1. `docker run -p 8000:8000 -e SIFTER_LLM_API_KEY=sk-... ghcr.io/sifter-ai/sifter` boots a working instance accessible at `http://localhost:8000`.
2. First-boot shows the `/setup` screen; after completion, boots go straight to `/`.
3. With a mounted `sifter-data` volume, admin user and data persist across `docker rm && docker run`.
4. Missing `SIFTER_LLM_API_KEY` exits with a clear error message.
5. `docker run ... ghcr.io/sifter-ai/sifter --help` prints env-var docs (via the entrypoint).
6. Multi-arch images published for linux/amd64 + linux/arm64.
7. GHA smoke test passes: boot + upload + extract against a fixture PDF.
8. README's first section shows the 60-second command.
9. `docs/self-hosting/quickstart.mdx` exists and is linked from the Mintlify sidebar.

## Out of Scope

- Kubernetes Helm chart (future CR).
- Cloud marketplace images (AWS/GCP/Azure) — future CR.
- Auto-update mechanism inside the container — user pulls a new tag manually.
- Bundled LLM (e.g., local Ollama) — the key is still required.
- Backup tooling — users back up `/data` with their own tools.
