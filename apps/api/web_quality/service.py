from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from web_quality.catalog import load_egov_rules, load_kwcag_rules
from web_quality.external_scanner import ExternalLoginConfig, scan_external_url_runtime
from web_quality.external_scenario_extract import discover_external_scenarios
from web_quality.fix_guides import enrich_finding
from web_quality.findings_utils import compute_diff
from web_quality.history import find_previous_scan, list_history, load_history, save_scan_result
from web_quality.manifest import (
    PORTAL_TARGET_IDS,
    TARGETS,
    get_source_files,
    get_target,
    get_ui_states,
)
from web_quality.playwright_scanner import scan_portal_target_runtime
from web_quality.runtime_common import RuntimeScanResult
from web_quality.runtime_env import check_playwright_runtime, get_environment_status
from web_quality.scenario_extract import (
    extract_scenarios,
    is_extractable,
    load_candidates,
    parse_state_ids,
)
from web_quality.java_runtime_scanner import scan_java_upload_runtime
from web_quality.java_scenario_extract import extract_java_scenarios, extract_java_zip_scenarios
from web_quality.java_static_scanner import scan_java_upload_sources
from web_quality.ipms_scanner import (
    fetch_ipms_shell_static,
    parse_storage_state,
    scan_ipms_online_runtime,
)
from web_quality.ipms_session import (
    SessionDetect,
    load_session_json,
    start_browser_session_job,
    start_ipms_session_job,
)
from web_quality.job_progress import (
    ScanCancelled,
    check_cancelled,
    create_job,
    get_job,
    job_to_dict,
    submit_job,
    update_job,
)
from web_quality.presets.ipms_online import (
    IPMS_DEFAULT_BASE,
    build_ipms_candidates,
    extract_ipms_scenarios,
)


def _ipms_access_from_mode(mode: str, ipms_access: str = "public") -> str:
    m = (mode or "").strip().lower()
    if m == "ipms-public":
        return "public"
    if m == "ipms-auth":
        return "auth"
    if m == "ipms-online":
        return (ipms_access or "public").strip().lower()
    return "public"


def _is_ipms_mode(mode: str) -> bool:
    return (mode or "").strip().lower() in ("ipms-online", "ipms-public", "ipms-auth")


def _finalize_scan_result(payload: dict[str, Any], job_id: str | None = None) -> dict[str, Any]:
    import uuid

    jid = job_id or uuid.uuid4().hex
    out = dict(payload)
    out["job_id"] = jid
    prev = find_previous_scan(out, exclude_job_id=jid)
    if prev and prev.get("payload"):
        out["diff"] = compute_diff(out.get("findings") or [], (prev["payload"].get("findings") or []))
    save_scan_result(jid, out)
    return out


def validate_web_quality(
    mode: str,
    target: str,
    base_url: str = "",
    password: str = "",
    page_url: str = "",
    *,
    include_runtime: bool = True,
    ipms_access: str = "public",
) -> dict[str, Any]:
    mode = (mode or "external").strip().lower()
    allowed = ("external", "ipms-online", "ipms-public", "ipms-auth", "java-upload")
    if mode not in allowed:
        return {"ok": False, "can_run": False, "message": "mode는 external|ipms-public|ipms-auth|java-upload"}

    env = get_environment_status()
    pw_env = env.get("portal_password_set")
    playwright = env.get("playwright") or {}

    if mode == "java-upload":
        runtime_ready = bool(playwright.get("browser_ready"))
        url = (page_url or "").strip()
        if not include_runtime:
            return {
                "ok": True,
                "can_run": True,
                "message": "Java ZIP — JSP/HTML 정적 진단 (URL·로그인 불필요)",
                "mode": mode,
                "portal_password_set": pw_env,
                "playwright": playwright,
                "runtime_ready": runtime_ready,
            }
        hints: list[str] = ["Java ZIP — 화면(Playwright) 진단"]
        if not url.startswith("http://") and not url.startswith("https://"):
            hints.append("배포 URL 입력 필요")
        elif not runtime_ready:
            hints.append(playwright.get("message") or "Playwright Chromium 미설치")
        return {
            "ok": True,
            "can_run": True,
            "message": " · ".join(hints),
            "mode": mode,
            "page_url": url,
            "portal_password_set": pw_env,
            "playwright": playwright,
            "runtime_ready": runtime_ready,
        }

    if _is_ipms_mode(mode):
        url = (page_url or base_url or IPMS_DEFAULT_BASE).strip()
        tier = _ipms_access_from_mode(mode, ipms_access)
        runtime_ready = bool(playwright.get("browser_ready"))
        if not url.startswith("http://") and not url.startswith("https://"):
            return {
                "ok": False,
                "can_run": False,
                "message": "IPMS URL은 http:// 또는 https:// 로 시작해야 합니다.",
            }
        label = "공개(비로그인)" if tier == "public" else "로그인 후"
        hints = [f"IPMS {label} 화면 진단"]
        if include_runtime and not runtime_ready:
            hints.append(playwright.get("message") or "Playwright Chromium 미설치")
        if tier == "auth" and include_runtime:
            hints.append("「로그인 세션 생성」 후 진단 (공동인증서 2단계)")
        return {
            "ok": True,
            "can_run": True,
            "message": " · ".join(hints),
            "mode": mode,
            "page_url": url,
            "ipms_access": tier,
            "portal_password_set": pw_env,
            "playwright": playwright,
            "runtime_ready": runtime_ready if include_runtime else True,
        }

    url = (page_url or "").strip()
    runtime_ready = bool(playwright.get("browser_ready"))
    if not url.startswith("http://") and not url.startswith("https://"):
        return {
            "ok": False,
            "can_run": False,
            "message": "URL은 http:// 또는 https:// 로 시작해야 합니다.",
        }
    hints = ["외부 URL · 실시간 화면 시나리오 진단"]
    if include_runtime and not runtime_ready:
        hints.append(playwright.get("message") or "Playwright Chromium 미설치")
    return {
        "ok": True,
        "can_run": True,
        "message": " · ".join(hints),
        "mode": "external",
        "page_url": url,
        "portal_password_set": pw_env,
        "playwright": playwright,
        "runtime_ready": runtime_ready if include_runtime else True,
    }


def run_web_quality(
    mode: str,
    target: str,
    base_url: str,
    password: str = "",
    *,
    include_runtime: bool = True,
    page_url: str = "",
    login_url: str = "",
    login_username: str = "",
    login_password: str = "",
    login_user_selector: str = "",
    login_password_selector: str = "",
    login_submit_selector: str = "",
    state_ids: str | list | None = None,
    zip_bytes: bytes | None = None,
    ipms_access: str = "public",
    session_storage_bytes: bytes | None = None,
    session_job_id: str = "",
    async_progress: bool = False,
    need_login: bool = False,
) -> dict[str, Any]:
    mode = (mode or "portal").strip().lower()

    if _is_ipms_mode(mode):
        tier = _ipms_access_from_mode(mode, ipms_access)
        if async_progress:
            return start_ipms_run_job(
                page_url=page_url or base_url,
                include_runtime=include_runtime,
                state_ids=state_ids,
                ipms_access=tier,
                session_storage_bytes=session_storage_bytes,
                session_job_id=session_job_id,
                display_mode=mode,
            )
        return _finalize_scan_result(
            _run_ipms_online(
            page_url=page_url or base_url,
            include_runtime=include_runtime,
            state_ids=state_ids,
            ipms_access=tier,
            session_storage_bytes=session_storage_bytes,
            session_job_id=session_job_id,
            display_mode=mode,
            )
        )

    if mode == "java-upload":
        if not zip_bytes:
            raise ValueError("java-upload mode requires ZIP file")
        return _finalize_scan_result(
            _run_java_upload(
            zip_bytes,
            page_url=page_url,
            include_runtime=include_runtime,
            state_ids=state_ids,
            login_url=login_url,
            login_username=login_username,
            login_password=login_password,
            login_user_selector=login_user_selector,
            login_password_selector=login_password_selector,
            login_submit_selector=login_submit_selector,
            )
        )

    if mode == "source":
        return _run_source(target, state_ids=state_ids)

    if mode == "external":
        if async_progress:
            return start_external_run_job(
                page_url=page_url,
                include_runtime=include_runtime,
                state_ids=state_ids,
                login_url=login_url,
                login_username=login_username,
                login_password=login_password,
                portal_password=password,
                login_user_selector=login_user_selector,
                login_password_selector=login_password_selector,
                login_submit_selector=login_submit_selector,
                session_storage_bytes=session_storage_bytes,
                session_job_id=session_job_id,
                need_login=need_login,
            )
        return _finalize_scan_result(
            _run_external(
            page_url=page_url,
            include_runtime=include_runtime,
            state_ids=state_ids,
            login_url=login_url,
            login_username=login_username,
            login_password=login_password,
            portal_password=password,
            login_user_selector=login_user_selector,
            login_password_selector=login_password_selector,
            login_submit_selector=login_submit_selector,
            session_storage_bytes=session_storage_bytes,
            session_job_id=session_job_id,
            need_login=need_login,
            )
        )

    if target not in PORTAL_TARGET_IDS:
        raise ValueError(f"unsupported mode or target: {mode}")

    cfg = get_target(target) or {}
    url = base_url.strip().rstrip("/")
    pw = password.strip() or __import__("os").environ.get("PORTAL_PASSWORD", "").strip()

    selected_ids = parse_state_ids(state_ids)
    extra_reasons: dict[str, str] = {}
    runtime_states = get_ui_states(target)
    scenario_payload: list[dict] | None = None
    coverage_states = runtime_states

    if is_extractable(target) and selected_ids is not None:
        candidates, _warnings = load_candidates(target)
        by_id = {c.state_id: c for c in candidates}
        unknown = [sid for sid in selected_ids if sid not in by_id]
        if unknown:
            raise ValueError(f"알 수 없는 state_id: {', '.join(unknown)}")
        chosen_set = {sid for sid in selected_ids if by_id[sid].selectable}
        chosen = [c for c in candidates if c.state_id in chosen_set]
        runtime_states = [c.to_ui_state() for c in chosen]
        scenario_payload = [c.to_dict() for c in chosen]
        coverage_states = [c.to_ui_state() for c in candidates]
        chosen_ids = {c.state_id for c in chosen}
        for c in candidates:
            if c.state_id in chosen_ids:
                continue
            extra_reasons[c.state_id] = (
                c.skip_reason or "실행 불가" if not c.selectable else "사용자 제외"
            )

    static = scan_target_sources(target)

    if include_runtime and selected_ids is not None and not runtime_states:
        runtime = RuntimeScanResult(
            runtime_available=False,
            runtime_error="선택한 화면 없음",
        )
    else:
        runtime = scan_portal_target_runtime(
            url,
            pw,
            target,
            skip_runtime=not include_runtime,
            ui_states=runtime_states,
            scenario_candidates=scenario_payload,
        )

    return _finalize_scan_result(
        _build_payload(
        target=target,
        target_name=cfg.get("name", target),
        mode="portal",
        base_url=url,
        page_url="",
        static=static,
        runtime=runtime,
        source_files=get_source_files(target),
        ui_states=coverage_states,
        extra_screen_reasons=extra_reasons,
        )
    )


def _run_source(
    target: str,
    *,
    state_ids: str | list | None = None,
) -> dict[str, Any]:
    if target not in PORTAL_TARGET_IDS:
        raise ValueError(f"unsupported portal target: {target}")

    cfg = get_target(target) or {}
    static = scan_target_sources(target)
    scenario = extract_scenarios(target)
    selected_ids = parse_state_ids(state_ids)

    candidates, _ = load_candidates(target)
    coverage_states = [c.to_ui_state() for c in candidates]
    extra: dict[str, str] = {}
    for c in candidates:
        if selected_ids is not None and c.state_id in selected_ids and c.selectable:
            continue
        extra[c.state_id] = (
            c.skip_reason or "실행 불가"
            if not c.selectable
            else "소스 모드 — 화면 미실행"
        )

    runtime = RuntimeScanResult(
        runtime_available=False,
        runtime_error="소스 모드 — 화면(Playwright) 진단은 포털 앱 탭에서 실행",
    )

    payload = _build_payload(
        target=target,
        target_name=cfg.get("name", target),
        mode="source",
        base_url="",
        page_url="",
        static=static,
        runtime=runtime,
        source_files=get_source_files(target),
        ui_states=coverage_states,
        extra_screen_reasons=extra,
    )
    payload["scenario"] = scenario
    return payload


def _run_ipms_online(
    *,
    page_url: str,
    include_runtime: bool,
    state_ids: str | list | None,
    ipms_access: str = "public",
    session_storage_bytes: bytes | None = None,
    session_job_id: str = "",
    display_mode: str = "ipms-public",
    progress_job_id: str | None = None,
) -> dict[str, Any]:
    url = (page_url or IPMS_DEFAULT_BASE).strip()
    if not url.endswith("/"):
        url += "/"
    tier = (ipms_access or "public").strip().lower()
    if tier not in ("public", "auth"):
        tier = "public"

    static = fetch_ipms_shell_static(url)
    all_candidates = build_ipms_candidates()
    tier_candidates = [c for c in all_candidates if c.access == tier]
    selected_ids = parse_state_ids(state_ids)

    by_id = {c.state_id: c for c in tier_candidates}
    if selected_ids is not None:
        unknown = [sid for sid in selected_ids if sid not in by_id]
        if unknown:
            raise ValueError(f"알 수 없는 state_id: {', '.join(unknown)}")
        chosen = [c for c in tier_candidates if c.state_id in selected_ids and c.selectable]
    else:
        chosen = [c for c in tier_candidates if c.recommended and c.selectable]

    coverage_states = [c.to_ui_state() for c in tier_candidates]
    extra: dict[str, str] = {}
    chosen_ids = {c.state_id for c in chosen}
    for c in tier_candidates:
        if c.state_id in chosen_ids:
            continue
        extra[c.state_id] = "사용자 제외" if c.selectable else (c.skip_reason or "실행 불가")

    storage_state = None
    if session_job_id.strip():
        storage_state = load_session_json(session_job_id.strip())
        if not storage_state:
            raise ValueError("세션 job_id가 없거나 만료되었습니다. 로그인 세션을 다시 생성하세요.")
    elif session_storage_bytes:
        storage_state = parse_storage_state(session_storage_bytes)

    if tier == "auth" and include_runtime and not storage_state:
        raise ValueError(
            "로그인 후 진단에는 「로그인 세션 생성」 또는 세션 JSON 업로드가 필요합니다."
        )

    def on_progress(idx: int, total: int, label: str) -> None:
        if progress_job_id:
            check_cancelled(progress_job_id)
        if not progress_job_id or total <= 0:
            return
        pct = 15 + int(80 * idx / total)
        update_job(
            progress_job_id,
            pct=pct,
            step_label=label,
            message=f"화면 진단 ({idx + 1}/{total}): {label}",
        )

    if include_runtime:
        if progress_job_id:
            update_job(progress_job_id, pct=8, message="홈 HTML 정적 분석…", step_label="정적")
        if not chosen:
            runtime = RuntimeScanResult(
                runtime_available=False,
                runtime_error="선택한 화면 없음",
            )
        else:
            runtime = scan_ipms_online_runtime(
                url,
                ui_states=[c.to_ui_state() for c in chosen],
                scenario_candidates=[c.to_dict() for c in chosen],
                access=tier,
                storage_state=storage_state,
                skip_runtime=False,
                on_progress=on_progress,
            )
    else:
        runtime = RuntimeScanResult(
            runtime_available=False,
            runtime_error="정적(shell fetch)만 실행 — 화면 진단은 Playwright 포함",
        )

    payload = _build_payload(
        target="ipms-online",
        target_name="전기사업정보시스템",
        mode=display_mode,
        base_url=url.rstrip("/"),
        page_url=url,
        static=static,
        runtime=runtime,
        source_files=sorted(static.scanned_files),
        ui_states=coverage_states,
        extra_screen_reasons=extra,
    )
    payload["ipms_access"] = tier
    payload["scenario"] = extract_ipms_scenarios(base_url=url, access=tier)
    return payload


def _run_java_upload(
    zip_bytes: bytes,
    *,
    page_url: str,
    include_runtime: bool,
    state_ids: str | list | None,
    login_url: str = "",
    login_username: str = "",
    login_password: str = "",
    login_user_selector: str = "",
    login_password_selector: str = "",
    login_submit_selector: str = "",
) -> dict[str, Any]:
    from source_scan.zip_ingest import cleanup_ingest, ingest_zip, validate_zip_bytes

    v = validate_zip_bytes(zip_bytes)
    if not v.get("can_run"):
        raise ValueError(v.get("message", "ZIP 검증 실패"))

    ing = ingest_zip(zip_bytes)
    try:
        candidates, warnings = extract_java_scenarios(ing.root, ing.java_files)
        static = scan_java_upload_sources(ing.root)
        selected_ids = parse_state_ids(state_ids)

        by_id = {c.state_id: c for c in candidates}
        if selected_ids is not None:
            unknown = [sid for sid in selected_ids if sid not in by_id]
            if unknown:
                raise ValueError(f"알 수 없는 state_id: {', '.join(unknown)}")
            chosen = [c for c in candidates if c.state_id in selected_ids and c.selectable]
        else:
            chosen = [c for c in candidates if c.recommended and c.selectable]

        coverage_states = [c.to_ui_state() for c in candidates]
        extra: dict[str, str] = {}
        chosen_ids = {c.state_id for c in chosen}
        for c in candidates:
            if c.state_id in chosen_ids:
                continue
            extra[c.state_id] = (
                c.skip_reason or "실행 불가"
                if not c.selectable
                else "사용자 제외"
            )

        login_cfg = None
        if login_url.strip() and login_username.strip() and login_password.strip():
            login_cfg = ExternalLoginConfig(
                login_url=login_url.strip(),
                username=login_username.strip(),
                password=login_password.strip(),
                user_selector=login_user_selector.strip(),
                password_selector=login_password_selector.strip(),
                submit_selector=login_submit_selector.strip(),
            )

        base_url = page_url.strip().rstrip("/")
        if include_runtime:
            if not base_url.startswith("http://") and not base_url.startswith("https://"):
                raise ValueError("화면 진단에는 배포 URL(http://...)이 필요합니다")
            if not chosen:
                runtime = RuntimeScanResult(
                    runtime_available=False,
                    runtime_error="선택한 화면 없음",
                )
            else:
                runtime = scan_java_upload_runtime(
                    base_url,
                    ui_states=[c.to_ui_state() for c in chosen],
                    scenario_candidates=[c.to_dict() for c in chosen],
                    login_cfg=login_cfg,
                    skip_runtime=False,
                )
        else:
            runtime = RuntimeScanResult(
                runtime_available=False,
                runtime_error="정적 진단만 실행 — 화면 테스트는 배포 URL과 함께 화면 진단 포함",
            )

        source_files = sorted(static.scanned_files)
        payload = _build_payload(
            target="java-upload",
            target_name="Java ZIP",
            mode="java-upload",
            base_url=base_url,
            page_url=base_url,
            static=static,
            runtime=runtime,
            source_files=source_files,
            ui_states=coverage_states,
            extra_screen_reasons=extra,
        )
        payload["scenario"] = {
            "candidates": [c.to_dict() for c in candidates],
            "defaults_selected": [c.state_id for c in candidates if c.recommended and c.selectable],
            "warnings": warnings,
        }
        return payload
    finally:
        cleanup_ingest(ing)


def extract_java_upload_scenarios(zip_bytes: bytes) -> dict[str, Any]:
    return extract_java_zip_scenarios(zip_bytes)


def discover_external_scenarios_from_params(
    *,
    page_url: str,
    need_login: bool = False,
    login_url: str = "",
    login_username: str = "",
    login_password: str = "",
    portal_password: str = "",
    login_user_selector: str = "",
    login_password_selector: str = "",
    login_submit_selector: str = "",
    session_storage_bytes: bytes | None = None,
    session_job_id: str = "",
    progress_job_id: str | None = None,
) -> dict[str, Any]:
    storage = None
    if session_job_id.strip():
        storage = load_session_json(session_job_id.strip())
        if not storage:
            raise ValueError("세션 job_id가 없거나 만료되었습니다. 로그인 세션을 다시 생성하세요.")
    elif session_storage_bytes:
        storage = parse_storage_state(session_storage_bytes)
    pw = (portal_password or "").strip() or __import__("os").environ.get("PORTAL_PASSWORD", "").strip()
    return discover_external_scenarios(
        page_url,
        need_login=need_login or bool(storage),
        login_url=login_url,
        login_username=login_username,
        login_password=login_password,
        portal_password=pw,
        login_user_selector=login_user_selector,
        login_password_selector=login_password_selector,
        login_submit_selector=login_submit_selector,
        storage_state=storage,
        progress_job_id=progress_job_id,
    )


def start_discover_external_job(
    *,
    page_url: str,
    need_login: bool = False,
    login_url: str = "",
    login_username: str = "",
    login_password: str = "",
    portal_password: str = "",
    login_user_selector: str = "",
    login_password_selector: str = "",
    login_submit_selector: str = "",
    session_storage_bytes: bytes | None = None,
    session_job_id: str = "",
) -> dict[str, Any]:
    job_id = create_job("external-discover", "화면 시나리오 탐색 준비…")

    def work() -> None:
        try:
            result = discover_external_scenarios_from_params(
                page_url=page_url,
                need_login=need_login,
                login_url=login_url,
                login_username=login_username,
                login_password=login_password,
                portal_password=portal_password,
                login_user_selector=login_user_selector,
                login_password_selector=login_password_selector,
                login_submit_selector=login_submit_selector,
                session_storage_bytes=session_storage_bytes,
                session_job_id=session_job_id,
                progress_job_id=job_id,
            )
            if not result.get("ok"):
                raise ValueError(result.get("detail") or "시나리오 탐색 실패")
            update_job(
                job_id,
                status="done",
                pct=100,
                message="탐색 완료",
                step_label="완료",
                result=result,
            )
        except Exception as e:
            update_job(job_id, status="error", error=str(e), message=str(e))

    submit_job(job_id, work)
    job = get_job(job_id)
    return {
        "ok": True,
        "async": True,
        "job_id": job_id,
        **(job_to_dict(job) if job else {"status": "queued", "pct": 0}),
    }


def _run_external(
    *,
    page_url: str,
    include_runtime: bool,
    state_ids: str | list | None = None,
    login_url: str = "",
    login_username: str = "",
    login_password: str = "",
    portal_password: str = "",
    login_user_selector: str = "",
    login_password_selector: str = "",
    login_submit_selector: str = "",
    session_storage_bytes: bytes | None = None,
    session_job_id: str = "",
    need_login: bool = False,
    progress_job_id: str | None = None,
) -> dict[str, Any]:
    url = page_url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError("page_url must start with http:// or https://")

    if progress_job_id:
        update_job(progress_job_id, pct=3, message="화면 시나리오 준비…", step_label="탐색")

    discovered = discover_external_scenarios_from_params(
        page_url=url,
        need_login=need_login,
        login_url=login_url,
        login_username=login_username,
        login_password=login_password,
        portal_password=portal_password,
        login_user_selector=login_user_selector,
        login_password_selector=login_password_selector,
        login_submit_selector=login_submit_selector,
        session_storage_bytes=session_storage_bytes,
        session_job_id=session_job_id,
    )
    if not discovered.get("ok"):
        raise ValueError(discovered.get("detail") or "시나리오 탐색 실패")

    all_candidates = discovered.get("candidates") or []
    selected_ids = parse_state_ids(state_ids)
    by_id = {c["state_id"]: c for c in all_candidates if isinstance(c, dict)}

    if selected_ids is not None:
        unknown = [sid for sid in selected_ids if sid not in by_id]
        if unknown:
            raise ValueError(f"알 수 없는 state_id: {', '.join(unknown)}")
        chosen = [
            c
            for c in all_candidates
            if c.get("state_id") in selected_ids and c.get("selectable")
        ]
    else:
        chosen = [
            c
            for c in all_candidates
            if c.get("recommended") and c.get("selectable")
        ]

    coverage_states = [
        {
            "state_id": c["state_id"],
            "label": c.get("label", c["state_id"]),
            "description": c.get("description", ""),
            "required": c.get("recommended", False),
        }
        for c in all_candidates
    ]
    extra: dict[str, str] = {}
    chosen_ids = {c["state_id"] for c in chosen}
    for c in all_candidates:
        sid = c["state_id"]
        if sid in chosen_ids:
            continue
        extra[sid] = (
            c.get("skip_reason") or "실행 불가"
            if not c.get("selectable")
            else "사용자 제외"
        )

    runtime_states = [
        {
            "state_id": c["state_id"],
            "label": c.get("label", c["state_id"]),
            "description": c.get("description", ""),
        }
        for c in chosen
    ]

    storage = None
    if session_job_id.strip():
        storage = load_session_json(session_job_id.strip())
        if not storage:
            raise ValueError("세션 job_id가 없거나 만료되었습니다. 로그인 세션을 다시 생성하세요.")
    elif session_storage_bytes:
        storage = parse_storage_state(session_storage_bytes)
    pw = (portal_password or "").strip() or __import__("os").environ.get("PORTAL_PASSWORD", "").strip()

    login_cfg = ExternalLoginConfig(
        login_url=login_url.strip(),
        username=login_username.strip(),
        password=login_password.strip(),
        portal_password=pw,
        user_selector=login_user_selector.strip(),
        password_selector=login_password_selector.strip(),
        submit_selector=login_submit_selector.strip(),
        need_login=need_login or bool(storage),
    )

    def on_progress(idx: int, total: int, label: str) -> None:
        if progress_job_id:
            check_cancelled(progress_job_id)
        if not progress_job_id or total <= 0:
            return
        pct = 15 + int(80 * idx / total)
        update_job(
            progress_job_id,
            pct=pct,
            step_label=label,
            message=f"화면 진단 ({idx + 1}/{total}): {label}",
        )

    runtime = scan_external_url_runtime(
        url,
        login_cfg,
        ui_states=runtime_states or coverage_states[:1],
        scenario_candidates=chosen or all_candidates[:1],
        storage_state=storage,
        skip_runtime=not include_runtime,
        on_progress=on_progress,
    )

    return _build_payload(
        target="external",
        target_name="외부 URL",
        mode="external",
        base_url="",
        page_url=url,
        static=None,
        runtime=runtime,
        source_files=[],
        ui_states=coverage_states,
        extra_screen_reasons=extra,
    )


def start_external_run_job(
    *,
    page_url: str,
    include_runtime: bool,
    state_ids: str | list | None,
    login_url: str,
    login_username: str,
    login_password: str,
    portal_password: str,
    login_user_selector: str,
    login_password_selector: str,
    login_submit_selector: str,
    session_storage_bytes: bytes | None,
    session_job_id: str = "",
    need_login: bool,
) -> dict[str, Any]:
    job_id = create_job("external-scan", "진단 준비 중…")

    def work() -> None:
        try:
            result = _finalize_scan_result(
                _run_external(
                page_url=page_url,
                include_runtime=include_runtime,
                state_ids=state_ids,
                login_url=login_url,
                login_username=login_username,
                login_password=login_password,
                portal_password=portal_password,
                login_user_selector=login_user_selector,
                login_password_selector=login_password_selector,
                login_submit_selector=login_submit_selector,
                session_storage_bytes=session_storage_bytes,
                session_job_id=session_job_id,
                need_login=need_login,
                progress_job_id=job_id,
                ),
                job_id=job_id,
            )
            update_job(
                job_id,
                status="done",
                pct=100,
                message="진단 완료",
                step_label="완료",
                result=result,
            )
        except ScanCancelled:
            update_job(job_id, status="cancelled", message="취소됨", error="cancelled")
        except Exception as e:
            update_job(job_id, status="error", error=str(e), message=str(e))

    submit_job(job_id, work)
    job = get_job(job_id)
    return {
        "ok": True,
        "async": True,
        "job_id": job_id,
        **(job_to_dict(job) if job else {"status": "queued", "pct": 0}),
    }


def _build_payload(
    *,
    target: str,
    target_name: str,
    mode: str,
    base_url: str,
    page_url: str,
    static,
    runtime,
    source_files: list[str],
    ui_states: list[dict],
    extra_screen_reasons: dict[str, str] | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    if static:
        findings.extend(f.to_dict() for f in static.findings)
    findings.extend(runtime.findings)
    findings = [enrich_finding(f) for f in findings]

    source_coverage = []
    scanned_files = static.scanned_files if static else set()
    for rel in source_files:
        source_coverage.append(
            {
                "path": rel,
                "scanned": rel in scanned_files,
                "reason": "" if rel in scanned_files else "파일 없음 또는 읽기 실패",
            }
        )

    screen_coverage = []
    cov_map = {c.state_id: c for c in runtime.screen_coverage}
    for state in ui_states:
        c = cov_map.get(state["state_id"])
        if c:
            screen_coverage.append(
                {
                    "state_id": c.state_id,
                    "label": c.label,
                    "description": c.description,
                    "scanned": c.scanned,
                    "reason": c.reason,
                    "screenshot_id": next(
                        (
                            cap.capture_id
                            for cap in runtime.captures
                            if cap.kind == "state" and cap.state_id == c.state_id
                        ),
                        None,
                    ),
                }
            )
        else:
            sid = state["state_id"]
            reason = ""
            if extra_screen_reasons and sid in extra_screen_reasons:
                reason = extra_screen_reasons[sid]
            else:
                reason = runtime.runtime_error or "런타임 미실행"
            screen_coverage.append(
                {
                    "state_id": sid,
                    "label": state.get("label", sid),
                    "description": state.get("description", ""),
                    "scanned": False,
                    "reason": reason,
                    "screenshot_id": None,
                }
            )

    screenshots = [c.to_dict(include_data=True) for c in runtime.captures]
    capture_by_id = {s["id"]: s for s in screenshots}
    for f in findings:
        sid = f.get("screenshot_id")
        if sid and sid in capture_by_id:
            f["screenshot_url"] = capture_by_id[sid].get("data_url")
            f["screenshot_filename"] = capture_by_id[sid].get("filename")

    if mode in ("portal", "ipms-online", "ipms-public", "ipms-auth"):
        for rule in load_egov_rules():
            if rule.get("automatable") != "manual":
                continue
            if any(f.get("rule_id") == rule["id"] for f in findings):
                continue
            findings.append(
                {
                    "id": __import__("uuid").uuid4().hex[:12],
                    "target": "source",
                    "location": target,
                    "rule_id": rule["id"],
                    "category": rule["category"],
                    "status": "manual",
                    "severity": "info",
                    "message": f"{rule['title']} — 수동 확인 필요: {rule.get('description', '')}",
                    "fix": "체크리스트에 따라 수동 점검 후 기록하세요.",
                }
            )

    stats = _compute_stats(findings)

    return {
        "ok": True,
        "mode": mode,
        "target": target,
        "target_name": target_name,
        "base_url": base_url,
        "page_url": page_url,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "runtime_available": runtime.runtime_available,
        "runtime_error": runtime.runtime_error,
        "findings": findings,
        "stats": stats,
        "screenshots": screenshots,
        "coverage": {
            "sources": source_coverage,
            "screens": screen_coverage,
        },
        "rules": {
            "kwcag": load_kwcag_rules(),
            "egov": load_egov_rules(),
        },
        "targets": [t for t in TARGETS if t.get("mode") == "portal"],
    }


def _compute_stats(findings: list[dict[str, Any]]) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "total": len(findings),
        "pass": 0,
        "fail": 0,
        "review": 0,
        "manual": 0,
        "not_scanned": 0,
        "na": 0,
    }
    for f in findings:
        st = f.get("status", "fail")
        if st in stats and isinstance(stats[st], int):
            stats[st] += 1
        else:
            stats["fail"] += 1
    by_cat: dict[str, dict[str, int]] = {}
    for f in findings:
        cat = f.get("category", "a11y")
        by_cat.setdefault(cat, {"fail": 0, "pass": 0, "not_scanned": 0})
        st = f.get("status", "fail")
        if st in by_cat[cat]:
            by_cat[cat][st] += 1
        elif st == "fail":
            by_cat[cat]["fail"] += 1
    stats["by_category"] = by_cat
    return stats


def start_ipms_run_job(
    *,
    page_url: str,
    include_runtime: bool,
    state_ids: str | list | None,
    ipms_access: str,
    session_storage_bytes: bytes | None,
    session_job_id: str,
    display_mode: str,
) -> dict[str, Any]:
    job_id = create_job("ipms-scan", "진단 준비 중…")

    def work() -> None:
        try:
            result = _finalize_scan_result(
                _run_ipms_online(
                page_url=page_url,
                include_runtime=include_runtime,
                state_ids=state_ids,
                ipms_access=ipms_access,
                session_storage_bytes=session_storage_bytes,
                session_job_id=session_job_id,
                display_mode=display_mode,
                progress_job_id=job_id,
                ),
                job_id=job_id,
            )
            update_job(
                job_id,
                status="done",
                pct=100,
                message="진단 완료",
                step_label="완료",
                result=result,
            )
        except ScanCancelled:
            update_job(job_id, status="cancelled", message="취소됨", error="cancelled")
        except Exception as e:
            update_job(job_id, status="error", error=str(e), message=str(e))

    submit_job(job_id, work)
    job = get_job(job_id)
    return {
        "ok": True,
        "async": True,
        "job_id": job_id,
        **(job_to_dict(job) if job else {"status": "queued", "pct": 0}),
    }


def get_web_quality_job(job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        return {"ok": False, "message": "job not found"}
    out = job_to_dict(job)
    out["ok"] = True
    return out


def start_ipms_session(page_url: str = "") -> dict[str, Any]:
    return start_browser_session(page_url, detect="ipms")


def start_browser_session(page_url: str = "", *, detect: SessionDetect = "generic") -> dict[str, Any]:
    jid = start_browser_session_job(page_url, detect=detect)
    job = get_job(jid)
    return {
        "ok": True,
        "job_id": jid,
        **(job_to_dict(job) if job else {"status": "queued", "pct": 0}),
    }


def get_fix_guides_catalog() -> dict[str, Any]:
    from web_quality.fix_guides import get_axe_fix_guides

    guides = get_axe_fix_guides()
    return {"ok": True, "guides": guides}


def export_web_quality_payload(payload: dict[str, Any], fmt: str) -> tuple[bytes, str, str]:
    """Returns (data, filename, media_type)."""
    from web_quality.report import build_html_report, build_xlsx_bytes, build_zip_bytes

    fmt = (fmt or "xlsx").lower().strip()
    if fmt not in ("xlsx", "html", "zip"):
        raise ValueError("format must be xlsx|html|zip")

    slug = payload.get("target") or "scan"
    date = str(payload.get("scanned_at", ""))[:10] or "report"

    if fmt == "xlsx":
        return (
            build_xlsx_bytes(payload, embed_images=True),
            f"web_quality_{slug}_{date}.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    if fmt == "zip":
        return (
            build_zip_bytes(payload),
            f"web_quality_{slug}_{date}.zip",
            "application/zip",
        )
    html_text = build_html_report(payload, image_mode="embed")
    return (
        html_text.encode("utf-8"),
        f"web_quality_{slug}_{date}.html",
        "text/html; charset=utf-8",
    )


def get_web_quality_history(limit: int = 30) -> list[dict[str, Any]]:
    return list_history(limit=limit)


def get_web_quality_history_record(job_id: str) -> dict[str, Any] | None:
    return load_history(job_id)


def get_web_quality_diff(job_id: str, compare_job_id: str | None = None) -> dict[str, Any]:
    current = load_history(job_id)
    if not current:
        return {"ok": False, "message": "job not found"}
    current_payload = current.get("payload") or {}
    current_findings = current_payload.get("findings") or []

    if compare_job_id:
        prev_rec = load_history(compare_job_id)
    else:
        prev_rec = find_previous_scan(current_payload, exclude_job_id=job_id)

    if not prev_rec or not prev_rec.get("payload"):
        return {"ok": True, "message": "비교할 이전 진단 없음", "diff": None}

    prev_findings = (prev_rec.get("payload") or {}).get("findings") or []
    return {
        "ok": True,
        "compare_job_id": prev_rec.get("job_id"),
        "diff": compute_diff(current_findings, prev_findings),
    }


def cancel_web_quality_job(job_id: str) -> bool:
    from web_quality.job_progress import request_cancel

    return request_cancel(job_id)


def export_web_quality_job(job_id: str, fmt: str) -> tuple[bytes, str, str]:
    rec = load_history(job_id)
    if not rec or not rec.get("payload"):
        raise ValueError("job not found")
    return export_web_quality_payload(rec["payload"], fmt)
