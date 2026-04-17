"""Entry point for `python -m sifter_mcp` and the `sifter-mcp` CLI."""

import argparse
import os

from sifter_mcp.server import _api_url, mcp


def main() -> None:
    parser = argparse.ArgumentParser(description="Sifter MCP server")
    parser.add_argument(
        "--base-url",
        default=_api_url,
        help="Sifter server URL (default: SIFTER_BASE_URL env var or http://localhost:8000)",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse", "streamable-http"],
        default="stdio",
        help="Transport protocol (default: stdio)",
    )
    parser.add_argument("--host", default="0.0.0.0", help="Host for HTTP transport")
    parser.add_argument("--port", type=int, default=8001, help="Port for HTTP transport")
    args = parser.parse_args()

    # Override base URL if provided via CLI
    if args.base_url != _api_url:
        os.environ["SIFTER_BASE_URL"] = args.base_url
        # Reload module-level var
        import sifter_mcp.server as srv
        srv._api_url = args.base_url

    if args.transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport=args.transport, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
