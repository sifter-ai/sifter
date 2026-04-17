"""
Dev auth endpoints: register, login, me.

Provides minimal JWT auth for the frontend / local development.
The cloud layer replaces this with full org-aware auth via
dependency_overrides or by mounting its own router.
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from sifter.auth import (
    Principal,
    create_access_token,
    get_current_principal,
    hash_password,
    verify_password,
)
from sifter.config import config
from sifter.db import get_db
from sifter.limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---- Schemas ----

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    created_at: str
    auth_provider: str = "email"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _user_out(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        full_name=doc.get("full_name", ""),
        created_at=doc["created_at"].isoformat() if isinstance(doc["created_at"], datetime) else doc["created_at"],
        auth_provider=doc.get("auth_provider", "email"),
    )


# ---- Endpoints ----

@router.post("/register", response_model=AuthResponse)
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, db=Depends(get_db)):
    existing = await db["users"].find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    now = datetime.now(timezone.utc)
    result = await db["users"].insert_one({
        "email": req.email.lower(),
        "full_name": req.full_name,
        "hashed_password": hash_password(req.password),
        "created_at": now,
    })
    user_id = str(result.inserted_id)
    token = create_access_token(user_id)
    user_doc = await db["users"].find_one({"_id": result.inserted_id})
    return AuthResponse(access_token=token, user=_user_out(user_doc))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db=Depends(get_db)):
    doc = await db["users"].find_one({"email": req.email.lower()})
    if doc and doc.get("auth_provider") == "google" and not doc.get("hashed_password"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses Google sign-in. Please sign in with Google.",
        )
    if not doc or not verify_password(req.password, doc.get("hashed_password") or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(str(doc["_id"]))
    return AuthResponse(access_token=token, user=_user_out(doc))


class GoogleAuthRequest(BaseModel):
    credential: str


@router.post("/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_auth(request: Request, req: GoogleAuthRequest, db=Depends(get_db)):
    if not config.google_client_id:
        raise HTTPException(status_code=404, detail="Google authentication is not configured")

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        id_info = id_token.verify_oauth2_token(
            req.credential,
            google_requests.Request(),
            config.google_client_id,
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")

    if not id_info.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified",
        )

    google_id = id_info["sub"]
    email = id_info["email"].lower()
    full_name = id_info.get("name", "")
    now = datetime.now(timezone.utc)

    doc = await db["users"].find_one({"google_id": google_id})
    if not doc:
        doc = await db["users"].find_one({"email": email})
        if doc:
            await db["users"].update_one(
                {"_id": doc["_id"]},
                {"$set": {"google_id": google_id, "auth_provider": "google"}},
            )
            doc = await db["users"].find_one({"_id": doc["_id"]})
        else:
            result = await db["users"].insert_one({
                "email": email,
                "full_name": full_name,
                "hashed_password": None,
                "google_id": google_id,
                "auth_provider": "google",
                "created_at": now,
            })
            doc = await db["users"].find_one({"_id": result.inserted_id})

    token = create_access_token(str(doc["_id"]))
    return AuthResponse(access_token=token, user=_user_out(doc))


@router.get("/me", response_model=UserOut)
async def me(
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    if principal.key_id in ("anonymous", "bootstrap"):
        raise HTTPException(status_code=401, detail="Not authenticated as a user")
    try:
        oid = ObjectId(principal.key_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")
    doc = await db["users"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    return _user_out(doc)
