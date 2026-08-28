from __future__ import annotations

import importlib.util
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from perf_test.history import list_history, load_history, save_run_result
from perf_test.job_progress import (
    PerfCancelled,
    check_cancelled,
    create_job,
    get_job,
    is_cancelled,
    job_to_dict,
    request_cancel,
    submit_job,
    update_job,
)
from perf_test.options import DEFAULT_MAX_USERS, PerfTestOptions
from perf_test.runner import record_har_requests, run_locust_load_test
from perf_test.subprocess_runner import run_locust_isolated
from perf_test.portal_urls import list_portal_urls
from perf_test.scenario_urls import (
    build_requests_from_scenarios,
    fetch_scenarios,
    urls_to_requests,
)


def is_load_allowed() -> bool:
    if os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"):
        return os.getenv("ALLOW_PERF_LOAD", "").strip().lower() in ("1", "true", "yes")
    return True


def locust_installed() -> bool:
    return importlib.util.find_spec("locust") is not None


def get_environment_status() -> dict[str, Any]:
    return {
        "load_allowed": is_load_allowed(),
        "locust_installed": locust_installed(),
        "max_users": DEFAULT_MAX_USERS,
        "engine": "locust",
        "note": "부하는 로컬 API에서만 실행하세요. Render에서는 ALLOW_PERF_LOAD=true 없이 차단됩니다.",
    }


def list_scenarios(
    target: str,
    *,
    base_url: str = "",
    access: str = "public",
) -> dict[str, Any]:
    payload = fetch_scenarios(target, base_url=base_url, access=access)
    payload["ok"] = True
    return payload


def get_portal_urls() -> dict[str, Any]:
    return list_portal_urls()


def _is_localhost_url(url: str) -> bool:
    try:
        host = urlparse(url if "://" in url else f"http://{url}").hostname or ""
    except Exception:
        return False
    return host.lower() in ("localhost", "127.0.0.1", "::1")


def validate_run(opts: PerfTestOptions) -> dict[str, Any]:
    warnings: list[str] = []
    errors: list[str] = []

    if not is_load_allowed():
        errors.append("클라우드 API에서는 부하 실행이 비활성화되어 있습니다. 로컬 API를 사용하세요.")

    if not locust_installed():
        errors.append("locust 패키지가 없습니다. pip install locust 후 API를 재시작하세요.")

    if not opts.base_url and not opts.target:
        errors.append("base_url 또는 target이 필요합니다.")

    if opts.users > DEFAULT_MAX_USERS:
        errors.append(f"동시 사용자 상한은 {DEFAULT_MAX_USERS}입니다.")

    if opts.users > 20 and not opts.confirm_high_load:
        errors.append("동시 사용자 20명 초과 시 confirm_high_load=true 가 필요합니다.")

    if opts.base_url and not _is_localhost_url(opts.base_url) and opts.users > 10 and not opts.confirm_high_load:
        warnings.append("외부 URL에 높은 부하 — confirm_high_load 확인 권장")

    if not errors:
        try:
            if opts.target:
                fetch_scenarios(opts.target, base_url=opts.base_url, access=opts.access)
        except Exception as e:
            errors.append(str(e))

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "options": opts.to_dict(),
    }


def _resolve_requests(opts: PerfTestOptions) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    meta: dict[str, Any] = {"har_recorded": False}
    base_url = opts.base_url
    scenario_payload: dict[str, Any] = {}

    if opts.target:
        scenario_payload = fetch_scenarios(opts.target, base_url=base_url, access=opts.access)
        if not base_url:
            base_url = str(scenario_payload.get("base_url") or scenario_payload.get("page_url") or "").rstrip("/")
        if not base_url:
            raise ValueError("base_url을 입력하거나 target에서 URL을 추출할 수 없습니다.")

        if opts.record_har:
            selected = opts.state_ids
            candidates = scenario_payload.get("candidates") or []
            candidate = None
            if selected:
                id_set = set(selected)
                for c in candidates:
                    if isinstance(c, dict) and c.get("state_id") in id_set:
                        candidate = c
                        break
            if not candidate and candidates:
                candidate = candidates[0] if isinstance(candidates[0], dict) else None
            requests = record_har_requests(base_url, candidate)
            meta["har_recorded"] = True
            meta["request_source"] = "har"
        else:
            requests, urls = build_requests_from_scenarios(
                scenario_payload,
                opts.state_ids,
                base_url,
                opts.manual_urls,
            )
            meta["request_source"] = "scenario"
            meta["urls"] = urls
    else:
        if not base_url:
            raise ValueError("base_url이 필요합니다.")
        requests = urls_to_requests(opts.manual_urls or [base_url], base_url)
        meta["request_source"] = "manual"

    if not requests:
        raise ValueError("실행할 HTTP 요청이 없습니다. 시나리오 또는 URL을 확인하세요.")

    meta["base_url"] = base_url
    meta["scenario"] = {
        "target": opts.target,
        "target_name": scenario_payload.get("target_name"),
        "state_ids": opts.state_ids,
    }
    return requests, meta


def _run_job_body(job_id: str, opts: PerfTestOptions) -> None:
    check_cancelled(job_id)
    update_job(job_id, pct=5, message="시나리오·요청 준비 중…", step_label="prepare")

    def on_progress(pct: int, msg: str, live: dict[str, Any] | None) -> None:
        check_cancelled(job_id)
        update_job(job_id, pct=pct, message=msg, live_stats=live, step_label="load")

    requests, meta = _resolve_requests(opts)
    check_cancelled(job_id)
    update_job(job_id, pct=10, message=f"Locust 부하 시작 · {len(requests)} URL", step_label="locust")

    result = run_locust_isolated(
        meta["base_url"],
        requests,
        users=opts.users,
        spawn_rate=opts.spawn_rate,
        duration_sec=opts.duration_sec,
        on_progress=on_progress,
        cancel_check=lambda: is_cancelled(job_id),
    )

    check_cancelled(job_id)
    ran_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "ok": True,
        "ran_at": ran_at,
        "target": opts.target or "manual",
        "target_name": meta.get("scenario", {}).get("target_name") or opts.target or "manual",
        "base_url": meta["base_url"],
        "users": opts.users,
        "spawn_rate": opts.spawn_rate,
        "duration_sec": opts.duration_sec,
        "request_source": meta.get("request_source"),
        "har_recorded": meta.get("har_recorded", False),
        "state_ids": opts.state_ids,
        "summary": result["summary"],
        "time_series": result["time_series"],
        "endpoints": result["endpoints"],
        "requests_preview": requests[:20],
    }
    save_run_result(job_id, payload)
    update_job(
        job_id,
        status="done",
        pct=100,
        message="성능검사 완료",
        step_label="done",
        result=payload,
    )


def start_run_job(opts: PerfTestOptions) -> dict[str, Any]:
    validation = validate_run(opts)
    if not validation["ok"]:
        return {
            "ok": False,
            "async": False,
            "errors": validation["errors"],
            "warnings": validation.get("warnings") or [],
        }

    job_id = create_job("perf-run", message="대기 중…")

    def work() -> None:
        try:
            _run_job_body(job_id, opts)
        except PerfCancelled:
            raise
        except Exception as e:
            update_job(job_id, status="error", error=str(e), message=str(e))

    submit_job(job_id, work)
    job = get_job(job_id)
    out = job_to_dict(job) if job else {"job_id": job_id}
    out["async"] = True
    out["warnings"] = validation.get("warnings") or []
    return out


def get_perf_job(job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        return {"ok": False, "error": "job not found", "job_id": job_id}
    return job_to_dict(job)


def cancel_perf_job(job_id: str) -> dict[str, Any]:
    ok = request_cancel(job_id)
    return {"ok": ok, "job_id": job_id, "cancelled": ok}


def get_perf_history(limit: int = 30) -> dict[str, Any]:
    return {"ok": True, "items": list_history(limit=limit)}


def get_perf_history_record(job_id: str) -> dict[str, Any]:
    rec = load_history(job_id)
    if not rec:
        return {"ok": False, "error": "not found", "job_id": job_id}
    return {"ok": True, **rec}
