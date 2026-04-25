from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..db import get_db
from ..services.qa_agent import chat as qa_chat

logger = structlog.get_logger()
router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    sift_id: Optional[str] = None
    history: list[ChatMessage] = []


class ToolCallTraceOut(BaseModel):
    tool: str
    args: dict[str, Any]
    result_preview: str
    duration_ms: int


class ChatResponse(BaseModel):
    response: str
    data: Optional[list[dict]] = None
    query: Optional[str] = None
    pipeline: Optional[list] = None
    trace: list[ToolCallTraceOut] = []


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    history_dicts = [{"role": m.role, "content": m.content} for m in body.history]
    try:
        result = await qa_chat(
            extraction_id=body.sift_id,
            message=body.message,
            history=history_dicts,
            db=db,
            org_id=principal.org_id,
        )
    except Exception as e:
        logger.error("chat_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    return ChatResponse(
        response=result.response,
        data=result.data,
        pipeline=result.pipeline,
        trace=[
            ToolCallTraceOut(
                tool=t.tool,
                args=t.args,
                result_preview=t.result_preview,
                duration_ms=t.duration_ms,
            )
            for t in result.trace
        ],
    )
