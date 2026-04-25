from datetime import datetime, timezone
from typing import Any, Optional

import litellm
import structlog
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ..auth import Principal, get_current_principal
from ..config import api_kwargs_for, config
from ..db import get_db
from ..services.qa_agent import chat as qa_chat

logger = structlog.get_logger()
router = APIRouter(prefix="/api/chat/sessions", tags=["chat-sessions"])

MAX_MESSAGES_PER_SESSION = 200
HISTORY_WINDOW = 40


async def _generate_title(session_id: str, user_message: str, assistant_response: str, db) -> None:
    import json as _json
    try:
        response = await litellm.acompletion(
            model=config.chat_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        'Respond with a JSON object in the format {"title": "..."}. '
                        "The title must be 3–6 words, no quotes inside, no trailing punctuation. "
                        "Use the same language as the user message. No other text outside the JSON."
                    ),
                },
                {
                    "role": "user",
                    "content": user_message,
                },
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
            **api_kwargs_for("chat"),
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        title = _json.loads(raw).get("title", "").strip().strip('"').strip("'")
        logger.info("generated_chat_title", session_id=session_id, title=title)
        if title:
            await db["chat_sessions"].update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {"title": title[:80]}},
            )
    except Exception:
        logger.exception("generate_chat_title_failed", session_id=session_id)
        pass  # title stays as the raw message fallback


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, Exception):
        raise HTTPException(400, f"Invalid id: {value!r}")


# ── Sessions ──────────────────────────────────────────────────


@router.post("")
async def create_session(
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": principal.user_id,
        "title": "",
        "deleted": False,
        "created_at": now,
        "updated_at": now,
    }
    result = await db["chat_sessions"].insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


@router.get("")
async def list_sessions(
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    sessions = []
    async for s in db["chat_sessions"].find(
        {"user_id": principal.user_id, "deleted": False}
    ).sort("updated_at", -1).limit(50):
        s["id"] = str(s.pop("_id"))
        sessions.append(s)
    return {"items": sessions}


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    s = await db["chat_sessions"].find_one(
        {"_id": _oid(session_id), "user_id": principal.user_id, "deleted": False}
    )
    if not s:
        raise HTTPException(404, "Session not found")
    s["id"] = str(s.pop("_id"))
    messages = []
    async for m in db["chat_messages"].find({"session_id": session_id}).sort("created_at", 1):
        m["id"] = str(m.pop("_id"))
        messages.append(m)
    return {"session": s, "messages": messages}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    await db["chat_sessions"].update_one(
        {"_id": _oid(session_id), "user_id": principal.user_id},
        {"$set": {"deleted": True}},
    )
    return {"status": "deleted"}


# ── Messages ──────────────────────────────────────────────────


class SendMessageRequest(BaseModel):
    content: str


class ToolCallTraceOut(BaseModel):
    tool: str
    args: dict[str, Any]
    result_preview: str
    duration_ms: int
    result: Optional[Any] = None


@router.post("/{session_id}/messages")
async def send_message(
    session_id: str,
    body: SendMessageRequest,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    session = await db["chat_sessions"].find_one(
        {"_id": _oid(session_id), "user_id": principal.user_id, "deleted": False}
    )
    if not session:
        raise HTTPException(404, "Session not found")

    msg_count = await db["chat_messages"].count_documents({"session_id": session_id})
    if msg_count >= MAX_MESSAGES_PER_SESSION:
        raise HTTPException(400, "Session message limit reached")

    now = datetime.now(timezone.utc)

    # Persist user message
    await db["chat_messages"].insert_one({
        "session_id": session_id,
        "role": "user",
        "content": body.content,
        "trace": [],
        "created_at": now,
    })

    is_first_message = not session.get("title")

    # Build history from persisted messages
    history = []
    async for m in db["chat_messages"].find(
        {"session_id": session_id}
    ).sort("created_at", 1).limit(HISTORY_WINDOW):
        history.append({"role": m["role"], "content": m["content"]})

    try:
        result = await qa_chat(
            extraction_id=None,
            message=body.content,
            history=history[:-1],  # exclude the just-added user message (qa_chat adds it itself)
            db=db,
            org_id=principal.org_id,
        )
    except Exception as e:
        logger.error("chat_session_error", error=str(e))
        raise HTTPException(500, str(e))

    trace_docs = [
        {
            "tool": t.tool,
            "args": t.args,
            "result_preview": t.result_preview,
            "duration_ms": t.duration_ms,
            "result": t.result,
        }
        for t in result.trace
    ]

    assistant_doc = {
        "session_id": session_id,
        "role": "assistant",
        "content": result.response,
        "trace": trace_docs,
        "created_at": datetime.now(timezone.utc),
    }
    inserted = await db["chat_messages"].insert_one(assistant_doc)
    assistant_doc["id"] = str(inserted.inserted_id)
    assistant_doc.pop("_id", None)

    await db["chat_sessions"].update_one(
        {"_id": _oid(session_id)},
        {"$set": {"updated_at": datetime.now(timezone.utc)}},
    )

    if is_first_message:
        background_tasks.add_task(
            _generate_title, session_id, body.content, result.response, db
        )

    return assistant_doc
