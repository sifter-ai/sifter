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
from sifter import Sifter

# Env-level defaults (used in stdio mode)
_api_url = os.environ.get("SIFTER_BASE_URL", "http://localhost:8000")
_env_api_key = os.environ.get("SIFTER_API_KEY", "")

# Per-request API key (set by Bearer auth middleware in HTTP mode)
_request_api_key: contextvars.ContextVar[str] = contextvars.ContextVar(
    "sifter_request_api_key", default=""
)

mcp = FastMCP("sifter")


def _get_client() -> Sifter:
    api_key = _request_api_key.get() or _env_api_key
    if not api_key:
        raise RuntimeError("SIFTER_API_KEY environment variable is required")
    return Sifter(api_url=_api_url, api_key=api_key)


@mcp.tool()
def list_sifts(limit: int = 50, offset: int = 0) -> dict:
    """List sifts with their name, instructions, and document/record counts.

    Args:
        limit: Maximum number of sifts to return (default 50, max 200)
        offset: Number of sifts to skip for pagination
    """
    page = _get_client().list_sifts(limit=min(limit, 200), offset=offset)
    return {"items": page.items, "total": page.total, "limit": page.limit, "offset": page.offset}


@mcp.tool()
def get_sift(sift_id: str) -> dict:
    """Get sift metadata and inferred extraction schema for a specific sift."""
    handle = _get_client().get_sift(sift_id)
    return handle._data if hasattr(handle, "_data") else {"sift_id": sift_id}


@mcp.tool()
def list_records(sift_id: str, limit: int = 20, offset: int = 0, cursor: str = "") -> dict:
    """Get extracted records from a sift.

    Args:
        sift_id: The sift identifier
        limit: Maximum number of records to return (default 20, max 100)
        offset: Number of records to skip (ignored when cursor is provided)
        cursor: Opaque pagination cursor from a previous call's next_cursor field
    """
    limit = min(limit, 100)
    page = _get_client().get_sift(sift_id).records(
        limit=limit,
        offset=offset,
        cursor=cursor or None,
    )
    return {"items": page.items, "total": page.total, "limit": page.limit, "offset": page.offset, "next_cursor": page.next_cursor}


@mcp.tool()
def query_sift(sift_id: str, natural_language: str) -> list[dict]:
    """Run a natural language query over a sift's extracted records.

    Args:
        sift_id: The sift identifier
        natural_language: The question to answer (e.g. "What is the total by client?")
    """
    return _get_client().get_sift(sift_id).query(natural_language)


@mcp.tool()
def list_folders(limit: int = 100, offset: int = 0) -> dict:
    """List folders with their name and document count.

    Args:
        limit: Maximum number of folders to return (default 100, max 200)
        offset: Number of folders to skip for pagination
    """
    page = _get_client().list_folders(limit=min(limit, 200), offset=offset)
    return {"items": page.items, "total": page.total, "limit": page.limit, "offset": page.offset}


@mcp.tool()
def get_folder(folder_path: str) -> dict:
    """Get folder metadata, linked sifts, and document list for a specific folder.

    Args:
        folder_path: Folder path (e.g. '/invoices/2025')
    """
    handle = _get_client().get_folder(folder_path)
    docs_page = handle.documents(limit=200)
    sifts_page = handle.sifts(limit=200)
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
def get_record_citations(sift_id: str, record_id: str) -> dict:
    """Get per-field citation map for a record (page, bbox, source text for each field).

    Args:
        sift_id: The sift identifier
        record_id: The record identifier
    """
    return _get_client().get_sift(sift_id).record(record_id).citations()


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------

@mcp.tool()
def create_sift(name: str, instructions: str, folder_path: str = "") -> dict:
    """Create a new sift with the given extraction instructions.

    Args:
        name: Human-readable sift name
        instructions: Natural language extraction instructions (e.g. "client, date, total")
        folder_path: Optional folder path to link (e.g. '/invoices/2025'); created if it doesn't exist
    """
    client = _get_client()
    handle = client.create_sift(name=name, instructions=instructions)
    if folder_path:
        folder = client.create_folder(folder_path)
        folder.add_sift(handle)
    return handle._data


@mcp.tool()
def update_sift(sift_id: str, name: str = "", instructions: str = "") -> dict:
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
    handle = _get_client().get_sift(sift_id)
    handle.update(**kwargs)
    return handle._data


@mcp.tool()
def delete_sift(sift_id: str) -> dict:
    """Delete a sift and all its records.

    Args:
        sift_id: The sift identifier
    """
    _get_client().get_sift(sift_id).delete()
    return {"deleted": True}


@mcp.tool()
def upload_document(folder_path: str, filename: str, content_base64: str) -> dict:
    """Upload a document to a folder. The folder is created if it doesn't exist.
    The document will be processed by all sifts linked to the folder.

    Args:
        folder_path: Target folder path (e.g. '/invoices/2025'). Created if it doesn't exist.
        filename: Original filename (used for display)
        content_base64: Base64-encoded file bytes
    """
    import base64
    import httpx

    client = _get_client()
    folder = client.create_folder(folder_path)
    raw = base64.b64decode(content_base64)
    with httpx.Client(timeout=300.0) as http:
        r = http.post(
            f"{_api_url}/api/folders/{folder.id}/documents",
            headers=client._auth_headers(),
            files={"file": (filename, raw, "application/octet-stream")},
        )
        r.raise_for_status()
        return r.json()


@mcp.tool()
def run_extraction(document_id: str, sift_id: str) -> dict:
    """Enqueue extraction for a document on a specific sift.

    Args:
        document_id: The document identifier
        sift_id: The sift to extract with
    """
    return _get_client().get_sift(sift_id).extract(document_id)


@mcp.tool()
def get_extraction_status(document_id: str, sift_id: str) -> dict:
    """Check extraction status for a document on a sift.

    Args:
        document_id: The document identifier
        sift_id: The sift identifier

    Returns:
        {"status": "queued|running|completed|failed", "error": "..." (on failure)}
    """
    status = _get_client().get_sift(sift_id).extraction_status(document_id)
    return {"status": status}


# ---------------------------------------------------------------------------
# Structured-query tools
# ---------------------------------------------------------------------------

@mcp.tool()
def find_records(
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
    page = _get_client().get_sift(sift_id).find(
        filter=filter,
        sort=sort or None,
        limit=min(limit, 200),
        cursor=cursor or None,
    )
    return {"records": page.items, "next_cursor": page.next_cursor, "total": page.total}


@mcp.tool()
def aggregate_sift(sift_id: str, pipeline: list) -> list:
    """Run a MongoDB aggregation pipeline against a sift's records.

    Args:
        sift_id: The sift identifier
        pipeline: MongoDB aggregation pipeline stages
                  e.g. [{"$group": {"_id": "$client", "total": {"$sum": "$total"}}}]

    Returns:
        Array of aggregated rows
    """
    return _get_client().get_sift(sift_id).aggregate(pipeline)


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------

@mcp.resource("sift://{sift_id}/records")
def sift_records_resource(sift_id: str) -> str:
    """First 100 extracted records for a sift. Check next_cursor to fetch more."""
    import json
    page = _get_client().get_sift(sift_id).records(limit=100)
    return json.dumps(
        {"items": page.items, "total": page.total, "next_cursor": page.next_cursor},
        default=str,
        indent=2,
    )
