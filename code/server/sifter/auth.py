"""
Auth utilities: API key + JWT Bearer support.

Priority order:
  1. X-API-Key header → bootstrap or DB key principal
  2. Authorization: Bearer <jwt> → user principal from JWT
  3. No header → anonymous (unless require_api_key=True)

The cloud layer overrides get_current_principal via FastAPI
dependency_overrides to add full org/tenant-aware JWT logic.
"""
import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from jose import JWTError, jwt
from passlib.context import CryptContext

from sifter.config import config
from sifter.db import get_db

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@dataclass
class Principal:
    key_id: str  # "anonymous", "bootstrap", DB key _id, or user _id


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ---- Password helpers ----

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---- JWT helpers ----

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=config.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        config.jwt_secret,
        algorithm="HS256",
    )


def decode_access_token(token: str) -> Optional[str]:
    """Returns user_id or None if invalid."""
    try:
        payload = jwt.decode(token, config.jwt_secret, algorithms=["HS256"])
        return payload.get("sub")
    except JWTError:
        return None


# ---- FastAPI dependency ----

async def get_current_principal(
    api_key: Optional[str] = Depends(api_key_header),
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db=Depends(get_db),
) -> Principal:
    """Validates X-API-Key or Bearer JWT; falls back to anonymous."""

    # 1. API key takes priority
    if api_key:
        if config.api_key and api_key == config.api_key:
            return Principal(key_id="bootstrap")
        if api_key.startswith("sk-"):
            key_hash = _hash_api_key(api_key[3:])
            doc = await db["api_keys"].find_one({"key_hash": key_hash, "is_active": True})
            if doc:
                await db["api_keys"].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"last_used_at": datetime.now(timezone.utc)}},
                )
                return Principal(key_id=str(doc["_id"]))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # 2. Bearer JWT
    if bearer:
        user_id = decode_access_token(bearer.credentials)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return Principal(key_id=user_id)

    # 3. Anonymous
    if config.require_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return Principal(key_id="anonymous")
