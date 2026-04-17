FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Install system dependencies for pymupdf
RUN apt-get update && apt-get install -y \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies with uv (uses lockfile if present)
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --frozen || uv sync --no-dev

# Copy source
COPY sifter_server/ ./sifter_server/

# Copy frontend build if exists
COPY frontend/dist/ ./frontend/dist/ 2>/dev/null || true

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "sifter_server.server"]
