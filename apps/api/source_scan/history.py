from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HISTORY_DIR = Path(__file__).resolve().parent.parent / "data" / "source_scan_history"
MAX_HISTORY = 100


def _safe_slug(value: str) -> str:
    return re.sub(r"[^\w\-]+", "_", value)[:80]


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
            out.append(
                {
                    "job_id": data.get("job_id"),
                    "file": path.name,
                    "saved_at": data.get("saved_at"),
                    "target": payload.get("target"),
                    "target_name": payload.get("target_name"),
                    "mode": payload.get("mode"),
                    "scanned_at": payload.get("scanned_at"),
                    "fail": stats.get("fail", 0),
                    "not_scanned": stats.get("not_scanned", 0),
                    "languages": payload.get("languages") or [],
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


def find_previous_for_target(target: str, mode: str, exclude_job_id: str | None = None) -> dict[str, Any] | None:
    for item in list_history(limit=MAX_HISTORY):
        if item.get("target") != target or item.get("mode") != mode:
            continue
        jid = item.get("job_id")
        if exclude_job_id and jid == exclude_job_id:
            continue
        if jid:
            rec = load_history(str(jid))
            if rec:
                return rec
    return None
