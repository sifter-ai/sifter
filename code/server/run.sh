#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- Colors ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[sifter]${NC} $*"; }
success() { echo -e "${GREEN}[sifter]${NC} $*"; }
warn()    { echo -e "${YELLOW}[sifter]${NC} $*"; }
error()   { echo -e "${RED}[sifter]${NC} $*" >&2; }

# ---- Cleanup on exit ----
PIDS=()
cleanup() {
  info "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  if [[ "${MONGO_STARTED:-0}" == "1" ]]; then
    info "Stopping MongoDB container..."
    docker stop sifter-mongo 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM

# ---- Check dependencies ----
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "Required command not found: $1"
    error "Install it and try again."
    exit 1
  fi
}
check_cmd uv
check_cmd docker

# ---- Load .env ----
if [[ -f .env ]]; then
  info "Loading .env"
  set -a; source .env; set +a
else
  warn ".env not found — copying from .env.example"
  cp .env.example .env
  warn "Edit .env and set SIFTER_LLM_API_KEY, then re-run."
  exit 1
fi

if [[ -z "${SIFTER_LLM_API_KEY:-}" ]]; then
  warn "SIFTER_LLM_API_KEY is not set in .env"
  warn "Extractions will fail without a valid API key."
fi

# ---- MongoDB ----
if docker ps --filter name=sifter-mongo --format '{{.Names}}' | grep -q sifter-mongo; then
  success "MongoDB already running"
else
  info "Starting MongoDB container..."
  docker run -d --name sifter-mongo -p 27017:27017 mongo:7 2>/dev/null \
    || docker start sifter-mongo 2>/dev/null \
    || true
  MONGO_STARTED=1

  info "Waiting for MongoDB to be ready..."
  for i in $(seq 1 15); do
    if mongosh --quiet --eval "db.adminCommand('ping')" mongodb://localhost:27017 &>/dev/null; then
      success "MongoDB ready"
      break
    fi
    sleep 1
  done
fi

# ---- Python dependencies ----
if [[ ! -d .venv ]]; then
  info "Installing Python dependencies (uv sync)..."
  uv sync
else
  info "Python venv found — skipping uv sync (run 'uv sync' manually to update)"
fi

# ---- Start API ----
info "Starting API server on http://localhost:${SIFTER_PORT:-8000} ..."
uv run uvicorn sifter.server:app --host 0.0.0.0 --port "${SIFTER_PORT:-8000}" &
PIDS+=($!)

# Wait for API to be ready
info "Waiting for API to be ready..."
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${SIFTER_PORT:-8000}/health" &>/dev/null; then
    break
  fi
  sleep 1
done

echo ""
success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "  Sifter API is running!"
success "  API  → http://localhost:${SIFTER_PORT:-8000}"
success "  Docs → http://localhost:${SIFTER_PORT:-8000}/docs"
success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "Press Ctrl+C to stop."

wait
