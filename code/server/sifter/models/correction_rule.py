from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, Field
from bson import ObjectId


class CorrectionRule(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    sift_id: str
    field_name: str
    match_value: str
    replace_value: Any
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    applied_count: int = 0
    active: bool = True

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "CorrectionRule":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return cls(**doc)
