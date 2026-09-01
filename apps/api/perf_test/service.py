from __future__ import annotations

import importlib.util
import os
from datetime import datetime, timezone
from typing import Any, Callable
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
from perf_test.runner import record_har_multi, run_locust_load_test
from perf_test.subprocess_runner import run_locust_isolated
from perf_test.portal_urls import list_portal_urls
from perf_test.scenario_urls import (
    _manifest_path_for_target,
    build_requests_from_scenarios,
    fetch_scenarios,
    select_candidates,
    split_candidates_by_session,
    urls_to_requests,
)
from perf_test.session import resolve_storage_state


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


def attach_session(opts: PerfTestOptions, session_storage_bytes: bytes | None = None) -> PerfTestOptions:
    """session_job_id / 업로드 JSON → opts.session_storage."""
    if opts.session_storage:
        return opts
    state = resolve_storage_state(
        session_job_id=opts.session_job_id,
        session_storage_bytes=session_storage_bytes,
        base_url=opts.base_url,
    )
    if state:
        opts.session_storage = state
    return opts


def validate_run(opts: PerfTestOptions, *, session_storage_bytes: bytes | None = None) -> dict[str, Any]:
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

    if opts.record_har and not opts.target and not opts.manual_urls and not opts.base_url:
        errors.append("HAR 녹화 시 base_url 또는 부하 경로(manual_urls)가 필요합니다.")

    if opts.record_har:
        from web_quality.runtime_env import check_playwright_runtime_threadsafe  # type: ignore

        pw = check_playwright_runtime_threadsafe()
        if not (pw.get("browser_ready") or pw.get("ok")):
            errors.append(pw.get("message") or "Playwright Chromium 미설치")

    try:
        attach_session(opts, session_storage_bytes)
    except ValueError as e:
        errors.append(str(e))

    if (
        opts.record_har
        and opts.base_url
        and not _is_localhost_url(opts.base_url)
        and not opts.session_storage
        and not opts.session_job_id
    ):
        warnings.append(
            "외부 URL HAR — 로그인 필요 사이트는 「로그인 세션」 생성 또는 storage_state JSON 업로드를 권장합니다."
        )

    if opts.access == "auth" and opts.record_har and not opts.session_storage:
        warnings.append("access=auth 이지만 로그인 세션이 없습니다. 공개 페이지만 녹화될 수 있습니다.")

    if not errors:
        try:
            if opts.target:
                payload = fetch_scenarios(opts.target, base_url=opts.base_url, access=opts.access)
                selected = select_candidates(payload, opts.state_ids)
                _, skipped = split_candidates_by_session(
                    selected, has_session=bool(opts.session_storage)
                )
                if skipped:
                    labels = ", ".join(
                        str(s.get("label") or s.get("state_id") or "") for s in skipped[:5]
                    )
                    extra = f" 외 {len(skipped) - 5}개" if len(skipped) > 5 else ""
                    warnings.append(
                        f"로그인 세션 없음 — {len(skipped)}개 시나리오는 실행 시 제외됩니다: {labels}{extra}"
                    )
                if selected and not skipped and not opts.session_storage:
                    auth_count = sum(
                        1
                        for c in selected
                        if str(c.get("access") or "auth").strip().lower() == "auth"
                    )
                    if auth_count == len(selected):
                        warnings.append(
                            "선택한 시나리오가 모두 로그인 필요입니다. 세션 없으면 실행할 수 없습니다."
                        )
        except Exception as e:
            errors.append(str(e))

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "options": opts.to_dict(),
    }


def _resolve_requests(
    opts: PerfTestOptions,
    *,
    cancel_check: Callable[[], bool] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    meta: dict[str, Any] = {"har_recorded": False}
    base_url = opts.base_url
    scenario_payload: dict[str, Any] = {}
    storage = opts.session_storage
    meta["session_used"] = bool(storage)

    if opts.target:
        scenario_payload = fetch_scenarios(opts.target, base_url=base_url, access=opts.access)
        if not base_url:
            base_url = str(scenario_payload.get("base_url") or scenario_payload.get("page_url") or "").rstrip("/")
        if not base_url:
            raise ValueError("base_url을 입력하거나 target에서 URL을 추출할 수 없습니다.")

        if opts.record_har:
            selected_all = select_candidates(scenario_payload, opts.state_ids)
            if not selected_all:
                raw_cands = scenario_payload.get("candidates") or []
                selected_all = [c for c in raw_cands if isinstance(c, dict)][:1]
            runnable, skipped = split_candidates_by_session(
                selected_all, has_session=bool(storage)
            )
            meta["skipped_scenarios"] = skipped
            if not runnable:
                if skipped:
                    raise ValueError(
                        "선택한 시나리오가 모두 로그인 필요인데 세션이 없습니다. "
                        "「로그인 세션」을 준비하거나 공개 시나리오만 선택하세요."
                    )
                raise ValueError("실행할 시나리오가 없습니다.")
            try:
                manifest_path = _manifest_path_for_target(str(scenario_payload.get("target") or ""))
                requests, scenario_har = record_har_multi(
                    base_url,
                    candidates=runnable,
                    manifest_path=manifest_path,
                    target_id=str(scenario_payload.get("target") or ""),
                    storage_state=storage,
                    cancel_check=cancel_check,
                )
                meta["har_recorded"] = True
                meta["request_source"] = "har"
                meta["har_targets"] = len(runnable)
                meta["scenario_har"] = scenario_har
            except Exception as e:
                runnable_ids = [str(c.get("state_id")) for c in runnable if c.get("state_id")]
                requests, urls = build_requests_from_scenarios(
                    scenario_payload,
                    runnable_ids,
                    base_url,
                    None,
                )
                meta["har_recorded"] = False
                meta["request_source"] = "scenario"
                meta["har_fallback_reason"] = str(e)
                meta["urls"] = urls
        else:
            selected_all = select_candidates(scenario_payload, opts.state_ids)
            runnable, skipped = split_candidates_by_session(
                selected_all, has_session=bool(storage)
            )
            meta["skipped_scenarios"] = skipped
            if not runnable:
                if skipped:
                    raise ValueError(
                        "선택한 시나리오가 모두 로그인 필요인데 세션이 없습니다. "
                        "「로그인 세션」을 준비하거나 공개 시나리오만 선택하세요."
                    )
                raise ValueError("실행할 시나리오가 없습니다.")
            runnable_ids = [str(c.get("state_id")) for c in runnable if c.get("state_id")]
            requests, urls = build_requests_from_scenarios(
                scenario_payload,
                runnable_ids,
                base_url,
                None,
            )
            meta["request_source"] = "scenario"
            meta["urls"] = urls
    else:
        if not base_url:
            raise ValueError("base_url이 필요합니다.")
        manual_list = opts.manual_urls or [base_url]
        if opts.record_har:
            try:
                requests = record_har_multi(
                    base_url,
                    manual_urls=manual_list,
                    storage_state=storage,
                    cancel_check=cancel_check,
                )[0]
                meta["har_recorded"] = True
                meta["request_source"] = "har"
                meta["har_targets"] = len(manual_list)
            except Exception as e:
                requests = urls_to_requests(manual_list, base_url)
                meta["har_recorded"] = False
                meta["request_source"] = "manual"
                meta["har_fallback_reason"] = str(e)
        else:
            requests = urls_to_requests(manual_list, base_url)
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

    if opts.record_har:
        update_job(job_id, pct=7, message="Playwright HAR 녹화 중…", step_label="har")

    requests, meta = _resolve_requests(opts, cancel_check=lambda: is_cancelled(job_id))
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
        storage_state=opts.session_storage,
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
        "har_fallback_reason": meta.get("har_fallback_reason"),
        "har_targets": meta.get("har_targets"),
        "scenario_har": meta.get("scenario_har") or [],
        "session_used": meta.get("session_used", False),
        "skipped_scenarios": meta.get("skipped_scenarios") or [],
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


def start_run_job(opts: PerfTestOptions, *, session_storage_bytes: bytes | None = None) -> dict[str, Any]:
    try:
        attach_session(opts, session_storage_bytes)
    except ValueError as e:
        return {
            "ok": False,
            "async": False,
            "errors": [str(e)],
            "warnings": [],
        }

    validation = validate_run(opts, session_storage_bytes=None)
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


def preview_run_scenarios(
    opts: PerfTestOptions,
    *,
    session_storage_bytes: bytes | None = None,
) -> dict[str, Any]:
    from perf_test.scenario_preview import preview_scenarios

    return preview_scenarios(opts, session_storage_bytes=session_storage_bytes)


def validate_perf_session(
    *,
    session_job_id: str = "",
    base_url: str = "",
    session_storage_bytes: bytes | None = None,
) -> dict[str, Any]:
    from perf_test.session import check_portal_session

    return check_portal_session(
        session_job_id=session_job_id,
        session_storage_bytes=session_storage_bytes,
        base_url=base_url,
    )
