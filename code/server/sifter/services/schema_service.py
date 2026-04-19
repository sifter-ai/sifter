"""
Typed schema emitters — Pydantic, TypeScript, JSON Schema draft-2020-12.
Reads schema_fields from a Sift and emits ready-to-use type definitions.
"""
import json
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.sift import Sift

_TYPE_TO_PYTHON = {
    "string": "str",
    "number": "float",
    "integer": "int",
    "boolean": "bool",
    "date": "date",
    "datetime": "datetime",
    "array": "list",
    "object": "dict",
}

_TYPE_TO_TS = {
    "string": "string",
    "number": "number",
    "integer": "number",
    "boolean": "boolean",
    "date": "string",       # ISO yyyy-mm-dd
    "datetime": "string",   # ISO 8601
    "array": "unknown[]",
    "object": "Record<string, unknown>",
}

_TYPE_TO_JSON_SCHEMA = {
    "string": "string",
    "number": "number",
    "integer": "integer",
    "boolean": "boolean",
    "date": "string",
    "datetime": "string",
    "array": "array",
    "object": "object",
}

_DATE_TYPES = {"date", "datetime"}
_FORMAT_MAP = {"date": "date", "datetime": "date-time", "email": "email", "uri": "uri"}


def _pascal_case(name: str) -> str:
    words = re.split(r"[\s_\-]+", name.strip())
    return "".join(w.capitalize() for w in words if w) or "Model"


def emit_pydantic(sift: "Sift") -> str:
    name = _pascal_case(sift.name)
    fields = sift.schema_fields or []

    needs_date = any(f.get("type") == "date" for f in fields)
    needs_datetime = any(f.get("type") == "datetime" for f in fields)

    imports = ["from pydantic import BaseModel", "from typing import Optional"]
    if needs_date:
        imports.append("from datetime import date")
    if needs_datetime:
        imports.append("from datetime import datetime")

    lines = imports + ["", f"", f"class {name}(BaseModel):"]
    if not fields:
        lines.append("    pass")
    else:
        for f in fields:
            fname = f.get("name", "field")
            ftype = f.get("type", "string")
            py_type = _TYPE_TO_PYTHON.get(ftype, "str")
            lines.append(f"    {fname}: Optional[{py_type}] = None")

    return "\n".join(lines) + "\n"


def emit_typescript(sift: "Sift") -> str:
    name = _pascal_case(sift.name)
    fields = sift.schema_fields or []

    lines = [f"export interface {name} {{"]
    if not fields:
        lines.append("  [key: string]: unknown;")
    else:
        for f in fields:
            fname = f.get("name", "field")
            ftype = f.get("type", "string")
            ts_type = _TYPE_TO_TS.get(ftype, "unknown")
            comment = ""
            if ftype == "date":
                comment = "  // ISO yyyy-mm-dd"
            elif ftype == "datetime":
                comment = "  // ISO 8601"
            lines.append(f"  {fname}?: {ts_type};{comment}")
    lines.append("}")

    return "\n".join(lines) + "\n"


def emit_json_schema(sift: "Sift") -> dict:
    name = _pascal_case(sift.name)
    fields = sift.schema_fields or []

    properties = {}
    for f in fields:
        fname = f.get("name", "field")
        ftype = f.get("type", "string")
        json_type = _TYPE_TO_JSON_SCHEMA.get(ftype, "string")
        prop: dict = {"type": [json_type, "null"]}
        fmt = f.get("format") or _FORMAT_MAP.get(ftype)
        if fmt:
            prop["format"] = fmt
        properties[fname] = prop

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": name,
        "type": "object",
        "properties": properties,
    }


def _to_snake_case(key: str) -> str:
    import re
    key = re.sub(r"[\s\-\.]+", "_", key.strip())
    key = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", key)
    key = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", key)
    key = key.lower()
    key = re.sub(r"_+", "_", key).strip("_")
    return key or "field"


def infer_schema_fields(extracted_data: dict) -> list[dict]:
    """Infer schema_fields from a sample extracted_data dict."""
    fields = []
    for key, value in extracted_data.items():
        if isinstance(value, bool):
            ftype = "boolean"
        elif isinstance(value, int):
            ftype = "integer"
        elif isinstance(value, float):
            ftype = "number"
        elif isinstance(value, list):
            ftype = "array"
        elif isinstance(value, dict):
            ftype = "object"
        elif isinstance(value, str):
            # Heuristic date detection
            import re as _re
            if _re.match(r"^\d{4}-\d{2}-\d{2}T", value):
                ftype = "datetime"
            elif _re.match(r"^\d{4}-\d{2}-\d{2}$", value):
                ftype = "date"
            else:
                ftype = "string"
        else:
            ftype = "string"
        fields.append({"name": _to_snake_case(key), "type": ftype, "nullable": True})
    return fields
