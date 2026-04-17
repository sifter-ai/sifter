from __future__ import annotations

import json
import sys
from typing import Any

from rich.console import Console
from rich.table import Table

console = Console()
err_console = Console(stderr=True)


def is_tty() -> bool:
    return sys.stdout.isatty()


def print_json(data: Any) -> None:
    console.print_json(json.dumps(data))


def print_table(rows: list[dict[str, Any]], title: str | None = None) -> None:
    if not rows:
        console.print("[dim]No results.[/dim]")
        return
    t = Table(title=title, show_header=True, header_style="bold cyan")
    cols = list(rows[0].keys())
    for c in cols:
        t.add_column(c)
    for row in rows:
        t.add_row(*[str(row.get(c, "")) for c in cols])
    console.print(t)


def print_record(data: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print_json(data)
    else:
        for k, v in data.items():
            console.print(f"[bold]{k}[/bold]: {v}")


def auto_format(data: Any, as_json: bool | None = None) -> None:
    use_json = as_json if as_json is not None else not is_tty()
    if use_json:
        print_json(data)
    elif isinstance(data, list):
        print_table(data)
    else:
        print_record(data, as_json=False)
