"""
Unit tests for the SDK client and webhook pattern matching.
httpx calls are intercepted with respx so no real server is needed.
"""
import json
import pytest
import respx
import httpx

from sifter.services.webhook_service import _matches_pattern
from sifter import FolderHandle, SiftHandle, Sifter


# ───────────────────────────────────────────
# Wildcard pattern matching
# ───────────────────────────────────────────

@pytest.mark.parametrize("pattern,event,expected", [
    # Exact match
    ("sift.document.processed", "sift.document.processed", True),
    ("sift.completed",           "sift.completed",           True),
    # Single-segment wildcard
    ("sift.*",   "sift.completed",           True),
    ("sift.*",   "sift.error",               True),
    ("sift.*",   "folder.document.uploaded", False),
    ("sift.*",   "sift.document.processed",  False),  # 3 segments, * only matches 1
    # Double-segment wildcard
    ("sift.**",  "sift.document.processed",  True),
    ("sift.**",  "sift.completed",           True),
    ("sift.**",  "folder.document.uploaded", False),
    # Global wildcard — bare * or ** catches everything
    ("**",       "sift.document.processed",  True),
    ("**",       "folder.document.uploaded", True),
    ("*",        "sift.completed",           True),
    ("*",        "sift.document.processed",  True),
    ("*",        "folder.document.uploaded", True),
    # No match
    ("folder.*", "sift.completed",           False),
    ("folder.document.*", "folder.document.uploaded", True),
    ("folder.document.*", "sift.document.processed",  False),
])
def test_matches_pattern(pattern, event, expected):
    assert _matches_pattern(pattern, event) == expected


# ───────────────────────────────────────────
# SDK: Sifter client
# ───────────────────────────────────────────

BASE = "http://localhost:8000"


def make_client(api_key="sk-test"):
    return Sifter(api_url=BASE, api_key=api_key)


@respx.mock
def test_create_sift():
    payload = {"id": "abc123", "name": "Invoices", "instructions": "Extract: x", "status": "active"}
    respx.post(f"{BASE}/api/sifts").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    sift = s.create_sift("Invoices", "Extract: x")

    assert isinstance(sift, SiftHandle)
    assert sift.id == "abc123"
    assert sift.name == "Invoices"
    assert sift.status == "active"


@respx.mock
def test_get_sift():
    payload = {"id": "abc123", "name": "Invoices", "instructions": "Extract: x", "status": "active"}
    respx.get(f"{BASE}/api/sifts/abc123").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    sift = s.get_sift("abc123")
    assert sift.id == "abc123"


@respx.mock
def test_list_sifts():
    payload = [{"id": "1"}, {"id": "2"}]
    respx.get(f"{BASE}/api/sifts").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    sifts = s.list_sifts()
    assert len(sifts) == 2


@respx.mock
def test_sift_update():
    payload = {"id": "x1", "name": "New", "instructions": "Extract: y", "status": "active"}
    respx.patch(f"{BASE}/api/sifts/x1").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    handle = SiftHandle({"id": "x1", "name": "Old", "instructions": "Extract: x", "status": "active"}, s)
    handle.update(name="New", instructions="Extract: y")
    assert handle.name == "New"


@respx.mock
def test_sift_delete():
    respx.delete(f"{BASE}/api/sifts/x1").mock(return_value=httpx.Response(204))

    s = make_client()
    handle = SiftHandle({"id": "x1"}, s)
    handle.delete()  # should not raise


@respx.mock
def test_sift_records():
    records = [{"client": "Acme"}, {"client": "Globex"}]
    respx.get(f"{BASE}/api/sifts/x1/records").mock(return_value=httpx.Response(200, json=records))

    s = make_client()
    handle = SiftHandle({"id": "x1"}, s)
    result = handle.records()
    assert len(result) == 2


@respx.mock
def test_sift_query():
    respx.post(f"{BASE}/api/sifts/x1/query").mock(
        return_value=httpx.Response(200, json={"results": [{"total": 999}]})
    )

    s = make_client()
    handle = SiftHandle({"id": "x1"}, s)
    result = handle.query("total amount")
    assert result[0]["total"] == 999


@respx.mock
def test_sift_export_csv(tmp_path):
    respx.get(f"{BASE}/api/sifts/x1/records/csv").mock(
        return_value=httpx.Response(200, text="client,amount\nAcme,100\n")
    )

    s = make_client()
    handle = SiftHandle({"id": "x1"}, s)
    out = tmp_path / "out.csv"
    handle.export_csv(out)
    assert "Acme" in out.read_text()


@respx.mock
def test_sift_wait_completes():
    # First poll: indexing; second poll: active
    responses = [
        httpx.Response(200, json={"id": "x1", "status": "indexing", "error": None}),
        httpx.Response(200, json={"id": "x1", "status": "active", "error": None}),
    ]
    respx.get(f"{BASE}/api/sifts/x1").mock(side_effect=responses)
    respx.get(f"{BASE}/api/sifts/x1/records").mock(return_value=httpx.Response(200, json=[]))

    s = make_client()
    handle = SiftHandle({"id": "x1", "status": "indexing"}, s)
    handle.wait(poll_interval=0)
    assert handle.status == "active"


@respx.mock
def test_sift_on_callback_fires():
    # Simulate a document.processed event during wait
    responses = [
        httpx.Response(200, json={"id": "x1", "status": "indexing"}),
        httpx.Response(200, json={"id": "x1", "status": "active"}),
    ]
    records_payload = [{"id": "doc1", "document_id": "doc1", "client": "Acme"}]

    respx.get(f"{BASE}/api/sifts/x1").mock(side_effect=responses)
    respx.get(f"{BASE}/api/sifts/x1/records").mock(
        return_value=httpx.Response(200, json=records_payload)
    )

    fired = []
    s = make_client()
    handle = SiftHandle({"id": "x1", "status": "indexing"}, s)
    handle.on("sift.document.processed", lambda doc_id, record: fired.append(doc_id))
    handle.on("sift.completed", lambda sift_id: fired.append("completed"))
    handle.wait(poll_interval=0)

    assert "doc1" in fired
    assert "completed" in fired


@respx.mock
def test_one_liner_sift(tmp_path):
    creation = {"id": "tmp1", "name": "sift-temp", "instructions": "Extract: x", "status": "active"}
    respx.post(f"{BASE}/api/sifts").mock(return_value=httpx.Response(200, json=creation))
    respx.post(f"{BASE}/api/sifts/tmp1/upload").mock(return_value=httpx.Response(200, json={}))
    respx.get(f"{BASE}/api/sifts/tmp1").mock(
        return_value=httpx.Response(200, json={"id": "tmp1", "status": "active"})
    )
    respx.get(f"{BASE}/api/sifts/tmp1/records").mock(
        return_value=httpx.Response(200, json=[{"client": "X"}])
    )
    respx.delete(f"{BASE}/api/sifts/tmp1").mock(return_value=httpx.Response(204))

    # Create a temp file to upload
    f = tmp_path / "doc.txt"
    f.write_text("invoice")

    s = make_client()
    records = s.sift(str(tmp_path), "Extract: x")
    assert records == [{"client": "X"}]


# ───────────────────────────────────────────
# SDK: FolderHandle
# ───────────────────────────────────────────

@respx.mock
def test_create_folder():
    payload = {"id": "f1", "name": "Contracts", "document_count": 0}
    respx.post(f"{BASE}/api/folders").mock(return_value=httpx.Response(201, json=payload))

    s = make_client()
    folder = s.create_folder("Contracts")
    assert isinstance(folder, FolderHandle)
    assert folder.id == "f1"
    assert folder.name == "Contracts"


@respx.mock
def test_get_folder():
    payload = {"id": "f1", "name": "Contracts", "document_count": 0}
    respx.get(f"{BASE}/api/folders/f1").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    folder = s.get_folder("f1")
    assert folder.id == "f1"


@respx.mock
def test_list_folders():
    payload = [{"id": "f1"}, {"id": "f2"}]
    respx.get(f"{BASE}/api/folders").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    folders = s.list_folders()
    assert len(folders) == 2


@respx.mock
def test_folder_update():
    payload = {"id": "f1", "name": "Final", "document_count": 0}
    respx.patch(f"{BASE}/api/folders/f1").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    folder = FolderHandle({"id": "f1", "name": "Draft"}, s)
    folder.update(name="Final")
    assert folder.name == "Final"


@respx.mock
def test_folder_delete():
    respx.delete(f"{BASE}/api/folders/f1").mock(return_value=httpx.Response(204))

    s = make_client()
    folder = FolderHandle({"id": "f1", "name": "F"}, s)
    folder.delete()  # should not raise


@respx.mock
def test_folder_documents():
    docs = [{"id": "d1", "filename": "a.pdf"}, {"id": "d2", "filename": "b.pdf"}]
    respx.get(f"{BASE}/api/folders/f1/documents").mock(return_value=httpx.Response(200, json=docs))

    s = make_client()
    folder = FolderHandle({"id": "f1", "name": "F"}, s)
    assert len(folder.documents()) == 2


@respx.mock
def test_folder_add_sift():
    respx.post(f"{BASE}/api/folders/f1/extractors").mock(
        return_value=httpx.Response(201, json={"id": "link1", "extraction_id": "s1", "folder_id": "f1"})
    )

    s = make_client()
    folder = FolderHandle({"id": "f1", "name": "F"}, s)
    sift = SiftHandle({"id": "s1"}, s)
    folder.add_sift(sift)  # should not raise


@respx.mock
def test_folder_remove_sift():
    respx.delete(f"{BASE}/api/folders/f1/extractors/s1").mock(return_value=httpx.Response(204))

    s = make_client()
    folder = FolderHandle({"id": "f1", "name": "F"}, s)
    sift = SiftHandle({"id": "s1"}, s)
    folder.remove_sift(sift)  # should not raise


@respx.mock
def test_folder_sifts():
    payload = [{"id": "link1", "extraction_id": "s1"}]
    respx.get(f"{BASE}/api/folders/f1/extractors").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    folder = FolderHandle({"id": "f1", "name": "F"}, s)
    links = folder.sifts()
    assert len(links) == 1
    assert links[0]["extraction_id"] == "s1"


@respx.mock
def test_folder_on_callback_fires(tmp_path):
    doc_payload = {"id": "d1", "filename": "invoice.txt", "enqueued_for": []}
    respx.post(f"{BASE}/api/folders/f1/documents").mock(
        return_value=httpx.Response(202, json=doc_payload)
    )

    f = tmp_path / "invoice.txt"
    f.write_text("content")

    fired = []
    s = make_client()
    folder = FolderHandle({"id": "f1", "name": "F"}, s)
    folder.on("folder.document.uploaded", lambda doc: fired.append(doc["filename"]))
    folder.upload(tmp_path)

    assert "invoice.txt" in fired


# ───────────────────────────────────────────
# SDK: Webhooks
# ───────────────────────────────────────────

@respx.mock
def test_register_hook():
    payload = {"id": "h1", "events": ["sift.*"], "url": "https://example.com/hook", "sift_id": None}
    respx.post(f"{BASE}/api/webhooks").mock(return_value=httpx.Response(201, json=payload))

    s = make_client()
    hook = s.register_hook(events="sift.*", url="https://example.com/hook")
    assert hook["id"] == "h1"
    assert "sift.*" in hook["events"]


@respx.mock
def test_register_hook_list_of_events():
    payload = {"id": "h2", "events": ["sift.completed", "sift.error"], "url": "https://x.com/h", "sift_id": None}
    respx.post(f"{BASE}/api/webhooks").mock(return_value=httpx.Response(201, json=payload))

    s = make_client()
    hook = s.register_hook(events=["sift.completed", "sift.error"], url="https://x.com/h")
    assert len(hook["events"]) == 2


@respx.mock
def test_list_hooks():
    payload = [{"id": "h1"}, {"id": "h2"}]
    respx.get(f"{BASE}/api/webhooks").mock(return_value=httpx.Response(200, json=payload))

    s = make_client()
    hooks = s.list_hooks()
    assert len(hooks) == 2


@respx.mock
def test_delete_hook():
    respx.delete(f"{BASE}/api/webhooks/h1").mock(return_value=httpx.Response(204))

    s = make_client()
    s.delete_hook("h1")  # should not raise


@respx.mock
def test_sdk_sends_api_key_header():
    """Ensure X-API-Key is sent on every request."""
    route = respx.get(f"{BASE}/api/sifts").mock(return_value=httpx.Response(200, json=[]))

    s = Sifter(api_url=BASE, api_key="sk-secret")
    s.list_sifts()

    assert route.called
    assert route.calls[0].request.headers.get("x-api-key") == "sk-secret"
