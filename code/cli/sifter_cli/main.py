from __future__ import annotations

import sys
from typing import Optional

import typer

from sifter_cli.commands import auth, extract, folders, mcp, records, sifts

app = typer.Typer(
    name="sifter",
    help="Sifter CLI — document extraction from the command line.",
    add_completion=True,
)

app.add_typer(auth.app, name="auth", no_args_is_help=True)
app.add_typer(sifts.app, name="sifts", no_args_is_help=True)
app.add_typer(folders.app, name="folders", no_args_is_help=True)
app.add_typer(records.app, name="records", no_args_is_help=True)
app.add_typer(mcp.app, name="mcp", no_args_is_help=True)


@app.command("login")
def login(
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Save API credentials (shortcut for `sifter auth login`)."""
    auth.login(api_url=api_url, api_key=api_key, profile=profile)


@app.command("logout")
def logout(profile: str = typer.Option("default", "--profile")) -> None:
    """Remove saved credentials (shortcut for `sifter auth logout`)."""
    auth.logout(profile=profile)


@app.command("whoami")
def whoami(
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Print active profile (shortcut for `sifter auth whoami`)."""
    auth.whoami(api_url=api_url, api_key=api_key, profile=profile)


@app.command("extract")
def extract_cmd(
    ctx: typer.Context,
    paths: list[str] = typer.Argument(...),
    instructions: str = typer.Option(..., "--instructions", "-i"),
    sift_id: Optional[str] = typer.Option(None, "--sift"),
    wait: bool = typer.Option(True, "--wait/--no-wait"),
    as_json: bool = typer.Option(False, "--json/--table"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    quiet: bool = typer.Option(False, "--quiet"),
) -> None:
    """Upload and extract documents in one shot."""
    from pathlib import Path
    extract.extract(
        ctx=ctx,
        paths=[Path(p) for p in paths],
        instructions=instructions,
        sift_id=sift_id,
        wait=wait,
        as_json=as_json,
        api_url=api_url,
        api_key=api_key,
        profile=profile,
        quiet=quiet,
    )


def main() -> None:
    try:
        app()
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
