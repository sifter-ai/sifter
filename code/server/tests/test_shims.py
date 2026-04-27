"""
Coverage for legacy shim modules (re-exports) and simple models.
These files just re-export from their canonical location — importing them
is sufficient to hit every line.
"""
from datetime import datetime, timezone

from bson import ObjectId


def test_model_extraction_shim():
    from sifter.models.extraction import Sift, SiftStatus
    assert Sift is not None
    assert SiftStatus.ACTIVE == "active"


def test_model_extraction_result_shim():
    from sifter.models.extraction_result import SiftResult
    assert SiftResult is not None


def test_service_extraction_agent_shim():
    from sifter.services.extraction_agent import ExtractionAgentResult, extract, _strip_markdown_fences
    assert ExtractionAgentResult is not None
    assert callable(extract)
    assert callable(_strip_markdown_fences)


def test_service_extraction_results_shim():
    from sifter.services.extraction_results import SiftResultsService
    assert SiftResultsService is not None


def test_service_extraction_service_shim():
    from sifter.services.extraction_service import SiftService
    assert SiftService is not None


# ── CorrectionRule ────────────────────────────────────────────────────────────

def test_correction_rule_instantiation():
    from sifter.models.correction_rule import CorrectionRule
    rule = CorrectionRule(
        sift_id="sift1",
        field_name="amount",
        match_value="N/A",
        replace_value=0.0,
        created_by="user1",
    )
    assert rule.sift_id == "sift1"
    assert rule.active is True
    assert rule.applied_count == 0


def test_correction_rule_to_mongo_without_id():
    from sifter.models.correction_rule import CorrectionRule
    rule = CorrectionRule(
        sift_id="sift1",
        field_name="total",
        match_value="",
        replace_value=None,
        created_by="user1",
    )
    doc = rule.to_mongo()
    assert "_id" not in doc
    assert doc["sift_id"] == "sift1"
    assert doc["field_name"] == "total"


def test_correction_rule_to_mongo_with_id():
    from sifter.models.correction_rule import CorrectionRule
    oid = str(ObjectId())
    rule = CorrectionRule(
        id=oid,
        sift_id="sift1",
        field_name="total",
        match_value="",
        replace_value=None,
        created_by="user1",
    )
    doc = rule.to_mongo()
    assert isinstance(doc["_id"], ObjectId)


def test_correction_rule_from_mongo():
    from sifter.models.correction_rule import CorrectionRule
    oid = ObjectId()
    doc = {
        "_id": oid,
        "sift_id": "sift1",
        "field_name": "amount",
        "match_value": "N/A",
        "replace_value": 0.0,
        "created_by": "user1",
        "created_at": datetime.now(timezone.utc),
        "applied_count": 2,
        "active": True,
    }
    rule = CorrectionRule.from_mongo(doc)
    assert rule.id == str(oid)
    assert rule.applied_count == 2


def test_correction_rule_from_mongo_none():
    from sifter.models.correction_rule import CorrectionRule
    assert CorrectionRule.from_mongo(None) is None
