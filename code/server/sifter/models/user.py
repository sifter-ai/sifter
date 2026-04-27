from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId


class APIKey(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    key_hash: str
    key_prefix: str
    org_id: str = "default"
    organization_id: str = "default"
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: Optional[datetime] = None
    is_active: bool = True

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "APIKey":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return cls(**doc)


class OrgRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class User(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: str
    password_hash: str
    full_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "User":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return cls(**doc)


class Organization(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    slug: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "Organization":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return cls(**doc)


class OrganizationMember(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    org_id: str
    user_id: str
    role: OrgRole = OrgRole.MEMBER
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=False, exclude={"id"})
        if self.id:
            d["_id"] = ObjectId(self.id)
        return d

    @classmethod
    def from_mongo(cls, doc: dict) -> "OrganizationMember":
        if doc is None:
            return None
        doc = dict(doc)
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return cls(**doc)
