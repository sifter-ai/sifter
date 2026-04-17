from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from ..config import config
from ..db import get_db
from ..limiter import limiter
from ..services.email import get_email_sender

logger = structlog.get_logger()
router = APIRouter(prefix="/api/enterprise", tags=["enterprise"])


class EnterpriseContactRequest(BaseModel):
    name: str
    email: EmailStr
    company: str
    use_case: str
    message: str = ""
    _honeypot: str = ""


@router.post("/contact", status_code=status.HTTP_200_OK)
@limiter.limit("3/hour")
async def enterprise_contact(
    request: Request,
    body: EnterpriseContactRequest,
    db=Depends(get_db),
    email_sender=Depends(get_email_sender),
):
    if body._honeypot:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request")

    lead = {
        "name": body.name,
        "email": body.email,
        "company": body.company,
        "use_case": body.use_case,
        "message": body.message,
        "created_at": datetime.now(timezone.utc),
        "ip_address": request.client.host if request.client else "",
    }

    await db["enterprise_leads"].insert_one(lead)
    logger.info("enterprise_lead_created", email=body.email, company=body.company)

    if config.sales_email:
        await email_sender.send_enterprise_lead(to=config.sales_email, lead=lead)

    return {"status": "ok"}
