"""웹 품질 진단 비동기 작업 · 진행률."""
from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Literal

EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="web-quality")

JobStatus = Literal["queued", "running", "done", "error", "cancelled"]


class ScanCancelled(Exception):
    pass


@dataclass
class WqJob:
    id: str
    kind: str
    status: JobStatus = "queued"
    pct: int = 0
    message: str = "준비 중…"
    step_label: str = ""
    result: dict[str, Any] | None = None
    error: str | None = None
    file_path: str | None = None
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finished_at: str | None = None


_lock = threading.Lock()
_jobs: dict[str, WqJob] = {}
_cancel_flags: set[str] = set()


def create_job(kind: str, message: str = "준비 중…") -> str:
    job_id = uuid.uuid4().hex
    with _lock:
        _jobs[job_id] = WqJob(id=job_id, kind=kind, message=message)
    return job_id


def get_job(job_id: str) -> WqJob | None:
    with _lock:
        return _jobs.get(job_id)


def request_cancel(job_id: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if not job or job.status in ("done", "error", "cancelled"):
            return False
        _cancel_flags.add(job_id)
        if job.status == "queued":
            job.status = "cancelled"
            job.message = "취소됨"
            job.error = "cancelled"
            job.finished_at = datetime.now(timezone.utc).isoformat()
        return True


def is_cancelled(job_id: str) -> bool:
    with _lock:
        return job_id in _cancel_flags


def clear_cancel(job_id: str) -> None:
    with _lock:
        _cancel_flags.discard(job_id)


def check_cancelled(job_id: str) -> None:
    if is_cancelled(job_id):
        raise ScanCancelled("cancelled")


def update_job(
    job_id: str,
    *,
    status: JobStatus | None = None,
    pct: int | None = None,
    message: str | None = None,
    step_label: str | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    file_path: str | None = None,
) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if status is not None:
            job.status = status
        if pct is not None:
            job.pct = max(0, min(100, pct))
        if message is not None:
            job.message = message
        if step_label is not None:
            job.step_label = step_label
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        if file_path is not None:
            job.file_path = file_path
        if status in ("done", "error", "cancelled"):
            job.finished_at = datetime.now(timezone.utc).isoformat()
            _cancel_flags.discard(job_id)


def job_to_dict(job: WqJob) -> dict[str, Any]:
    return {
        "ok": job.status not in ("error", "cancelled"),
        "job_id": job.id,
        "kind": job.kind,
        "status": job.status,
        "pct": job.pct,
        "message": job.message,
        "step_label": job.step_label,
        "error": job.error,
        "has_file": bool(job.file_path),
        "result": job.result,
        "finished_at": job.finished_at,
    }


def submit_job(job_id: str, fn: Callable[[], None]) -> None:
    def runner() -> None:
        try:
            update_job(job_id, status="running", pct=1)
            fn()
        except ScanCancelled:
            update_job(job_id, status="cancelled", message="취소됨", error="cancelled")
        except Exception as e:
            update_job(job_id, status="error", error=str(e), message=str(e))
        finally:
            clear_cancel(job_id)

    EXECUTOR.submit(runner)
