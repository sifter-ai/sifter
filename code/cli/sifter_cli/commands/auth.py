from __future__ import annotations

import typer

from sifter_cli import config as cfg
from sifter_cli.output import console, err_console

app = typer.Typer(help="Authentication")


@app.command()
def login(
    api_url: str = typer.Option(None, "--api-url", help="Sifter API URL"),
    api_key: str = typer.Option(None, "--api-key", help="API key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Save API URL and key to ~/.sifter/config.toml."""
    if not api_url:
        api_url = typer.prompt("API URL", default="https://api.sifter.ai")
    if not api_key:
        api_key = typer.prompt("API key", hide_input=True)
    cfg.set_profile(api_url.rstrip("/"), api_key, profile)
    console.print(f"[green]Saved profile '{profile}'.[/green]")


@app.command()
def logout(
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Remove saved credentials."""
    cfg.delete_profile(profile)
    console.print(f"[yellow]Profile '{profile}' removed.[/yellow]")


@app.command()
def whoami(
    api_url: str = typer.Option(None, "--api-url"),
    api_key: str = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Print active profile."""
    url, key = cfg.resolve(api_url, api_key, profile)
    fingerprint = f"{key[:8]}…" if len(key) > 8 else "(none)"
    console.print(f"Profile : [bold]{profile}[/bold]")
    console.print(f"API URL : {url}")
    console.print(f"API key : {fingerprint}")
