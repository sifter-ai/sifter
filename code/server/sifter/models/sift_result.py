from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, Field
from bson import ObjectId


class SiftResult(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    sift_id: str
    document_id: str          # UUID — stable identifier for this result
    filename: str = ""        # original filename as uploaded
    document_type: str = "unknown"
    confidence: float = 0.0
    extracted_data: dict[str, Any] = {}
    citations: Optional[dict[str, Any]] = None
    record_index: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "SiftResult":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        # Migrate old extraction_id field
        if "extraction_id" in doc and "sift_id" not in doc:
            doc["sift_id"] = doc.pop("extraction_id")
        return cls(**doc)
