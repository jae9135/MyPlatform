from __future__ import annotations

import time
from typing import Any

from perf_test.options import PerfTestOptions
from perf_test.runner import _playwright_ready, _safe_page_goto
from perf_test.scenario_urls import (
    _manifest_path_for_target,
    candidate_display_name,
    fetch_scenarios,
    resolve_har_start_url,
    select_candidates,
    split_candidates_by_session,
)
from perf_test.session import resolve_storage_state, new_playwright_context, validate_portal_storage_state
from web_quality.manifest import get_target
from web_quality.scenario_open import ensure_portal_page_ready, open_candidate


def preview_scenarios(
    opts: PerfTestOptions,
    *,
    session_storage_bytes: bytes | None = None,
) -> dict[str, Any]:
    """선택 시나리오를 Playwright로 열어 성공/실패를 반환 (Locust 실행 전 dry-run)."""
    errors: list[str] = []
    warnings: list[str] = []

    if not opts.target:
        errors.append("target이 필요합니다.")
        return {"ok": False, "errors": errors, "warnings": warnings, "items": []}

    try:
        storage = resolve_storage_state(
            session_job_id=opts.session_job_id,
            session_storage_bytes=session_storage_bytes,
            base_url=opts.base_url,
        )
    except ValueError as e:
        errors.append(str(e))
        return {"ok": False, "errors": errors, "warnings": warnings, "items": []}

    try:
        _playwright_ready()
    except RuntimeError as e:
        errors.append(str(e))
        return {"ok": False, "errors": errors, "warnings": warnings, "items": []}

    try:
        payload = fetch_scenarios(opts.target, base_url=opts.base_url, access=opts.access)
    except Exception as e:
        errors.append(str(e))
        return {"ok": False, "errors": errors, "warnings": warnings, "items": []}

    base_url = (opts.base_url or "").strip().rstrip("/")
    if not base_url:
        base_url = str(payload.get("base_url") or payload.get("page_url") or "").rstrip("/")
    if not base_url:
        errors.append("base_url을 입력하거나 target에서 URL을 추출할 수 없습니다.")
        return {"ok": False, "errors": errors, "warnings": warnings, "items": []}

    if storage and _manifest_path_for_target(str(opts.target or "")):
        valid, msg = validate_portal_storage_state(storage, base_url)
        if not valid:
            errors.append(msg)
            return {"ok": False, "errors": errors, "warnings": warnings, "items": [], "session_valid": False}

    selected_all = select_candidates(payload, opts.state_ids)
    if not selected_all:
        raw_cands = payload.get("candidates") or []
        selected_all = [c for c in raw_cands if isinstance(c, dict)][:1]
    runnable, skipped = split_candidates_by_session(selected_all, has_session=bool(storage))
    if skipped:
        labels = ", ".join(str(s.get("label") or s.get("state_id") or "") for s in skipped[:5])
        extra = f" 외 {len(skipped) - 5}개" if len(skipped) > 5 else ""
        warnings.append(f"로그인 세션 없음 — 미리보기 제외 {len(skipped)}개: {labels}{extra}")
    if not runnable:
        if skipped:
            errors.append(
                "선택한 시나리오가 모두 로그인 필요인데 세션이 없습니다. "
                "「로그인 필요」를 체크하고 세션을 준비하세요."
            )
        else:
            errors.append("미리볼 시나리오가 없습니다.")
        return {"ok": False, "errors": errors, "warnings": warnings, "items": [], "skipped": skipped}

    target_id = str(payload.get("target") or opts.target)
    manifest_path = _manifest_path_for_target(target_id)
    items: list[dict[str, Any]] = []

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = new_playwright_context(browser, storage_state=storage, base_url=base_url)
        page = context.new_page()

        for candidate in runnable:
            sid = str(candidate.get("state_id") or "")
            label = candidate_display_name(candidate)
            t0 = time.monotonic()
            open_ok = False
            open_err = ""
            try:
                start_url = resolve_har_start_url(candidate, base_url, manifest_path=manifest_path)
                _safe_page_goto(page, start_url)
                page.wait_for_timeout(400)
                portal_cfg = get_target(target_id) if manifest_path else None
                if portal_cfg and portal_cfg.get("mode") == "portal":
                    ready = str(portal_cfg.get("ready_selector") or "main")
                    open_ok, open_err = ensure_portal_page_ready(
                        page,
                        base_url,
                        ready_selector=ready,
                        had_storage=bool(storage),
                        app_url=start_url,
                    )
                    if not open_ok:
                        elapsed_ms = int((time.monotonic() - t0) * 1000)
                        items.append(
                            {
                                "state_id": sid,
                                "label": label,
                                "open_ok": False,
                                "open_error": open_err or "",
                                "duration_ms": elapsed_ms,
                            }
                        )
                        continue
                open_ok, open_err = open_candidate(
                    page, candidate, target_id=target_id, base_url=base_url
                )
            except Exception as e:
                open_err = str(e)
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            items.append(
                {
                    "state_id": sid,
                    "label": label,
                    "open_ok": open_ok,
                    "open_error": open_err or "",
                    "duration_ms": elapsed_ms,
                }
            )

        browser.close()

    ok_count = sum(1 for i in items if i.get("open_ok"))
    return {
        "ok": True,
        "errors": errors,
        "warnings": warnings,
        "base_url": base_url,
        "target": target_id,
        "target_name": payload.get("target_name"),
        "session_used": bool(storage),
        "skipped": skipped,
        "summary": {"total": len(items), "ok": ok_count, "fail": len(items) - ok_count},
        "items": items,
    }
