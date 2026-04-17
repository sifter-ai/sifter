from __future__ import annotations

import os
from typing import Optional

import typer

from sifter_cli import config as cfg

app = typer.Typer(help="MCP server integration")


@app.command("run")
def run(
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Launch the Sifter MCP server bound to the active profile."""
    url, key = cfg.resolve(api_url, api_key, profile)
    env = {**os.environ, "SIFTER_API_URL": url}
    if key:
        env["SIFTER_API_KEY"] = key
    os.execvpe("sifter-mcp", ["sifter-mcp"], env)
