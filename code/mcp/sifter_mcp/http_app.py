"""
ASGI app for Sifter MCP over HTTP (Streamable HTTP transport).

Exposes the MCP server at /mcp with Bearer token authentication.
Mounted inside the Sifter FastAPI server via app.mount("/mcp", create_mcp_asgi_app()).
"""

import contextvars

from sifter_mcp.server import _request_api_key, mcp


class BearerAuthMiddleware:
    """Extract Bearer token and set it as the per-request API key context var.

    Implemented as a raw ASGI middleware (not BaseHTTPMiddleware) so it never
    buffers the response body — BaseHTTPMiddleware deadlocks on the SSE /
    chunked-transfer streams that FastMCP's StreamableHTTP transport emits.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        auth = headers.get(b"authorization", b"").decode("latin-1")

        token: contextvars.Token | None = None
        if auth.startswith("Bearer "):
            key = auth[7:].strip()
            if key:
                token = _request_api_key.set(key)

        try:
            await self.app(scope, receive, send)
        finally:
            if token is not None:
                _request_api_key.reset(token)


def create_mcp_asgi_app():
    """Return the MCP Streamable HTTP ASGI app wrapped with Bearer auth middleware."""
    base_app = mcp.streamable_http_app()
    return BearerAuthMiddleware(base_app)
