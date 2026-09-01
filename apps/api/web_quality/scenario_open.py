"""포털·시나리오 후보별 Playwright 화면 열기 (웹품질 · perf-test 공용)."""
from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

from web_quality.manifest import get_target
from web_quality.scenario_steps import open_state_by_steps

ER_MODELER_READY = '[data-wq-target="import_dialog"]'


def _candidate_steps(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    open_block = candidate.get("open") or {}
    steps = open_block.get("steps") or candidate.get("steps") or []
    return [s for s in steps if isinstance(s, dict)]


def candidate_has_rich_steps(candidate: dict[str, Any]) -> bool:
    """manifest placeholder(wait 1개)가 아닌 실제 navigation 스텝."""
    steps = _candidate_steps(candidate)
    if not steps:
        return False
    if len(steps) == 1 and (steps[0].get("action") or "").strip() == "wait":
        return False
    return True


def _wait_er_modeler_app(page) -> None:
    page.wait_for_selector(".er-modeler", timeout=60000)
    page.wait_for_selector(ER_MODELER_READY, timeout=60000, state="visible")


def ensure_portal_page_ready(
    page,
    base_url: str,
    *,
    ready_selector: str = "main",
    had_storage: bool = False,
    app_url: str = "",
    wait_timeout_ms: int = 30000,
) -> tuple[bool, str]:
    """포털 /login 리다이렉트 시 storage_state 또는 PORTAL_PASSWORD로 복구."""
    from web_quality.runtime_env import ensure_portal_password_env

    ensure_portal_password_env()
    target = (app_url or base_url or "").strip()
    ready_timeout = max(5000, int(wait_timeout_ms))

    def _wait_ready() -> None:
        page.wait_for_selector(ready_selector, timeout=ready_timeout)

    def _goto_target() -> None:
        if not target:
            return
        page.goto(target, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(400)

    path = urlparse(page.url).path or ""
    if "/login" not in path:
        try:
            _wait_ready()
            return True, ""
        except Exception as e:
            return False, f"앱 준비 대기 실패 ({ready_selector}): {e}"

    if had_storage:
        try:
            _goto_target()
        except Exception:
            pass
        if "/login" not in (urlparse(page.url).path or ""):
            try:
                _wait_ready()
                return True, ""
            except Exception as e:
                return False, f"세션 복구 후 앱 대기 실패 ({ready_selector}): {e}"

    host = (urlparse(base_url).hostname or "").lower()
    pw = os.environ.get("PORTAL_PASSWORD", "").strip()
    if pw and host in ("localhost", "127.0.0.1", "::1"):
        from web_quality.runtime_common import portal_login

        try:
            portal_login(page, base_url, pw)
            _goto_target()
            _wait_ready()
            return True, ""
        except Exception as e:
            if had_storage:
                return False, (
                    f"저장된 세션·PORTAL_PASSWORD 모두 실패: {e}. "
                    "Chromium에서 /login 로그인 후 세션을 다시 생성하세요."
                )
            return False, f"PORTAL_PASSWORD 자동 로그인 실패: {e}"

    if had_storage:
        return False, (
            "브라우저 세션 쿠키로 포털 인증되지 않았습니다. "
            "Chromium 창에서 /login 포털 암호 로그인을 완료한 뒤 「로그인 세션 자동 생성」을 다시 실행하세요. "
            "Base URL 호스트(localhost vs 127.0.0.1)도 세션 생성 때와 동일해야 합니다."
        )

    return False, "포털 로그인 필요 — 「로그인 세션」을 준비하세요."


def open_er_modeler_state(page, state_id: str) -> tuple[bool, str]:
    try:
        if state_id == "main_canvas":
            _wait_er_modeler_app(page)
            return True, ""

        if state_id == "import_dialog":
            _wait_er_modeler_app(page)
            page.click(ER_MODELER_READY, timeout=30000)
            page.wait_for_selector('[data-wq-state="import_dialog"]', timeout=30000)
            return True, ""

        if state_id == "export_dialog":
            _wait_er_modeler_app(page)
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            page.click('[data-wq-target="export_dialog"]', timeout=30000)
            page.wait_for_selector('[data-wq-state="export_dialog"]', timeout=30000)
            return True, ""

        if state_id == "validation_dialog":
            _wait_er_modeler_app(page)
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            if not page.locator(".react-flow__node").count():
                page.click('[data-wq-target="add_table"]', timeout=5000)
                page.wait_for_timeout(200)
                page.locator(".react-flow__pane").click(position={"x": 400, "y": 300})
                page.wait_for_timeout(500)
            page.click('[data-wq-target="validation_dialog"]', timeout=10000)
            page.wait_for_selector('[data-wq-state="validation_dialog"]', timeout=10000)
            return True, ""

        if state_id == "table_edit":
            _wait_er_modeler_app(page)
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            if not page.locator(".react-flow__node").count():
                page.click('[data-wq-target="add_table"]', timeout=5000)
                page.wait_for_timeout(200)
                page.locator(".react-flow__pane").click(position={"x": 400, "y": 300})
                page.wait_for_timeout(800)
            header = page.locator(".er-table-node-header").first
            if not header.count():
                return False, "캔버스에 테이블이 없어 table_edit 상태를 열 수 없습니다."
            header.dblclick(timeout=5000)
            page.wait_for_selector('[data-wq-state="table_edit"]', timeout=10000)
            return True, ""

        if state_id == "column_edit":
            _wait_er_modeler_app(page)
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            if not page.locator(".react-flow__node").count():
                return False, "테이블 없음 — column_edit 미실행"
            page.locator(".er-table-node-row").first.dblclick(timeout=5000)
            page.wait_for_selector('[data-wq-state="column_edit"]', timeout=10000)
            return True, ""

        if state_id == "relation_edit":
            return False, "관계선이 없어 relation_edit 미실행 (수동 확인 필요)"

        if state_id == "import_preview":
            return False, "가져오기 미리보기는 파일 업로드 필요 — 미실행"

        return False, f"알 수 없는 state_id: {state_id}"
    except Exception as e:
        return False, str(e)


def open_generic_portal_state(page, state_id: str, ready_selector: str) -> tuple[bool, str]:
    if state_id != "main_page":
        return False, "이 앱은 메인 화면만 진단합니다."
    try:
        page.wait_for_selector(ready_selector, timeout=30000)
        return True, ""
    except Exception as e:
        return False, str(e)


def open_candidate(
    page,
    candidate: dict[str, Any],
    *,
    target_id: str = "",
    base_url: str = "",
) -> tuple[bool, str]:
    """후보 dict → 화면까지 Playwright navigation (스텝 JSON 또는 앱별 opener)."""
    if candidate_has_rich_steps(candidate):
        return open_state_by_steps(page, candidate, base_url=base_url)

    state_id = str(candidate.get("state_id") or "")
    tid = (target_id or "").strip()
    if tid == "er-modeler":
        return open_er_modeler_state(page, state_id)

    cfg = get_target(tid) if tid else None
    open_block = candidate.get("open") or {}
    ready = (
        (cfg or {}).get("ready_selector")
        or open_block.get("ready_selector")
        or "main"
    )
    return open_generic_portal_state(page, state_id, ready)


def make_portal_open_fn(
    target_id: str,
    scenario_candidates: list[dict[str, Any]] | None = None,
    ready_selector: str = "main",
):
    """web-quality scan_page_states용 open_fn 팩토리."""
    if scenario_candidates:
        by_id = {c["state_id"]: c for c in scenario_candidates}

        def _open(pg, sid: str) -> tuple[bool, str]:
            c = by_id.get(sid)
            if not c:
                return False, f"후보 없음: {sid}"
            return open_candidate(pg, c, target_id=target_id)

        return _open

    if target_id == "er-modeler":
        return open_er_modeler_state

    return lambda pg, sid: open_generic_portal_state(pg, sid, ready_selector)
