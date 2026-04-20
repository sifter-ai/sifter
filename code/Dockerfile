FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Install system dependencies for pymupdf
RUN apt-get update && apt-get install -y \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy local packages (sdk + mcp) so uv path sources resolve
COPY sdk/ ../sdk/
COPY mcp/ ../mcp/

# Install Python dependencies
COPY server/pyproject.toml server/uv.lock* server/README.md ./
RUN uv sync --no-dev --frozen || uv sync --no-dev

# Copy server source
COPY server/sifter/ ./sifter/

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "sifter.server"]
