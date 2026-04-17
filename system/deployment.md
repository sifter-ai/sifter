---
title: Deployment
status: synced
version: "1.1"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Deployment

## Deployment Methods

### 1. Evaluation — all-in-one image (60-second path)

Curious developers try Sifter with one command:

```bash
docker run -p 8000:8000 -e SIFTER_LLM_API_KEY=sk-… ghcr.io/sifter-ai/sifter
```

`ghcr.io/sifter-ai/sifter` is a multi-stage image that bundles MongoDB 7, the FastAPI server, and the built React frontend behind `supervisord`. First boot drops into a guided `/setup` screen; subsequent boots go straight to the app.

- Data persists when `/data` is mounted: `-v sifter-data:/data`.
- Multi-arch images are published for `linux/amd64` and `linux/arm64`.
- Tags: `latest` (stable releases), `vX.Y.Z` (pinned), `main` (bleeding edge).
- `docker run … --help` prints the env-var reference via the entrypoint.

**Scope:** evaluation and small single-node deployments. Not the recommended production path. Use the Docker Compose setup below for anything multi-user or long-lived.

### 2. Development (run.sh)

`code/server/run.sh` starts the API stack locally:

1. Starts a MongoDB container (`sifter-mongo`) via Docker
2. Installs Python deps with `uv sync` if `.venv` is missing
3. Starts FastAPI on `http://localhost:8000` with `--reload`

Requirements: `uv`, `docker`

```bash
cd code/server
cp .env.example .env   # edit SIFTER_LLM_API_KEY
./run.sh
```

To also run the frontend in dev:
```bash
cd code/frontend
npm install && npm run dev   # Vite on :3000
```

### 3. Docker Compose (recommended production)

`code/server/docker-compose.yml` defines two services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `mongodb` | mongo:7 | 27017 | Persistent database with healthcheck |
| `api` | built from `code/server/Dockerfile` | 8000 | FastAPI backend + React UI |

Start with:
```bash
cp code/server/.env.example code/server/.env
docker compose -f code/server/docker-compose.yml up -d
```

This is the recommended topology for production: the API and MongoDB run as independent containers, the DB can be managed externally (Atlas, DocumentDB), and scaling workers is a matter of replicating the API service. The all-in-one image shares no runtime code with the split image — both point at the same `code/server` source.

### 4. SDK only

The Python SDK (`pip install sifter-ai`) and the TypeScript SDK (`npm install @sifter-ai/sdk`) only require the API to be running.

## All-in-One Image

### First-boot `/setup` screen

When the image starts and no admin user exists, the frontend redirects to `/setup`:

1. Set an admin email and password.
2. Verify the LLM key by issuing a small test completion. Failure is non-fatal — a warning is shown and setup continues.
3. Emit a fresh API key for the admin; the user copies it once.

The setup state is persisted in Mongo (`system.setup.completed: true`) so container restarts skip the screen. Visiting `/setup` after completion redirects to `/`.

### Bundled MongoDB (opt-out)

The image starts an embedded `mongod` on `127.0.0.1:27017` with `/data/db` as dbpath. To point at an external MongoDB instead:

```bash
docker run -p 8000:8000 \
  -e SIFTER_LLM_API_KEY=sk-… \
  -e SIFTER_MONGODB_URI=mongodb+srv://… \
  -e SIFTER_DISABLE_EMBEDDED_MONGO=true \
  ghcr.io/sifter-ai/sifter
```

When `SIFTER_DISABLE_EMBEDDED_MONGO=true`, `supervisord` does not start the local `mongod` and the API connects to `SIFTER_MONGODB_URI`.

### Required vs defaulted env

On first boot only `SIFTER_LLM_API_KEY` is required. Everything else has working defaults. The container exits with a clear error when it is missing.

## Docker Image

### API (`code/server/Dockerfile`)

- Base: `python:3.12-slim`
- Uses `uv` for dependency installation from lockfile (`uv sync --no-dev --frozen`)
- Installs `libmupdf-dev` for PDF processing
- Exposes port 8000

## Environment Variables

All variables use the `SIFTER_` prefix (via pydantic-settings).

| Variable | Default | Description |
|----------|---------|-------------|
| `SIFTER_LLM_API_KEY` | *(required)* | LLM provider API key |
| `SIFTER_LLM_MODEL` | `openai/gpt-4o` | LiteLLM model string for extraction |
| `SIFTER_PIPELINE_MODEL` | `openai/gpt-4o-mini` | Faster model for aggregation pipelines |
| `SIFTER_MONGODB_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `SIFTER_MONGODB_DATABASE` | `sifter` | Database name |
| `SIFTER_API_KEY` | `sk-dev` | Bootstrap API key — **change in production** |
| `SIFTER_REQUIRE_API_KEY` | `false` | If `true`, unauthenticated requests return 401 |
| `SIFTER_JWT_SECRET` | `dev-secret-...` | **Change in production** — random 64-char string |
| `SIFTER_JWT_EXPIRE_MINUTES` | `1440` | JWT TTL (24h default) |
| `SIFTER_STORAGE_BACKEND` | `filesystem` | Storage backend: `filesystem`, `s3`, or `gcs` |
| `SIFTER_STORAGE_PATH` | `./uploads` | Base path for filesystem backend |
| `SIFTER_MAX_FILE_SIZE_MB` | `50` | Maximum upload size |
| `SIFTER_MAX_WORKERS` | `4` | Concurrent document processing workers |
| `SIFTER_HOST` | `0.0.0.0` | Bind address |
| `SIFTER_PORT` | `8000` | Server port |
| `SIFTER_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
| `SIFTER_DISABLE_EMBEDDED_MONGO` | `false` | (All-in-one image only) When `true`, skip starting the bundled `mongod` and connect to `SIFTER_MONGODB_URI` |

### S3 Storage (`SIFTER_STORAGE_BACKEND=s3`)

| Variable | Default | Description |
|----------|---------|-------------|
| `SIFTER_S3_BUCKET` | *(required)* | S3 bucket name |
| `SIFTER_S3_REGION` | `us-east-1` | AWS region |
| `SIFTER_S3_ACCESS_KEY_ID` | *(required)* | AWS access key |
| `SIFTER_S3_SECRET_ACCESS_KEY` | *(required)* | AWS secret key |
| `SIFTER_S3_ENDPOINT_URL` | *(optional)* | Custom endpoint (MinIO, R2, etc.) |

### GCS Storage (`SIFTER_STORAGE_BACKEND=gcs`)

| Variable | Default | Description |
|----------|---------|-------------|
| `SIFTER_GCS_BUCKET` | *(required)* | GCS bucket name |
| `SIFTER_GCS_PROJECT` | *(required)* | GCP project ID |
| `SIFTER_GCS_CREDENTIALS_FILE` | *(optional)* | Path to service account JSON; omit to use ADC |

## CI/CD (GitHub Actions)

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | Push/PR to main | Runs Python tests against a real MongoDB service container |
| `docker.yml` | Push to main or semver tag | Builds and pushes API image to GitHub Container Registry |

## Production Checklist

- [ ] Set `SIFTER_JWT_SECRET` to a random 64-char string
- [ ] Set `SIFTER_API_KEY` to a strong random value
- [ ] Use a managed MongoDB instance (Atlas, DocumentDB) with auth
- [ ] Set `SIFTER_CORS_ORIGINS` to the sifter-cloud frontend domain
- [ ] Put the API behind a reverse proxy (nginx, Caddy) with TLS
- [ ] **Filesystem backend**: mount `SIFTER_STORAGE_PATH` to a persistent volume
- [ ] **S3/GCS backend**: set `SIFTER_STORAGE_BACKEND` + credentials; no volume needed
- [ ] Set `SIFTER_MAX_WORKERS` based on available CPU cores
