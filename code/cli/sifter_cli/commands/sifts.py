from __future__ import annotations

import sys
import time
from typing import Optional

import typer
from sifter import Sifter
from sifter.errors import SifterError

from sifter_cli import config as cfg
from sifter_cli.output import auto_format, console, err_console, print_json, print_table

app = typer.Typer(help="Manage sifts")


def _client(api_url: Optional[str], api_key: Optional[str], profile: str) -> Sifter:
    url, key = cfg.resolve(api_url, api_key, profile)
    return Sifter(api_url=url, api_key=key)


@app.command("list")
def list_sifts(
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    as_json: bool = typer.Option(False, "--json/--table"),
    limit: int = typer.Option(50, "--limit"),
) -> None:
    """List all sifts."""
    client = _client(api_url, api_key, profile)
    sifts = client.list_sifts(limit=limit)
    data = [{"id": s.id, "name": s.name, "status": s.status} for s in sifts]
    auto_format(data, as_json)


@app.command("get")
def get_sift(
    sift_id: str,
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    as_json: bool = typer.Option(False, "--json/--table"),
) -> None:
    """Get a sift by ID."""
    client = _client(api_url, api_key, profile)
    try:
        sift = client.sift(sift_id)
        auto_format({"id": sift.id, "name": sift.name, "status": sift.status}, as_json)
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("create")
def create_sift(
    name: str = typer.Option(..., "--name", "-n"),
    instructions: str = typer.Option(..., "--instructions", "-i"),
    description: str = typer.Option("", "--description"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    as_json: bool = typer.Option(False, "--json/--table"),
) -> None:
    """Create a new sift."""
    client = _client(api_url, api_key, profile)
    try:
        sift = client.create_sift(name=name, instructions=instructions, description=description)
        auto_format({"id": sift.id, "name": sift.name, "status": sift.status}, as_json)
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("update")
def update_sift(
    sift_id: str,
    name: Optional[str] = typer.Option(None, "--name", "-n"),
    instructions: Optional[str] = typer.Option(None, "--instructions", "-i"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    as_json: bool = typer.Option(False, "--json/--table"),
) -> None:
    """Update a sift."""
    client = _client(api_url, api_key, profile)
    try:
        fields: dict = {}
        if name:
            fields["name"] = name
        if instructions:
            fields["instructions"] = instructions
        sift = client.sift(sift_id)
        sift.update(**fields)
        console.print(f"[green]Updated sift {sift_id}.[/green]")
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("delete")
def delete_sift(
    sift_id: str,
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Delete a sift."""
    if not yes:
        typer.confirm(f"Delete sift {sift_id}?", abort=True)
    client = _client(api_url, api_key, profile)
    try:
        client.sift(sift_id).delete()
        console.print(f"[green]Deleted sift {sift_id}.[/green]")
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("schema")
def schema(
    sift_id: str,
    fmt: str = typer.Option("json", "--format", "-f", help="pydantic|ts|json"),
    watch: bool = typer.Option(False, "--watch", help="Poll for schema changes"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Emit typed schema for a sift."""
    client = _client(api_url, api_key, profile)

    def _fetch() -> tuple[int, str]:
        url, key = cfg.resolve(api_url, api_key, profile)
        import httpx
        headers = {"X-API-Key": key} if key else {}
        endpoint = {
            "pydantic": f"{url}/api/sifts/{sift_id}/schema.pydantic",
            "ts": f"{url}/api/sifts/{sift_id}/schema.ts",
            "json": f"{url}/api/sifts/{sift_id}/schema",
        }.get(fmt, f"{url}/api/sifts/{sift_id}/schema")
        r = httpx.get(endpoint, headers=headers)
        r.raise_for_status()
        if fmt == "json":
            import json as _json
            data = r.json()
            return data.get("schema_version", 0), _json.dumps(data, indent=2)
        return 0, r.text

    try:
        version, text = _fetch()
        sys.stdout.write(text + "\n")
        if watch:
            console.print("[dim]Watching for schema changes (Ctrl-C to stop)…[/dim]", err=True)
            while True:
                time.sleep(5)
                new_version, new_text = _fetch()
                if new_version != version or new_text != text:
                    version, text = new_version, new_text
                    sys.stdout.write(text + "\n")
                    sys.stdout.flush()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)
