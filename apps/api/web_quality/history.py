from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HISTORY_DIR = Path(__file__).resolve().parent.parent / "data" / "web_quality_history"
MAX_HISTORY = 50


def _safe_slug(value: str) -> str:
    return re.sub(r"[^\w\-]+", "_", value)[:80]


def scan_identity(payload: dict[str, Any]) -> tuple[str, str, str]:
    mode = str(payload.get("mode") or "")
    target = str(payload.get("target") or "")
    page_url = str(payload.get("page_url") or payload.get("base_url") or "").rstrip("/")
    return mode, target, page_url


def ensure_history_dir() -> Path:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    return HISTORY_DIR


def save_scan_result(job_id: str, payload: dict[str, Any]) -> Path:
    ensure_history_dir()
    target = payload.get("target") or "scan"
    scanned_at = payload.get("scanned_at") or datetime.now(timezone.utc).isoformat()
    fname = f"{scanned_at[:10]}_{_safe_slug(str(target))}_{job_id[:8]}.json"
    path = HISTORY_DIR / fname
    record = {
        "job_id": job_id,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    _trim_history()
    return path


def _trim_history() -> None:
    files = sorted(HISTORY_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[MAX_HISTORY:]:
        old.unlink(missing_ok=True)


def list_history(limit: int = 30) -> list[dict[str, Any]]:
    ensure_history_dir()
    files = sorted(HISTORY_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    out: list[dict[str, Any]] = []
    for path in files[:limit]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            payload = data.get("payload") or {}
            stats = payload.get("stats") or {}
            mode, target, page_url = scan_identity(payload)
            out.append(
                {
                    "job_id": data.get("job_id"),
                    "file": path.name,
                    "saved_at": data.get("saved_at"),
                    "target": target,
                    "target_name": payload.get("target_name"),
                    "mode": mode,
                    "page_url": page_url,
                    "scanned_at": payload.get("scanned_at"),
                    "fail": stats.get("fail", 0),
                    "not_scanned": stats.get("not_scanned", 0),
                    "pass": stats.get("pass", 0),
                }
            )
        except Exception:
            continue
    return out


def load_history(job_id: str) -> dict[str, Any] | None:
    ensure_history_dir()
    for path in HISTORY_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("job_id") == job_id:
                return data
        except Exception:
            continue
    return None


def find_previous_scan(
    payload: dict[str, Any],
    *,
    exclude_job_id: str | None = None,
) -> dict[str, Any] | None:
    mode, target, page_url = scan_identity(payload)
    for item in list_history(limit=MAX_HISTORY):
        if item.get("mode") != mode or item.get("target") != target:
            continue
        if page_url and item.get("page_url") != page_url:
            continue
        jid = item.get("job_id")
        if exclude_job_id and jid == exclude_job_id:
            continue
        if jid:
            rec = load_history(str(jid))
            if rec:
                return rec
    return None
