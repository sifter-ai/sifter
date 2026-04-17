from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import Any

import tomllib
import tomli_w

_CONFIG_DIR = Path.home() / ".sifter"
_CONFIG_FILE = _CONFIG_DIR / "config.toml"


def _load_raw() -> dict[str, Any]:
    if not _CONFIG_FILE.exists():
        return {}
    with open(_CONFIG_FILE, "rb") as f:
        return tomllib.load(f)


def _save_raw(data: dict[str, Any]) -> None:
    _CONFIG_DIR.mkdir(exist_ok=True)
    _CONFIG_FILE.write_bytes(tomli_w.dumps(data).encode())
    _CONFIG_FILE.chmod(stat.S_IRUSR | stat.S_IWUSR)


def get_profile(profile: str = "default") -> dict[str, str]:
    raw = _load_raw()
    if profile == "default":
        return raw.get("default", {})
    return raw.get("profile", {}).get(profile, {})


def set_profile(api_url: str, api_key: str, profile: str = "default") -> None:
    raw = _load_raw()
    entry = {"api_url": api_url, "api_key": api_key}
    if profile == "default":
        raw["default"] = entry
    else:
        raw.setdefault("profile", {})[profile] = entry
    _save_raw(raw)


def delete_profile(profile: str = "default") -> None:
    raw = _load_raw()
    if profile == "default":
        raw.pop("default", None)
    else:
        raw.get("profile", {}).pop(profile, None)
    _save_raw(raw)


def resolve(api_url: str | None, api_key: str | None, profile: str = "default") -> tuple[str, str]:
    cfg = get_profile(profile)
    resolved_url = api_url or cfg.get("api_url") or "http://localhost:8000"
    resolved_key = api_key or os.environ.get("SIFTER_API_KEY") or cfg.get("api_key") or ""
    return resolved_url, resolved_key
