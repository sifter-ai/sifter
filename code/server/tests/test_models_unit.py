"""
Unit tests for model from_mongo/to_mongo edge cases.
"""
import pytest
from bson import ObjectId


# ── models/document.py ────────────────────────────────────────────────────────

def test_folder_from_mongo_none():
    from sifter.models.document import Folder
    assert Folder.from_mongo(None) is None


def test_document_to_mongo_with_id():
    from sifter.models.document import Document
    doc = Document(
        folder_id="f1", filename="f.pdf", original_filename="f.pdf",
        content_type="application/pdf", size_bytes=100, storage_path="/x"
    )
    oid = ObjectId()
    doc.id = str(oid)
    d = doc.to_mongo()
    assert d["_id"] == oid


def test_document_from_mongo_none():
    from sifter.models.document import Document
    assert Document.from_mongo(None) is None


def test_folder_sift_to_mongo_with_id():
    from sifter.models.document import FolderSift
    fs = FolderSift(folder_id="f1", sift_id="s1")
    oid = ObjectId()
    fs.id = str(oid)
    d = fs.to_mongo()
    assert d["_id"] == oid


def test_folder_sift_from_mongo_none():
    from sifter.models.document import FolderSift
    assert FolderSift.from_mongo(None) is None


def test_folder_sift_from_mongo_extraction_id():
    """Legacy extraction_id field is mapped to sift_id (line 101)."""
    from sifter.models.document import FolderSift
    raw = {"_id": ObjectId(), "folder_id": "f1", "extraction_id": "s1"}
    fs = FolderSift.from_mongo(raw)
    assert fs.sift_id == "s1"


def test_document_sift_status_to_mongo_with_id():
    from sifter.models.document import DocumentSiftStatus
    status = DocumentSiftStatus(document_id="d1", sift_id="s1")
    oid = ObjectId()
    status.id = str(oid)
    d = status.to_mongo()
    assert d["_id"] == oid


def test_document_sift_status_from_mongo_none():
    from sifter.models.document import DocumentSiftStatus
    assert DocumentSiftStatus.from_mongo(None) is None


def test_document_sift_status_from_mongo_legacy_fields():
    """Legacy extraction_id and extraction_record_id fields are mapped (lines 136, 138)."""
    from sifter.models.document import DocumentSiftStatus, DocumentSiftStatusEnum
    raw = {
        "_id": ObjectId(),
        "document_id": "d1",
        "extraction_id": "s1",        # → sift_id
        "extraction_record_id": "r1",  # → sift_record_id
        "status": DocumentSiftStatusEnum.PENDING,
    }
    status = DocumentSiftStatus.from_mongo(raw)
    assert status.sift_id == "s1"
    assert status.sift_record_id == "r1"


def test_document_sift_status_from_mongo_unknown_fields_dropped():
    """Unknown fields like org_id are dropped gracefully (lines 140-141)."""
    from sifter.models.document import DocumentSiftStatus, DocumentSiftStatusEnum
    raw = {
        "_id": ObjectId(),
        "document_id": "d1",
        "sift_id": "s1",
        "status": DocumentSiftStatusEnum.PENDING,
        "org_id": "default",  # unknown field
        "random_extra": "x",  # unknown field
    }
    status = DocumentSiftStatus.from_mongo(raw)
    assert status.sift_id == "s1"


# ── models/sift_result.py ─────────────────────────────────────────────────────

def test_sift_result_to_mongo_with_id():
    from sifter.models.sift_result import SiftResult
    sr = SiftResult(sift_id="s1", document_id="d1", filename="f.pdf")
    oid = ObjectId()
    sr.id = str(oid)
    d = sr.to_mongo()
    assert d["_id"] == oid


def test_sift_result_from_mongo_none():
    from sifter.models.sift_result import SiftResult
    assert SiftResult.from_mongo(None) is None


def test_sift_result_from_mongo_extraction_id():
    """Legacy extraction_id field is mapped to sift_id (line 38)."""
    from sifter.models.sift_result import SiftResult
    raw = {
        "_id": ObjectId(),
        "extraction_id": "s1",
        "document_id": "d1",
        "filename": "f.pdf",
    }
    sr = SiftResult.from_mongo(raw)
    assert sr.sift_id == "s1"


# ── models/aggregation.py ─────────────────────────────────────────────────────

def test_aggregation_to_mongo_with_id():
    from sifter.models.aggregation import Aggregation
    agg = Aggregation(name="A", sift_id="s1", aggregation_query="q")
    oid = ObjectId()
    agg.id = str(oid)
    d = agg.to_mongo()
    assert d["_id"] == oid


def test_aggregation_from_mongo_none():
    from sifter.models.aggregation import Aggregation
    assert Aggregation.from_mongo(None) is None


# ── models/user.py ────────────────────────────────────────────────────────────

def test_api_key_to_mongo_with_id():
    from sifter.models.user import APIKey
    key = APIKey(name="MyKey", key_hash="abc", key_prefix="sk-", org_id="default")
    oid = ObjectId()
    key.id = str(oid)
    d = key.to_mongo()
    assert d["_id"] == oid


def test_api_key_from_mongo_none():
    from sifter.models.user import APIKey
    assert APIKey.from_mongo(None) is None


def test_user_to_mongo_with_id():
    from sifter.models.user import User
    user = User(email="a@b.com", password_hash="h", full_name="A")
    oid = ObjectId()
    user.id = str(oid)
    d = user.to_mongo()
    assert d["_id"] == oid


def test_user_from_mongo_none():
    from sifter.models.user import User
    assert User.from_mongo(None) is None


def test_organization_to_mongo_with_id():
    from sifter.models.user import Organization
    org = Organization(name="Test Org", slug="test-org")
    oid = ObjectId()
    org.id = str(oid)
    d = org.to_mongo()
    assert d["_id"] == oid


def test_organization_from_mongo_none():
    from sifter.models.user import Organization
    assert Organization.from_mongo(None) is None


def test_organization_member_from_mongo_none():
    from sifter.models.user import OrganizationMember
    assert OrganizationMember.from_mongo(None) is None


# ── models/webhook.py ─────────────────────────────────────────────────────────

def test_webhook_to_mongo_with_id():
    from sifter.models.webhook import Webhook
    wh = Webhook(events=["*"], url="https://x.com/hook", org_id="default")
    oid = ObjectId()
    wh.id = str(oid)
    d = wh.to_mongo()
    assert d["_id"] == oid


# ── models/processing_task.py ─────────────────────────────────────────────────

def test_processing_task_to_mongo_with_id():
    from sifter.models.processing_task import ProcessingTask
    task = ProcessingTask(document_id="d1", sift_id="s1", storage_path="/x")
    oid = ObjectId()
    task.id = str(oid)
    d = task.to_mongo()
    assert d["_id"] == oid


def test_webhook_from_mongo_none():
    from sifter.models.webhook import Webhook
    assert Webhook.from_mongo(None) is None


def test_organization_member_to_mongo_with_id():
    from sifter.models.user import OrganizationMember, OrgRole
    mem = OrganizationMember(org_id="org1", user_id="user1", role=OrgRole.MEMBER)
    oid = ObjectId()
    mem.id = str(oid)
    d = mem.to_mongo()
    assert d["_id"] == oid


def test_organization_member_from_mongo():
    from sifter.models.user import OrganizationMember
    raw = {"_id": ObjectId(), "org_id": "org1", "user_id": "user1", "role": "member"}
    mem = OrganizationMember.from_mongo(raw)
    assert mem.org_id == "org1"


def test_aggregation_from_mongo_status_migration():
    from sifter.models.aggregation import Aggregation
    raw = {
        "_id": ObjectId(),
        "name": "A",
        "sift_id": "s1",
        "aggregation_query": "total",
        "status": "active",
    }
    agg = Aggregation.from_mongo(raw)
    assert agg.status == "ready"


def test_aggregation_from_mongo_extraction_id_migration():
    from sifter.models.aggregation import Aggregation
    raw = {
        "_id": ObjectId(),
        "name": "A",
        "extraction_id": "s1",
        "aggregation_query": "total",
    }
    agg = Aggregation.from_mongo(raw)
    assert agg.sift_id == "s1"


def test_sift_from_mongo_none():
    from sifter.models.sift import Sift
    assert Sift.from_mongo(None) is None
