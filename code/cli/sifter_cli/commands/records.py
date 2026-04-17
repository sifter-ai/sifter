from __future__ import annotations

import json
from typing import Optional

import typer
from sifter import Sifter
from sifter.errors import SifterError

from sifter_cli import config as cfg
from sifter_cli.output import auto_format, console, err_console

app = typer.Typer(help="Query and export records")


def _client(api_url: Optional[str], api_key: Optional[str], profile: str) -> Sifter:
    url, key = cfg.resolve(api_url, api_key, profile)
    return Sifter(api_url=url, api_key=key)


@app.command("list")
def list_records(
    sift_id: str = typer.Argument(...),
    limit: int = typer.Option(50, "--limit"),
    cursor: Optional[str] = typer.Option(None, "--cursor"),
    filter_json: Optional[str] = typer.Option(None, "--filter"),
    as_json: bool = typer.Option(False, "--json/--table"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """List records from a sift."""
    client = _client(api_url, api_key, profile)
    try:
        filter_dict = json.loads(filter_json) if filter_json else None
        sift = client.sift(sift_id)
        if filter_dict or cursor:
            page = sift.find(filter=filter_dict, limit=limit, cursor=cursor)
            data = page.records
        else:
            data = sift.records(limit=limit)
        rows = [r.get("extracted_data", r) if isinstance(r, dict) else r for r in data]
        auto_format(rows, as_json)
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("query")
def query_records(
    sift_id: str = typer.Argument(...),
    question: str = typer.Argument(...),
    as_json: bool = typer.Option(False, "--json/--table"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Run a natural-language query against a sift."""
    client = _client(api_url, api_key, profile)
    try:
        sift = client.sift(sift_id)
        result = sift.query(question)
        results = result.get("results") or []
        auto_format(results, as_json)
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)


@app.command("export")
def export_records(
    sift_id: str = typer.Argument(...),
    output: str = typer.Option("records.csv", "--output", "-o"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
) -> None:
    """Export records as CSV."""
    client = _client(api_url, api_key, profile)
    try:
        sift = client.sift(sift_id)
        csv_data = sift.export_csv()
        with open(output, "w", encoding="utf-8") as f:
            f.write(csv_data)
        console.print(f"[green]Exported to {output}[/green]")
    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)
