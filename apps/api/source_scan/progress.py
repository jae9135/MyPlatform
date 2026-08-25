from __future__ import annotations

import json
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal

SCAN_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="source-scan")
_scan_slot = threading.Semaphore(1)
_cancel_flags: set[str] = set()
_queue_order: list[str] = []
_active_job_id: str | None = None

StepStatus = Literal["pending", "running", "done", "skipped", "error", "cancelled"]

STEP_LABELS: dict[str, str] = {
    "prepare": "준비",
    "ingest": "ZIP 해제",
    "bandit": "Bandit (Python)",
    "eslint": "ESLint (TypeScript)",
    "pmd": "PMD 분석",
    "java_build": "Java 빌드 (Maven/Gradle)",
    "findsecbugs": "FindSecBugs 분석",
    "finalize": "결과 정리",
}

JOBS_DIR = Path(__file__).resolve().parent.parent / "data" / "source_scan_jobs"


@dataclass
class ScanStep:
    id: str
    label: str
    status: StepStatus = "pending"
    detail: str = ""


@dataclass
class ScanJob:
    id: str
    status: Literal["queued", "running", "done", "error", "cancelled"] = "queued"
    steps: list[ScanStep] = field(default_factory=list)
    pct: int = 0
    message: str = "진단 준비 중…"
    result: dict[str, Any] | None = None
    error: str | None = None
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finished_at: str | None = None
    queue_position: int = 0


_lock = threading.Lock()
_jobs: dict[str, ScanJob] = {}


class ScanCancelled(Exception):
    pass


def create_job(step_ids: list[str] | None = None) -> str:
    job_id = uuid.uuid4().hex
    steps = [ScanStep(id=sid, label=STEP_LABELS.get(sid, sid)) for sid in (step_ids or ["prepare", "finalize"])]
    job = ScanJob(id=job_id, steps=steps, status="queued")
    with _lock:
        _jobs[job_id] = job
        _queue_order.append(job_id)
        _refresh_queue_positions()
    return job_id


def get_job(job_id: str) -> ScanJob | None:
    with _lock:
        job = _jobs.get(job_id)
        if job:
            return job
    return _load_persisted_job(job_id)


def request_cancel(job_id: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if not job or job.status not in ("queued", "running"):
            return False
        _cancel_flags.add(job_id)
        if job.status == "queued":
            job.status = "cancelled"
            job.message = "대기 중 취소됨"
            job.finished_at = datetime.now(timezone.utc).isoformat()
            if job_id in _queue_order:
                _queue_order.remove(job_id)
            _refresh_queue_positions()
            return True
        job.message = "취소 요청됨…"
        return True


def is_cancelled(job_id: str) -> bool:
    with _lock:
        return job_id in _cancel_flags


def queue_status() -> dict[str, Any]:
    with _lock:
        return {
            "active_job_id": _active_job_id,
            "queued_job_ids": [j for j in _queue_order if _jobs.get(j) and _jobs[j].status == "queued"],
            "queue_length": len([j for j in _queue_order if _jobs.get(j) and _jobs[j].status == "queued"]),
        }


def _refresh_queue_positions() -> None:
    pos = 1
    for jid in _queue_order:
        job = _jobs.get(jid)
        if job and job.status == "queued":
            job.queue_position = pos
            pos += 1


def job_to_dict(job: ScanJob) -> dict[str, Any]:
    return {
        "ok": job.status not in ("error", "cancelled"),
        "job_id": job.id,
        "status": job.status,
        "pct": job.pct,
        "message": job.message,
        "queue_position": job.queue_position,
        "steps": [{"id": s.id, "label": s.label, "status": s.status, "detail": s.detail} for s in job.steps],
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "result": job.result if job.status == "done" else None,
        "error": job.error,
    }


def _ensure_jobs_dir() -> Path:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    return JOBS_DIR


def _persist_job(job: ScanJob) -> None:
    if job.status != "done" or not job.result:
        return
    _ensure_jobs_dir()
    path = JOBS_DIR / f"{job.id}.json"
    path.write_text(json.dumps(job_to_dict(job), ensure_ascii=False, indent=2), encoding="utf-8")


def _load_persisted_job(job_id: str) -> ScanJob | None:
    path = _ensure_jobs_dir() / f"{job_id}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        job = ScanJob(
            id=data["job_id"],
            status=data.get("status", "done"),
            pct=data.get("pct", 100),
            message=data.get("message", ""),
            result=data.get("result"),
            error=data.get("error"),
            started_at=data.get("started_at", ""),
            finished_at=data.get("finished_at"),
        )
        job.steps = [
            ScanStep(id=s["id"], label=s["label"], status=s["status"], detail=s.get("detail", ""))
            for s in data.get("steps") or []
        ]
        return job
    except Exception:
        return None


class ProgressReporter:
    def __init__(self, job_id: str):
        self.job_id = job_id

    def check_cancelled(self) -> None:
        if is_cancelled(self.job_id):
            raise ScanCancelled("사용자가 진단을 취소했습니다")

    def _update(self, fn: Callable[[ScanJob], None]) -> None:
        with _lock:
            job = _jobs.get(self.job_id)
            if not job:
                return
            fn(job)
            self._recalc_pct(job)

    @staticmethod
    def _recalc_pct(job: ScanJob) -> None:
        if not job.steps:
            job.pct = 0
            return
        weights = {"running": 0.5, "done": 1.0, "skipped": 1.0, "error": 1.0, "cancelled": 1.0}
        total = len(job.steps)
        score = sum(weights.get(s.status, 0.0) for s in job.steps)
        job.pct = min(99, int((score / total) * 100)) if job.status == "running" else 100

    def set_plan(
        self,
        step_ids: list[str],
        *,
        done_ids: list[str] | None = None,
        step_details: dict[str, str] | None = None,
    ) -> None:
        self.check_cancelled()
        done_set = set(done_ids or [])
        details = step_details or {}

        def _fn(job: ScanJob) -> None:
            job.steps = [
                ScanStep(
                    id=sid,
                    label=STEP_LABELS.get(sid, sid),
                    status="done" if sid in done_set else "pending",
                    detail=details.get(sid, ""),
                )
                for sid in step_ids
            ]

        self._update(_fn)

    def start(self, step_id: str, detail: str = "") -> None:
        self.check_cancelled()

        def _fn(job: ScanJob) -> None:
            for s in job.steps:
                if s.id == step_id:
                    s.status = "running"
                    s.detail = detail
                    job.message = detail or s.label

        self._update(_fn)

    def done(self, step_id: str, detail: str = "") -> None:
        def _fn(job: ScanJob) -> None:
            for s in job.steps:
                if s.id == step_id:
                    s.status = "done"
                    if detail:
                        s.detail = detail

        self._update(_fn)

    def skip(self, step_id: str, detail: str = "") -> None:
        def _fn(job: ScanJob) -> None:
            for s in job.steps:
                if s.id == step_id:
                    s.status = "skipped"
                    s.detail = detail

        self._update(_fn)

    def set_message(self, message: str) -> None:
        def _fn(job: ScanJob) -> None:
            job.message = message

        self._update(_fn)

    def complete(self, result: dict[str, Any]) -> None:
        with _lock:
            job = _jobs.get(self.job_id)
            if not job:
                return
            job.status = "done"
            job.pct = 100
            job.message = "진단 완료"
            job.result = result
            job.finished_at = datetime.now(timezone.utc).isoformat()
            for s in job.steps:
                if s.status in ("pending", "running"):
                    s.status = "done"
            _persist_job(job)

    def fail(self, error: str) -> None:
        with _lock:
            job = _jobs.get(self.job_id)
            if not job:
                return
            job.status = "error"
            job.error = error
            job.message = error
            job.finished_at = datetime.now(timezone.utc).isoformat()
            for s in job.steps:
                if s.status == "running":
                    s.status = "error"
                    s.detail = error

    def cancelled(self) -> None:
        with _lock:
            job = _jobs.get(self.job_id)
            if not job:
                return
            job.status = "cancelled"
            job.message = "진단 취소됨"
            job.error = "cancelled"
            job.finished_at = datetime.now(timezone.utc).isoformat()
            for s in job.steps:
                if s.status in ("pending", "running"):
                    s.status = "cancelled"


def submit_scan_job(fn: Callable[..., None], *args: Any, **kwargs: Any) -> None:
    global _active_job_id

    def _wrapped() -> None:
        global _active_job_id
        job_id = kwargs.get("job_id") or (args[0] if args else None)
        acquired = _scan_slot.acquire(blocking=False)
        if not acquired and job_id:
            ProgressReporter(str(job_id)).set_message("다른 진단 실행 중 — 대기…")
            _scan_slot.acquire(blocking=True)
        elif not acquired:
            _scan_slot.acquire(blocking=True)
        try:
            if job_id:
                with _lock:
                    job = _jobs.get(str(job_id))
                    if job and job.status == "cancelled":
                        return
                    if job:
                        job.status = "running"
                        _active_job_id = str(job_id)
                    if str(job_id) in _queue_order:
                        _queue_order.remove(str(job_id))
                    _refresh_queue_positions()
            fn(*args, **kwargs)
        finally:
            with _lock:
                if job_id and _active_job_id == str(job_id):
                    _active_job_id = None
                if job_id:
                    _cancel_flags.discard(str(job_id))
            _scan_slot.release()

    SCAN_EXECUTOR.submit(_wrapped)
