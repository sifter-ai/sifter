from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId


class DocumentSiftStatusEnum(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"
    DISCARDED = "discarded"


# Legacy alias
DocumentExtractionStatusEnum = DocumentSiftStatusEnum


class Folder(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    description: str = ""
    document_count: int = 0
    parent_id: Optional[str] = None
    path: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "Folder":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        known = set(cls.model_fields.keys()) | {"_id"}
        doc = {k: v for k, v in doc.items() if k in known or k == "_id"}
        return cls(**doc)


class Document(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    folder_id: str
    filename: str
    original_filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    storage_path: str

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "Document":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return cls(**doc)


class FolderSift(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    folder_id: str
    sift_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "FolderSift":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        if "extraction_id" in doc and "sift_id" not in doc:
            doc["sift_id"] = doc.pop("extraction_id")
        return cls(**doc)


# Legacy alias
FolderExtractor = FolderSift


class DocumentSiftStatus(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    document_id: str
    sift_id: str
    status: DocumentSiftStatusEnum = DocumentSiftStatusEnum.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    filter_reason: Optional[str] = None
    sift_record_id: Optional[str] = None

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "DocumentSiftStatus":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        if "extraction_id" in doc and "sift_id" not in doc:
            doc["sift_id"] = doc.pop("extraction_id")
        if "extraction_record_id" in doc and "sift_record_id" not in doc:
            doc["sift_record_id"] = doc.pop("extraction_record_id")
        # Drop org_id and other unknown fields gracefully
        known = set(cls.model_fields.keys()) | {"_id"}
        doc = {k: v for k, v in doc.items() if k in known or k == "_id"}
        return cls(**doc)


# Legacy alias
DocumentExtractionStatus = DocumentSiftStatus
