from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HISTORY_DIR = Path(__file__).resolve().parent.parent / "data" / "perf_test_history"
MAX_HISTORY = 50


def _safe_slug(value: str) -> str:
    return re.sub(r"[^\w\-]+", "_", value)[:80]


def run_identity(payload: dict[str, Any]) -> tuple[str, str]:
    target = str(payload.get("target") or "")
    base_url = str(payload.get("base_url") or "").rstrip("/")
    return target, base_url


def ensure_history_dir() -> Path:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    return HISTORY_DIR


def save_run_result(job_id: str, payload: dict[str, Any]) -> Path:
    ensure_history_dir()
    target = payload.get("target") or "perf"
    ran_at = payload.get("ran_at") or datetime.now(timezone.utc).isoformat()
    fname = f"{ran_at[:10]}_{_safe_slug(str(target))}_{job_id[:8]}.json"
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
            summary = payload.get("summary") or {}
            target, base_url = run_identity(payload)
            out.append(
                {
                    "job_id": data.get("job_id"),
                    "file": path.name,
                    "saved_at": data.get("saved_at"),
                    "target": target,
                    "target_name": payload.get("target_name"),
                    "base_url": base_url,
                    "ran_at": payload.get("ran_at"),
                    "users": payload.get("users"),
                    "duration_sec": payload.get("duration_sec"),
                    "total_requests": summary.get("total_requests"),
                    "fail_ratio": summary.get("fail_ratio"),
                    "avg_response_time_ms": summary.get("avg_response_time_ms"),
                    "rps": summary.get("rps"),
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
