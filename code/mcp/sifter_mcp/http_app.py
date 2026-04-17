"""
ASGI app for Sifter MCP over HTTP (Streamable HTTP transport).

Exposes the MCP server at /mcp with Bearer token authentication.
Mounted inside the Sifter FastAPI server via app.mount("/mcp", create_mcp_asgi_app()).
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from sifter_mcp.server import _request_api_key, mcp


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Extract Bearer token and set it as the per-request API key context var."""

    async def dispatch(self, request: Request, call_next) -> Response:
        auth = request.headers.get("Authorization", "")
        token: contextvars.Token | None = None
        if auth.startswith("Bearer "):
            key = auth[7:].strip()
            if key:
                token = _request_api_key.set(key)
        try:
            return await call_next(request)
        finally:
            if token is not None:
                _request_api_key.reset(token)


import contextvars  # noqa: E402  (must come after the class definition that uses it in annotation)


def create_mcp_asgi_app() -> ASGIApp:
    """Return the MCP Streamable HTTP ASGI app wrapped with Bearer auth middleware."""
    base_app = mcp.streamable_http_app()
    return BearerAuthMiddleware(base_app)
