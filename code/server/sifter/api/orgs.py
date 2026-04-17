# Organization endpoints removed — Sifter OSS is single-tenant.
# Multi-tenancy and organization management is handled by the cloud platform.
from fastapi import APIRouter

router = APIRouter(prefix="/api/orgs", tags=["orgs"])
