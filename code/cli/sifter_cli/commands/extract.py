from __future__ import annotations

import time
from pathlib import Path
from typing import Optional

import typer
from rich.progress import Progress, SpinnerColumn, TextColumn
from sifter import Sifter
from sifter.errors import SifterError

from sifter_cli import config as cfg
from sifter_cli.output import auto_format, console, err_console

app = typer.Typer(help="Upload files and run extraction")


def _client(api_url: Optional[str], api_key: Optional[str], profile: str) -> Sifter:
    url, key = cfg.resolve(api_url, api_key, profile)
    return Sifter(api_url=url, api_key=key)


@app.callback(invoke_without_command=True)
def extract(
    ctx: typer.Context,
    paths: list[Path] = typer.Argument(..., exists=True),
    instructions: str = typer.Option(..., "--instructions", "-i"),
    sift_id: Optional[str] = typer.Option(None, "--sift"),
    wait: bool = typer.Option(True, "--wait/--no-wait"),
    as_json: bool = typer.Option(False, "--json/--table"),
    api_url: Optional[str] = typer.Option(None, "--api-url"),
    api_key: Optional[str] = typer.Option(None, "--api-key"),
    profile: str = typer.Option("default", "--profile"),
    quiet: bool = typer.Option(False, "--quiet"),
) -> None:
    """Upload file(s) and run extraction. Creates a temporary sift if --sift is not provided."""
    if ctx.invoked_subcommand:
        return

    client = _client(api_url, api_key, profile)

    collect_files = []
    for p in paths:
        if p.is_file():
            collect_files.append(p)
        else:
            collect_files.extend(sorted(p.rglob("*")))
    collect_files = [f for f in collect_files if f.is_file()]

    if not collect_files:
        err_console.print("[yellow]No files found.[/yellow]")
        raise typer.Exit(1)

    try:
        # resolve or create sift
        if sift_id:
            sift = client.sift(sift_id)
        else:
            sift = client.create_sift(
                name=f"cli-extract-{int(time.time())}",
                instructions=instructions,
            )
            if not quiet:
                console.print(f"Created sift [bold]{sift.id}[/bold]")

        # create temp folder and upload
        folder = client.create_folder(name=f"cli-upload-{sift.id[:8]}")
        doc_ids: list[str] = []
        for f in collect_files:
            if not quiet:
                console.print(f"  Uploading [cyan]{f.name}[/cyan]…")
            doc = folder.upload(str(f))
            doc_ids.append(doc["id"])

        # trigger extraction
        task_ids = []
        for doc_id in doc_ids:
            result = sift.extract(doc_id)
            task_ids.append(result["task_id"])

        if not wait:
            auto_format({"sift_id": sift.id, "task_ids": task_ids}, as_json)
            return

        # poll until done
        with Progress(SpinnerColumn(), TextColumn("{task.description}"), disable=quiet) as progress:
            tasks = {
                doc_id: progress.add_task(f"{doc_id[:8]}… queued", total=None)
                for doc_id in doc_ids
            }
            pending = set(doc_ids)
            while pending:
                time.sleep(2)
                done = set()
                for doc_id in list(pending):
                    status = sift.extraction_status(doc_id)
                    progress.update(tasks[doc_id], description=f"{doc_id[:8]}… {status}")
                    if status in ("done", "error"):
                        done.add(doc_id)
                pending -= done

        records = sift.records()
        auto_format([r.get("extracted_data", r) for r in records], as_json)

    except SifterError as e:
        err_console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(2)
    except KeyboardInterrupt:
        raise typer.Exit(130)
