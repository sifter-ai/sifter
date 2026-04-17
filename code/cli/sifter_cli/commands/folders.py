from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from sifter import Sifter
from sifter.errors import SifterError

from sifter_cli import config as cfg
from sifter_cli.output import auto_format, console, err_console

app = typer.Typer(help="Manage folders and upload documents")


def _client(api_url: Optional[str], api_key: Optional[str], profile: str) -> Sifter:
    url, key = cfg.resolve(api_url, api_key, profile)
    return Sifter(api_url=url, api_key=key)


@app.command("list")
def list_folders(
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    as_json: bool = typer.Option(False, "--json/--table"),
    limit: int = typer.Option(50, "--limit"),
) -> None:
    """List all folders."""
    client = _client(api_url, api_key, profile)
    folders = client.list_folders(limit=limit)
    data = [{"id": f.id, "name": f.name, "document_count": f.document_count} for f in folders]
    auto_format(data, as_json)


@app.command("create")
def create_folder(
    name: str = typer.Option(..., "--name", "-n"),
    description: str = typer.Option("", "--description"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    as_json: bool = typer.Option(False, "--json/--table"),
) -> None:
    """Create a new folder."""
    client = _client(api_url, api_key, profile)
    try:
        folder = client.create_folder(name=name, description=description)
        auto_format({"id": folder.id, "name": folder.name}, as_json)
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("upload")
def upload(
    folder_id: str = typer.Argument(...),
    path: Path = typer.Argument(..., exists=True),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    quiet: bool = typer.Option(False, "--quiet"),
) -> None:
    """Upload a file or directory to a folder."""
    client = _client(api_url, api_key, profile)
    folder = client.folder(folder_id)
    files = [path] if path.is_file() else sorted(path.rglob("*"))
    files = [f for f in files if f.is_file()]
    if not files:
        err_console.print("[yellow]No files found.[/yellow]")
        raise typer.Exit(1)
    try:
        for f in files:
            if not quiet:
                console.print(f"  Uploading [cyan]{f.name}[/cyan]…")
            folder.upload(str(f))
        console.print(f"[green]Uploaded {len(files)} file(s).[/green]")
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("link")
def link(
    folder_id: str = typer.Argument(...),
    sift_id: str = typer.Argument(...),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Link a folder to a sift (set default_folder_id)."""
    client = _client(api_url, api_key, profile)
    try:
        client.sift(sift_id).update(default_folder_id=folder_id)
        console.print(f"[green]Linked folder {folder_id} → sift {sift_id}.[/green]")
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)
