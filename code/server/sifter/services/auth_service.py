"""
Auth service: user registration/login, organizations, API key management.
"""
import re
import secrets
import hashlib
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from sifter.auth import hash_password, verify_password, create_access_token
from sifter.models.user import APIKey, OrgRole, Organization, OrganizationMember, User


def _slugify(text: str) -> str:
    """Convert email or name to a URL-safe slug."""
    slug = text.split("@")[0].lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug or "org"


def _generate_api_key() -> tuple[str, str, str]:
    """
    Returns (plaintext_key, key_hash, key_prefix).
    plaintext_key = "sk-" + 48-char URL-safe random string
    key_hash = SHA-256 of the part after "sk-"
    key_prefix = first 12 chars of plaintext_key (for display)
    """
    random_part = secrets.token_urlsafe(36)  # 36 bytes → 48 chars
    plaintext = f"sk-{random_part}"
    key_hash = hashlib.sha256(random_part.encode()).hexdigest()
    key_prefix = plaintext[:12]
    return plaintext, key_hash, key_prefix


class AuthService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def register(self, email: str, password: str, full_name: str) -> tuple[User, Organization, str]:
        """Register a new user, create personal org, return (user, org, jwt)."""
        existing = await self.db["users"].find_one({"email": email.lower()})
        if existing:
            raise ValueError("Email already registered")

        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            full_name=full_name,
        )
        result = await self.db["users"].insert_one(user.to_mongo())
        user.id = str(result.inserted_id)

        # Create personal organization
        slug = _slugify(email)
        # Ensure slug uniqueness
        base_slug = slug
        counter = 1
        while await self.db["organizations"].find_one({"slug": slug}):
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization(name=f"{full_name}'s Organization", slug=slug)
        org_result = await self.db["organizations"].insert_one(org.to_mongo())
        org.id = str(org_result.inserted_id)

        # Add user as owner
        member = OrganizationMember(org_id=org.id, user_id=user.id, role=OrgRole.OWNER)
        await self.db["organization_members"].insert_one(member.to_mongo())

        token = create_access_token(user.id, org.id)
        return user, org, token

    async def login(self, email: str, password: str) -> tuple[User, str]:
        """Verify credentials and return (user, jwt). Picks first org as active."""
        doc = await self.db["users"].find_one({"email": email.lower()})
        if not doc or not verify_password(password, doc["password_hash"]):
            raise ValueError("Invalid email or password")

        user = User.from_mongo(doc)

        # Find user's first org (owner first, then any)
        member_doc = await self.db["organization_members"].find_one(
            {"user_id": user.id},
            sort=[("role", 1)],  # "admin" < "member" < "owner" alphabetically, but we want owner first
        )
        if not member_doc:
            raise ValueError("User has no organization")

        # Sort: owner first
        members = await self.db["organization_members"].find({"user_id": user.id}).to_list(length=100)
        role_order = {"owner": 0, "admin": 1, "member": 2}
        members.sort(key=lambda m: role_order.get(m.get("role", "member"), 99))
        org_id = str(members[0]["org_id"])

        token = create_access_token(user.id, org_id)
        return user, token

    async def get_user(self, user_id: str) -> Optional[User]:
        doc = await self.db["users"].find_one({"_id": ObjectId(user_id)})
        return User.from_mongo(doc)

    async def list_orgs_for_user(self, user_id: str) -> list[Organization]:
        members = await self.db["organization_members"].find({"user_id": user_id}).to_list(length=100)
        org_ids = [ObjectId(m["org_id"]) for m in members]
        orgs = await self.db["organizations"].find({"_id": {"$in": org_ids}}).to_list(length=100)
        return [Organization.from_mongo(o) for o in orgs]

    async def get_org(self, org_id: str, user_id: str) -> Optional[Organization]:
        """Get org if user is a member."""
        member = await self.db["organization_members"].find_one(
            {"org_id": org_id, "user_id": user_id}
        )
        if not member:
            return None
        doc = await self.db["organizations"].find_one({"_id": ObjectId(org_id)})
        return Organization.from_mongo(doc)

    async def create_org(self, name: str, user_id: str) -> tuple[Organization, str]:
        """Create a new org, add creator as owner, return (org, new_jwt)."""
        slug = _slugify(name)
        base_slug = slug
        counter = 1
        while await self.db["organizations"].find_one({"slug": slug}):
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization(name=name, slug=slug)
        result = await self.db["organizations"].insert_one(org.to_mongo())
        org.id = str(result.inserted_id)

        member = OrganizationMember(org_id=org.id, user_id=user_id, role=OrgRole.OWNER)
        await self.db["organization_members"].insert_one(member.to_mongo())

        token = create_access_token(user_id, org.id)
        return org, token

    async def switch_org(self, user_id: str, org_id: str) -> str:
        """Verify user is a member of org_id, return new JWT."""
        member = await self.db["organization_members"].find_one(
            {"user_id": user_id, "org_id": org_id}
        )
        if not member:
            raise ValueError("Not a member of that organization")
        return create_access_token(user_id, org_id)

    async def list_members(self, org_id: str) -> list[dict]:
        members = await self.db["organization_members"].find({"org_id": org_id}).to_list(length=500)
        result = []
        for m in members:
            user_doc = await self.db["users"].find_one({"_id": ObjectId(m["user_id"])})
            result.append({
                "user_id": str(m["user_id"]),
                "email": user_doc["email"] if user_doc else "",
                "full_name": user_doc["full_name"] if user_doc else "",
                "role": m["role"],
                "joined_at": m["joined_at"].isoformat() if m.get("joined_at") else None,
            })
        return result

    async def add_member(self, org_id: str, invitee_email: str, role: OrgRole) -> OrganizationMember:
        """Add an existing user to an org by email."""
        user_doc = await self.db["users"].find_one({"email": invitee_email.lower()})
        if not user_doc:
            raise ValueError("User not found")
        user_id = str(user_doc["_id"])

        existing = await self.db["organization_members"].find_one(
            {"org_id": org_id, "user_id": user_id}
        )
        if existing:
            raise ValueError("User is already a member")

        member = OrganizationMember(org_id=org_id, user_id=user_id, role=role)
        await self.db["organization_members"].insert_one(member.to_mongo())
        return member

    async def create_api_key(self, name: str, org_id: str, user_id: str) -> tuple[APIKey, str]:
        """Create an API key. Returns (APIKey metadata, plaintext_key)."""
        plaintext, key_hash, key_prefix = _generate_api_key()
        api_key = APIKey(
            name=name,
            key_hash=key_hash,
            key_prefix=key_prefix,
            organization_id=org_id,
            created_by=user_id,
        )
        result = await self.db["api_keys"].insert_one(api_key.to_mongo())
        api_key.id = str(result.inserted_id)
        return api_key, plaintext

    async def list_api_keys(self, org_id: str) -> list[APIKey]:
        docs = await self.db["api_keys"].find(
            {"organization_id": org_id, "is_active": True}
        ).to_list(length=200)
        return [APIKey.from_mongo(d) for d in docs]

    async def revoke_api_key(self, key_id: str, org_id: str) -> bool:
        result = await self.db["api_keys"].update_one(
            {"_id": ObjectId(key_id), "organization_id": org_id},
            {"$set": {"is_active": False}},
        )
        return result.modified_count > 0

    async def ensure_indexes(self):
        await self.db["users"].create_index("email", unique=True)
        await self.db["api_keys"].create_index("key_hash")
        await self.db["organization_members"].create_index(
            [("org_id", 1), ("user_id", 1)], unique=True
        )
