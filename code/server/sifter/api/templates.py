import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api/templates", tags=["templates"])

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"

def _load_templates() -> list[dict]:
    templates = []
    for path in sorted(_TEMPLATES_DIR.glob("*.json")):
        try:
            templates.append(json.loads(path.read_text()))
        except Exception:
            pass
    return templates

_TEMPLATES = _load_templates()


@router.get("")
async def list_templates():
    return {"templates": _TEMPLATES}
