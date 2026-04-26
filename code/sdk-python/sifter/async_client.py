"""
Sifter Python SDK — async client

Usage:
    from sifter import AsyncSifter

    async with AsyncSifter(api_key="sk-...") as s:
        sift = await s.create_sift("Invoices", "client, date, total")
        await sift.upload("./invoices/")
        await sift.wait()
        records = await sift.records()
"""

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Optional, Type, TypeVar, Union

import httpx

from .client import Page, _matches_pattern

M = TypeVar("M")


class AsyncRecordHandle:
    def __init__(self, record_id: str, sift_id: str, client: "AsyncSifter"):
        self._record_id = record_id
        self._sift_id = sift_id
        self._client = client

    async def citations(self) -> dict[str, Any]:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/sifts/{self._sift_id}/records/{self._record_id}/citations",
                headers=self._client._auth_headers(),
            )
            r.raise_for_status()
            return r.json()


class AsyncDocumentHandle:
    def __init__(self, document_id: str, client: "AsyncSifter"):
        self._document_id = document_id
        self._client = client

    async def page_count(self) -> int:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/documents/{self._document_id}/pages",
                headers=self._client._auth_headers(),
            )
            r.raise_for_status()
            return r.json()["total"]

    async def page_image(self, page: int = 1, dpi: int = 150) -> bytes:
        async with httpx.AsyncClient(timeout=60.0) as http:
            r = await http.get(
                f"{self._client.api_url}/api/documents/{self._document_id}/pages/{page}/image",
                headers=self._client._auth_headers(),
                params={"dpi": dpi},
            )
            r.raise_for_status()
            return r.content


class AsyncSiftHandle:
    def __init__(self, data: dict, client: "AsyncSifter"):
        self._data = data
        self._client = client
        self._callbacks: list[tuple[str, Callable]] = []

    @property
    def id(self) -> str:
        return self._data["id"]

    @property
    def name(self) -> str:
        return self._data.get("name", "")

    @property
    def instructions(self) -> str:
        return self._data.get("instructions", "")

    @property
    def status(self) -> str:
        return self._data.get("status", "")

    def on(self, event: Union[str, list[str]], callback: Callable) -> "AsyncSiftHandle":
        if isinstance(event, str):
            event = [event]
        for e in event:
            self._callbacks.append((e, callback))
        return self

    def _fire_event(self, event_name: str, *args) -> None:
        for pattern, cb in self._callbacks:
            if _matches_pattern(pattern, event_name):
                try:
                    cb(*args)
                except Exception:
                    pass

    async def upload(
        self,
        source: "str | Path | bytes",
        filename: "str | None" = None,
        on_conflict: str = "fail",
    ) -> "AsyncSiftHandle":
        headers = self._client._auth_headers()
        if isinstance(source, bytes):
            if not filename:
                raise ValueError("filename is required when uploading bytes")
            async with httpx.AsyncClient(timeout=300.0) as http:
                r = await http.post(
                    f"{self._client.api_url}/api/sifts/{self.id}/upload",
                    headers=headers,
                    files=[("files", (filename, source, "application/octet-stream"))],
                    data={"on_conflict": on_conflict},
                )
                r.raise_for_status()
            return self
        p = Path(source)
        files_to_upload = [f for f in p.iterdir() if f.is_file() and not f.name.startswith(".")] if p.is_dir() else [p]
        async with httpx.AsyncClient(timeout=300.0) as http:
            for f in files_to_upload:
                r = await http.post(
                    f"{self._client.api_url}/api/sifts/{self.id}/upload",
                    headers=headers,
                    files=[("files", (f.name, open(f, "rb"), "application/octet-stream"))],
                    data={"on_conflict": on_conflict},
                )
                r.raise_for_status()
        return self

    async def wait(self, poll_interval: float = 2.0, timeout: float = 300.0) -> "AsyncSiftHandle":
        start = time.time()
        seen_done: set[str] = set()
        while True:
            async with httpx.AsyncClient() as http:
                r = await http.get(
                    f"{self._client.api_url}/api/sifts/{self.id}",
                    headers=self._client._auth_headers(),
                )
                r.raise_for_status()
                data = r.json()
            self._data = data
            current_status = data.get("status", "")
            if self._callbacks:
                await self._fire_document_callbacks(seen_done)
            if current_status not in ("indexing",):
                if current_status == "active":
                    self._fire_event("sift.completed", self.id)
                elif current_status == "error":
                    self._fire_event("sift.error", self.id, data.get("error"))
                return self
            if time.time() - start > timeout:
                raise TimeoutError(f"Sift did not complete within {timeout}s")
            await asyncio.sleep(poll_interval)

    async def _fire_document_callbacks(self, seen_done: set) -> None:
        try:
            async with httpx.AsyncClient() as http:
                r = await http.get(
                    f"{self._client.api_url}/api/sifts/{self.id}/records",
                    headers=self._client._auth_headers(),
                )
                if r.status_code == 200:
                    for record in r.json():
                        doc_id = record.get("document_id") or record.get("id", "")
                        if doc_id and doc_id not in seen_done:
                            seen_done.add(doc_id)
                            self._fire_event("sift.document.processed", doc_id, record)
        except Exception:
            pass

    async def records(self, model: Optional[Type[M]] = None) -> list:
        items: list = []
        cursor: Optional[str] = None
        offset = 0
        while True:
            params: dict = {"limit": 100}
            if cursor is not None:
                params["cursor"] = cursor
            else:
                params["offset"] = offset
            async with httpx.AsyncClient() as http:
                r = await http.get(
                    f"{self._client.api_url}/api/sifts/{self.id}/records",
                    headers=self._client._auth_headers(),
                    params=params,
                )
                r.raise_for_status()
                data = r.json()
            raw_items: list = data.get("items", []) if isinstance(data, dict) else data
            if model is not None:
                raw_items = [model(**item.get("extracted_data", item)) for item in raw_items]
            items.extend(raw_items)
            total = data.get("total", 0) if isinstance(data, dict) else 0
            cursor = data.get("next_cursor") if isinstance(data, dict) else None
            if cursor:
                continue
            offset += len(raw_items)
            if not raw_items or offset >= total:
                break
        return items

    async def find(
        self,
        filter: Optional[dict] = None,
        sort: Optional[list] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
        project: Optional[dict] = None,
        model: Optional[Type[M]] = None,
    ) -> Page:
        params: dict = {"limit": limit}
        if filter:
            params["filter"] = json.dumps(filter)
        if sort:
            params["sort"] = json.dumps(sort)
        if cursor:
            params["cursor"] = cursor
        if project:
            params["project"] = json.dumps(project)
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/sifts/{self.id}/records",
                headers=self._client._auth_headers(),
                params=params,
            )
            r.raise_for_status()
            data = r.json()
        items: list = data.get("items", [])
        if model is not None:
            items = [model(**item.get("extracted_data", item)) for item in items]
        return Page(
            items=items,
            total=data.get("total", len(items)),
            limit=limit,
            offset=data.get("offset", 0),
            next_cursor=data.get("next_cursor"),
        )

    async def aggregate(self, pipeline: list[dict]) -> list[dict[str, Any]]:
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{self._client.api_url}/api/sifts/{self.id}/aggregate",
                headers=self._client._auth_headers(),
                json={"pipeline": pipeline},
            )
            r.raise_for_status()
            return r.json().get("results", [])

    async def records_count(self, filter: Optional[dict] = None) -> int:
        params: dict = {}
        if filter:
            params["filter"] = json.dumps(filter)
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/sifts/{self.id}/records/count",
                headers=self._client._auth_headers(),
                params=params,
            )
            r.raise_for_status()
            return r.json()["count"]

    async def records_by_ids(self, ids: list[str]) -> list[dict[str, Any]]:
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{self._client.api_url}/api/sifts/{self.id}/records/batch",
                headers=self._client._auth_headers(),
                json={"ids": ids},
            )
            r.raise_for_status()
            return r.json().get("items", [])

    async def query(self, nl_query: str, timeout: float = 120.0) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=timeout) as http:
            r = await http.post(
                f"{self._client.api_url}/api/sifts/{self.id}/query",
                headers=self._client._auth_headers(),
                json={"query": nl_query},
            )
            r.raise_for_status()
            return r.json().get("results", r.json())

    async def export_csv(self, output_path: "str | Path") -> None:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/sifts/{self.id}/records/csv",
                headers=self._client._auth_headers(),
            )
            r.raise_for_status()
            Path(output_path).write_text(r.text, encoding="utf-8")

    async def schema(self) -> dict[str, Any]:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/sifts/{self.id}/schema",
                headers=self._client._auth_headers(),
            )
            r.raise_for_status()
            return r.json()

    async def update(self, **kwargs) -> "AsyncSiftHandle":
        payload = {k: v for k, v in kwargs.items() if k in ("name", "instructions")}
        async with httpx.AsyncClient() as http:
            r = await http.patch(
                f"{self._client.api_url}/api/sifts/{self.id}",
                headers=self._client._auth_headers(),
                json=payload,
            )
            r.raise_for_status()
            self._data = r.json()
        return self

    async def delete(self) -> None:
        async with httpx.AsyncClient() as http:
            r = await http.delete(
                f"{self._client.api_url}/api/sifts/{self.id}",
                headers=self._client._auth_headers(),
            )
            r.raise_for_status()

    async def extract(self, document_id: str) -> dict:
        """Enqueue extraction for a single document on this sift."""
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{self._client.api_url}/api/sifts/{self.id}/extract",
                headers=self._client._auth_headers(),
                json={"document_id": document_id},
            )
            r.raise_for_status()
            return r.json()

    async def extraction_status(self, document_id: str) -> str:
        """Return extraction status for a document: queued|running|completed|failed."""
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/sifts/{self.id}/extraction-status",
                headers=self._client._auth_headers(),
                params={"document_id": document_id},
            )
            r.raise_for_status()
            return r.json()["status"]

    def record(self, record_id: str) -> AsyncRecordHandle:
        return AsyncRecordHandle(record_id=record_id, sift_id=self.id, client=self._client)


class AsyncFolderHandle:
    def __init__(self, data: dict, client: "AsyncSifter"):
        self._data = data
        self._client = client
        self._callbacks: list[tuple[str, Callable]] = []

    @property
    def id(self) -> str:
        return self._data["id"]

    @property
    def name(self) -> str:
        return self._data.get("name", "")

    @property
    def path(self) -> str:
        return self._data.get("path", "")

    def on(self, event: Union[str, list[str]], callback: Callable) -> "AsyncFolderHandle":
        if isinstance(event, str):
            event = [event]
        for e in event:
            self._callbacks.append((e, callback))
        return self

    def _fire_event(self, event_name: str, *args) -> None:
        for pattern, cb in self._callbacks:
            if _matches_pattern(pattern, event_name):
                try:
                    cb(*args)
                except Exception:
                    pass

    async def upload(
        self,
        source: "str | Path | bytes",
        filename: "str | None" = None,
        on_conflict: str = "fail",
    ) -> "AsyncFolderHandle":
        headers = self._client._auth_headers()
        if isinstance(source, bytes):
            if not filename:
                raise ValueError("filename is required when uploading bytes")
            async with httpx.AsyncClient(timeout=300.0) as http:
                r = await http.post(
                    f"{self._client.api_url}/api/folders/{self.id}/documents",
                    headers=headers,
                    files={"file": (filename, source, "application/octet-stream")},
                    data={"on_conflict": on_conflict},
                )
                r.raise_for_status()
                self._fire_event("folder.document.uploaded", r.json())
            return self
        p = Path(source)
        files_to_upload = [f for f in p.iterdir() if f.is_file() and not f.name.startswith(".")] if p.is_dir() else [p]
        async with httpx.AsyncClient(timeout=300.0) as http:
            for f in files_to_upload:
                r = await http.post(
                    f"{self._client.api_url}/api/folders/{self.id}/documents",
                    headers=headers,
                    files={"file": (f.name, open(f, "rb"), "application/octet-stream")},
                    data={"on_conflict": on_conflict},
                )
                r.raise_for_status()
                self._fire_event("folder.document.uploaded", r.json())
        return self

    async def documents(self, limit: int = 100, offset: int = 0) -> Page:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/folders/{self.id}/documents",
                headers=self._client._auth_headers(),
                params={"limit": limit, "offset": offset},
            )
            r.raise_for_status()
            data = r.json()
        if isinstance(data, list):
            return Page(items=data, total=len(data), limit=limit, offset=offset)
        return Page(
            items=data.get("items", []),
            total=data.get("total", 0),
            limit=data.get("limit", limit),
            offset=data.get("offset", offset),
            next_cursor=data.get("next_cursor"),
        )

    async def add_sift(self, sift: AsyncSiftHandle) -> "AsyncFolderHandle":
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{self._client.api_url}/api/folders/{self.id}/extractors",
                headers=self._client._auth_headers(),
                json={"sift_id": sift.id},
            )
            r.raise_for_status()
        return self

    async def remove_sift(self, sift: AsyncSiftHandle) -> "AsyncFolderHandle":
        async with httpx.AsyncClient() as http:
            r = await http.delete(
                f"{self._client.api_url}/api/folders/{self.id}/extractors/{sift.id}",
                headers=self._client._auth_headers(),
            )
            r.raise_for_status()
        return self

    async def sifts(self, limit: int = 100, offset: int = 0) -> Page:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self._client.api_url}/api/folders/{self.id}/extractors",
                headers=self._client._auth_headers(),
                params={"limit": limit, "offset": offset},
            )
            r.raise_for_status()
            data = r.json()
        if isinstance(data, list):
            return Page(items=data, total=len(data), limit=limit, offset=offset)
        return Page(
            items=data.get("items", []),
            total=data.get("total", 0),
            limit=data.get("limit", limit),
            offset=data.get("offset", offset),
            next_cursor=data.get("next_cursor"),
        )

    async def update(self, **kwargs) -> "AsyncFolderHandle":
        async with httpx.AsyncClient() as http:
            r = await http.patch(
                f"{self._client.api_url}/api/folders/{self.id}",
                headers=self._client._auth_headers(),
                json=kwargs,
            )
            r.raise_for_status()
            self._data = r.json()
        return self

    async def delete(self) -> None:
        async with httpx.AsyncClient() as http:
            r = await http.delete(
                f"{self._client.api_url}/api/folders/{self.id}",
                headers=self._client._auth_headers(),
            )
            r.raise_for_status()


class AsyncSifter:
    """
    Async Sifter SDK client. Use with `async with` or directly.

    Args:
        api_url: URL of the Sifter server (default: https://api.sifter.run)
        api_key: API key (or set SIFTER_API_KEY env var)

    Example:
        async with AsyncSifter(api_key="sk-...") as s:
            sift = await s.create_sift("Invoices", "client, date, total")
            await sift.upload("./invoices/")
            await sift.wait()
            records = await sift.records()
    """

    def __init__(self, api_url: str = "", api_key: str = ""):
        self.api_url = (api_url or os.environ.get("SIFTER_API_URL", "https://api.sifter.run")).rstrip("/")
        self.api_key = api_key or os.environ.get("SIFTER_API_KEY", "")

    async def __aenter__(self) -> "AsyncSifter":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    def _auth_headers(self) -> dict:
        if self.api_key:
            return {"X-API-Key": self.api_key}
        return {}

    # ---- Sift CRUD ----

    async def create_sift(self, name: str, instructions: str, description: str = "") -> AsyncSiftHandle:
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{self.api_url}/api/sifts",
                headers=self._auth_headers(),
                json={"name": name, "description": description, "instructions": instructions},
            )
            r.raise_for_status()
            return AsyncSiftHandle(r.json(), self)

    async def get_sift(self, sift_id: str) -> AsyncSiftHandle:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self.api_url}/api/sifts/{sift_id}",
                headers=self._auth_headers(),
            )
            r.raise_for_status()
            return AsyncSiftHandle(r.json(), self)

    async def list_sifts(self, limit: int = 100, offset: int = 0) -> Page:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self.api_url}/api/sifts",
                headers=self._auth_headers(),
                params={"limit": limit, "offset": offset},
            )
            r.raise_for_status()
            data = r.json()
        raw = data if isinstance(data, list) else data.get("items", [])
        items = [AsyncSiftHandle(item, self) for item in raw]
        total = len(raw) if isinstance(data, list) else data.get("total", 0)
        return Page(items=items, total=total, limit=data.get("limit", limit) if isinstance(data, dict) else limit,
                    offset=data.get("offset", offset) if isinstance(data, dict) else offset,
                    next_cursor=data.get("next_cursor") if isinstance(data, dict) else None)

    # ---- Folder CRUD ----

    async def create_folder(self, path: str) -> AsyncFolderHandle:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self.api_url}/api/folders/by-path",
                headers=self._auth_headers(),
                params={"path": path, "create": "true"},
            )
            r.raise_for_status()
            return AsyncFolderHandle(r.json(), self)

    async def get_folder(self, path: str) -> AsyncFolderHandle:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self.api_url}/api/folders/by-path",
                headers=self._auth_headers(),
                params={"path": path},
            )
            r.raise_for_status()
            return AsyncFolderHandle(r.json(), self)

    async def list_folders(self, limit: int = 200, offset: int = 0) -> Page:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self.api_url}/api/folders",
                headers=self._auth_headers(),
                params={"limit": limit, "offset": offset},
            )
            r.raise_for_status()
            data = r.json()
        raw = data if isinstance(data, list) else data.get("items", [])
        items = [AsyncFolderHandle(item, self) for item in raw]
        total = len(raw) if isinstance(data, list) else data.get("total", 0)
        return Page(items=items, total=total, limit=data.get("limit", limit) if isinstance(data, dict) else limit,
                    offset=data.get("offset", offset) if isinstance(data, dict) else offset,
                    next_cursor=data.get("next_cursor") if isinstance(data, dict) else None)

    def document(self, document_id: str) -> AsyncDocumentHandle:
        return AsyncDocumentHandle(document_id=document_id, client=self)

    # ---- One-liner ----

    async def sift(self, path: "str | Path", instructions: str) -> list[dict[str, Any]]:
        import time
        s = await self.create_sift(f"sift-temp-{int(time.time() * 1000)}", instructions)
        try:
            await s.upload(path, on_conflict="replace")
            await s.wait()
            return await s.records()
        finally:
            await s.delete()

    # ---- Webhooks ----

    async def register_hook(
        self,
        events: Union[str, list[str]],
        url: str,
        sift_id: Optional[str] = None,
    ) -> dict[str, Any]:
        if isinstance(events, str):
            events = [events]
        payload: dict[str, Any] = {"events": events, "url": url}
        if sift_id:
            payload["sift_id"] = sift_id
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"{self.api_url}/api/webhooks",
                headers=self._auth_headers(),
                json=payload,
            )
            r.raise_for_status()
            return r.json()

    async def list_hooks(self, limit: int = 100, offset: int = 0) -> Page:
        async with httpx.AsyncClient() as http:
            r = await http.get(
                f"{self.api_url}/api/webhooks",
                headers=self._auth_headers(),
                params={"limit": limit, "offset": offset},
            )
            r.raise_for_status()
            data = r.json()
        if isinstance(data, list):
            return Page(items=data, total=len(data), limit=limit, offset=offset)
        return Page(
            items=data.get("items", []),
            total=data.get("total", 0),
            limit=data.get("limit", limit),
            offset=data.get("offset", offset),
            next_cursor=data.get("next_cursor"),
        )

    async def delete_hook(self, hook_id: str) -> None:
        async with httpx.AsyncClient() as http:
            r = await http.delete(
                f"{self.api_url}/api/webhooks/{hook_id}",
                headers=self._auth_headers(),
            )
            r.raise_for_status()
