"""관리자 등록 접속 URL — config/registered-target-sites.json"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

_CONFIG_PATH = Path(__file__).resolve().parents[3] / "config" / "registered-target-sites.json"


def _load_registry() -> dict:
    try:
        raw = _CONFIG_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def registered_target_site_message() -> str:
    reg = _load_registry()
    return str(
        reg.get("contact_message")
        or "등록되지 않은 사이트입니다. 접속 URL 등록은 관리자에게 문의하세요."
    )


def is_registered_target_url(url: str) -> bool:
    raw = (url or "").strip()
    if not raw:
        return False
    try:
        p = urlparse(raw)
    except Exception:
        return False
    if p.scheme not in ("http", "https") or not p.netloc:
        return False

    host = (p.hostname or "").lower()
    port = p.port
    origin = f"{p.scheme}://{p.hostname}"
    if port and not ((p.scheme == "http" and port == 80) or (p.scheme == "https" and port == 443)):
        origin = f"{origin}:{port}"
    origin = origin.lower()

    entries = _load_registry().get("entries") or []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        match = str(entry.get("match") or "").strip()
        value = str(entry.get("value") or "").strip().lower()
        if not value:
            continue
        if match == "host" and host == value.rstrip("/"):
            return True
        if match == "host_suffix":
            suffix = value if value.startswith(".") else f".{value}"
            if host == suffix[1:] or host.endswith(suffix):
                return True
        if match == "origin_prefix" and origin.startswith(value.rstrip("/")):
            return True
    return False


def assert_registered_target_url(url: str) -> None:
    if not (url or "").strip():
        return
    if is_registered_target_url(url):
        return
    raise ValueError(registered_target_site_message())
