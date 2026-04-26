"""
MCP server for Sifter (v1.1 — read + write + structured query).

Two modes:
  stdio  — run via `uvx sifter-mcp` (Claude Desktop, Cursor)
  http   — mounted inside the Sifter FastAPI server at /mcp (cloud hosted)

Configuration:
  SIFTER_API_KEY  — API key (required for stdio mode; extracted from Bearer token in HTTP mode)
  SIFTER_BASE_URL — Sifter server URL (default http://localhost:8000)
"""

import contextvars
import os

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from sifter import AsyncSifter

# Env-level defaults (used in stdio mode)
_api_url = os.environ.get("SIFTER_BASE_URL", "http://localhost:8000")
_env_api_key = os.environ.get("SIFTER_API_KEY", "")

# Per-request API key (set by Bearer auth middleware in HTTP mode)
_request_api_key: contextvars.ContextVar[str] = contextvars.ContextVar(
    "sifter_request_api_key", default=""
)

# DNS rebinding protection: configurable via SIFTER_MCP_ALLOWED_HOSTS (comma-separated).
# When running behind a reverse proxy / Cloud Run with Bearer auth the protection is
# unnecessary; disable it by default so any Host header is accepted.
_raw_allowed_hosts = os.environ.get("SIFTER_MCP_ALLOWED_HOSTS", "")
if _raw_allowed_hosts.strip():
    _transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[h.strip() for h in _raw_allowed_hosts.split(",") if h.strip()],
    )
else:
    _transport_security = TransportSecuritySettings(enable_dns_rebinding_protection=False)

mcp = FastMCP("sifter", streamable_http_path="/", stateless_http=True, transport_security=_transport_security)


def _get_client() -> AsyncSifter:
    api_key = _request_api_key.get() or _env_api_key
    if not api_key:
        raise RuntimeError("SIFTER_API_KEY environment variable is required")
    return AsyncSifter(api_url=_api_url, api_key=api_key)


@mcp.tool()
async def list_sifts(limit: int = 50, offset: int = 0) -> dict:
    """List sifts with their name, instructions, and document/record counts.

    Args:
        limit: Maximum number of sifts to return (default 50, max 200)
        offset: Number of sifts to skip for pagination
    """
    async with _get_client() as client:
        page = await client.list_sifts(limit=min(limit, 200), offset=offset)
    return {"items": page.items, "total": page.total, "limit": page.limit, "offset": page.offset}


@mcp.tool()
async def get_sift(sift_id: str) -> dict:
    """Get sift metadata and inferred extraction schema for a specific sift."""
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
    return handle._data if hasattr(handle, "_data") else {"sift_id": sift_id}


@mcp.tool()
async def list_records(sift_id: str, limit: int = 20, offset: int = 0, cursor: str = "") -> dict:
    """Get extracted records from a sift.

    Args:
        sift_id: The sift identifier
        limit: Maximum number of records to return (default 20, max 100)
        offset: Number of records to skip (ignored when cursor is provided)
        cursor: Opaque pagination cursor from a previous call's next_cursor field
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        page = await handle.find(limit=min(limit, 100), cursor=cursor or None)
    return {"items": page.items, "total": page.total, "limit": page.limit, "offset": page.offset, "next_cursor": page.next_cursor}


@mcp.tool()
async def query_sift(sift_id: str, natural_language: str) -> list[dict]:
    """Run a natural language query over a sift's extracted records.

    Args:
        sift_id: The sift identifier
        natural_language: The question to answer (e.g. "What is the total by client?")
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        return await handle.query(natural_language)


@mcp.tool()
async def list_folders(limit: int = 100, offset: int = 0) -> dict:
    """List folders with their name and document count.

    Args:
        limit: Maximum number of folders to return (default 100, max 200)
        offset: Number of folders to skip for pagination
    """
    async with _get_client() as client:
        page = await client.list_folders(limit=min(limit, 200), offset=offset)
    return {"items": page.items, "total": page.total, "limit": page.limit, "offset": page.offset}


@mcp.tool()
async def get_folder(folder_path: str) -> dict:
    """Get folder metadata, linked sifts, and document list for a specific folder.

    Args:
        folder_path: Folder path (e.g. '/invoices/2025')
    """
    async with _get_client() as client:
        handle = await client.get_folder(folder_path)
        docs_page = await handle.documents(limit=200)
        sifts_page = await handle.sifts(limit=200)
    return {
        "path": handle.path,
        "id": handle.id,
        "name": handle.name,
        "documents": docs_page.items,
        "documents_total": docs_page.total,
        "sifts": sifts_page.items,
        "sifts_total": sifts_page.total,
    }


@mcp.tool()
async def get_record_citations(sift_id: str, record_id: str) -> dict:
    """Get per-field citation map for a record (page, bbox, source text for each field).

    Args:
        sift_id: The sift identifier
        record_id: The record identifier
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        return await handle.record(record_id).citations()


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def create_sift(name: str, instructions: str, folder_path: str = "") -> dict:
    """Create a new sift with the given extraction instructions.

    Args:
        name: Human-readable sift name
        instructions: Natural language extraction instructions (e.g. "client, date, total")
        folder_path: Optional folder path to link (e.g. '/invoices/2025'); created if it doesn't exist
    """
    async with _get_client() as client:
        handle = await client.create_sift(name=name, instructions=instructions)
        if folder_path:
            folder = await client.create_folder(folder_path)
            await folder.add_sift(handle)
    return handle._data


@mcp.tool()
async def update_sift(sift_id: str, name: str = "", instructions: str = "") -> dict:
    """Update an existing sift's name or instructions.

    Args:
        sift_id: The sift identifier
        name: New name (leave empty to keep current)
        instructions: New instructions (leave empty to keep current)
    """
    kwargs: dict = {}
    if name:
        kwargs["name"] = name
    if instructions:
        kwargs["instructions"] = instructions
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        await handle.update(**kwargs)
    return handle._data


@mcp.tool()
async def delete_sift(sift_id: str) -> dict:
    """Delete a sift and all its records.

    Args:
        sift_id: The sift identifier
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        await handle.delete()
    return {"deleted": True}


@mcp.tool()
async def upload_document(folder_path: str, filename: str, content_base64: str) -> dict:
    """Upload a document to a folder. The folder is created if it doesn't exist.
    The document will be processed by all sifts linked to the folder.

    Args:
        folder_path: Target folder path (e.g. '/invoices/2025'). Created if it doesn't exist.
        filename: Original filename (used for display)
        content_base64: Base64-encoded file bytes
    """
    import base64
    import httpx

    async with _get_client() as client:
        folder = await client.create_folder(folder_path)
        raw = base64.b64decode(content_base64)
        async with httpx.AsyncClient(timeout=300.0) as http:
            r = await http.post(
                f"{_api_url}/api/folders/{folder.id}/documents",
                headers=client._auth_headers(),
                files={"file": (filename, raw, "application/octet-stream")},
            )
            r.raise_for_status()
            return r.json()


@mcp.tool()
async def run_extraction(document_id: str, sift_id: str) -> dict:
    """Enqueue extraction for a document on a specific sift.

    Args:
        document_id: The document identifier
        sift_id: The sift to extract with
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        return await handle.extract(document_id)


@mcp.tool()
async def get_extraction_status(document_id: str, sift_id: str) -> dict:
    """Check extraction status for a document on a sift.

    Args:
        document_id: The document identifier
        sift_id: The sift identifier

    Returns:
        {"status": "queued|running|completed|failed", "error": "..." (on failure)}
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        status = await handle.extraction_status(document_id)
    return {"status": status}


# ---------------------------------------------------------------------------
# Structured-query tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def find_records(
    sift_id: str,
    filter: dict,
    sort: list = None,
    limit: int = 50,
    cursor: str = "",
) -> dict:
    """Filter records with structured criteria (no LLM roundtrip).

    Args:
        sift_id: The sift identifier
        filter: Mongo-subset filter dict e.g. {"total": {"$gt": 1000}}
        sort: Optional sort spec e.g. [["date", -1]]
        limit: Max records to return (default 50)
        cursor: Opaque pagination cursor from a previous call

    Returns:
        {"records": [...], "next_cursor": "..." | null}
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        page = await handle.find(
            filter=filter,
            sort=sort or None,
            limit=min(limit, 200),
            cursor=cursor or None,
        )
    return {"records": page.items, "next_cursor": page.next_cursor, "total": page.total}


@mcp.tool()
async def aggregate_sift(sift_id: str, pipeline: list) -> list:
    """Run a MongoDB aggregation pipeline against a sift's records.

    Args:
        sift_id: The sift identifier
        pipeline: MongoDB aggregation pipeline stages
                  e.g. [{"$group": {"_id": "$client", "total": {"$sum": "$total"}}}]

    Returns:
        Array of aggregated rows
    """
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        return await handle.aggregate(pipeline)


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------

@mcp.resource("sift://{sift_id}/records")
async def sift_records_resource(sift_id: str) -> str:
    """First 100 extracted records for a sift. Check next_cursor to fetch more."""
    import json
    async with _get_client() as client:
        handle = await client.get_sift(sift_id)
        page = await handle.find(limit=100)
    return json.dumps(
        {"items": page.items, "total": page.total, "next_cursor": page.next_cursor},
        default=str,
        indent=2,
    )
