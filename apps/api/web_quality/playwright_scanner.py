from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

from web_quality.manifest import get_target, get_ui_states
from web_quality.runtime_common import (
    RuntimeScanResult,
    ScreenCoverage,
    _attach_console_findings,
    _fid,
    portal_login,
    scan_page_states,
)
from web_quality.scenario_steps import open_state_by_steps
from web_quality.runtime_env import _friendly_playwright_error, _launch_chromium


def _open_er_modeler_state(page, state_id: str) -> tuple[bool, str]:
    try:
        if state_id == "main_canvas":
            page.wait_for_selector(".er-modeler", timeout=30000)
            return True, ""

        if state_id == "import_dialog":
            page.click('[data-wq-target="import_dialog"]', timeout=10000)
            page.wait_for_selector('[data-wq-state="import_dialog"]', timeout=10000)
            return True, ""

        if state_id == "export_dialog":
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            page.click('[data-wq-target="export_dialog"]', timeout=10000)
            page.wait_for_selector('[data-wq-state="export_dialog"]', timeout=10000)
            return True, ""

        if state_id == "validation_dialog":
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


def _open_generic_state(page, state_id: str, ready_selector: str) -> tuple[bool, str]:
    if state_id != "main_page":
        return False, "이 앱은 메인 화면만 진단합니다."
    try:
        page.wait_for_selector(ready_selector, timeout=30000)
        return True, ""
    except Exception as e:
        return False, str(e)


def scan_portal_target_runtime(
    base_url: str,
    password: str,
    target_id: str,
    *,
    skip_runtime: bool = False,
    ui_states: list[dict[str, Any]] | None = None,
    scenario_candidates: list[dict[str, Any]] | None = None,
) -> RuntimeScanResult:
    cfg = get_target(target_id)
    if not cfg or cfg.get("mode") != "portal":
        return RuntimeScanResult(
            runtime_available=False,
            runtime_error=f"unknown portal target: {target_id}",
        )

    if ui_states is None:
        ui_states = get_ui_states(target_id)
    if skip_runtime:
        return RuntimeScanResult(
            runtime_available=False,
            runtime_error="runtime scan skipped",
            screen_coverage=[
                ScreenCoverage(
                    s["state_id"],
                    s.get("label", s["state_id"]),
                    False,
                    "런타임 스캔 생략",
                    s.get("description", ""),
                )
                for s in ui_states
            ],
        )

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return RuntimeScanResult(
            runtime_available=False,
            runtime_error="playwright 미설치 — pip install playwright && python -m playwright install chromium",
            screen_coverage=[
                ScreenCoverage(
                    s["state_id"],
                    s.get("label", s["state_id"]),
                    False,
                    "playwright 없음",
                    s.get("description", ""),
                )
                for s in ui_states
            ],
        )

    app_url = urljoin(base_url.rstrip("/") + "/", cfg["path"].lstrip("/"))
    ready = cfg.get("ready_selector", "main")
    console_errors: list[str] = []

    try:
        with sync_playwright() as p:
            browser = _launch_chromium(p)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()

            def on_console(msg):
                if msg.type == "error":
                    text = msg.text
                    if "favicon" not in text.lower():
                        console_errors.append(text)

            page.on("console", on_console)

            if password:
                portal_login(page, base_url, password)
            page.goto(app_url, wait_until="domcontentloaded", timeout=60000)

            if scenario_candidates:
                by_id = {c["state_id"]: c for c in scenario_candidates}
                open_fn = lambda pg, sid: open_state_by_steps(pg, by_id[sid])
            elif target_id == "er-modeler":
                open_fn = _open_er_modeler_state
            else:
                open_fn = lambda pg, sid: _open_generic_state(pg, sid, ready)

            result = scan_page_states(
                page,
                ui_states,
                open_state_fn=open_fn,
                filename_prefix=f"screenshots/{target_id}",
                url_hint=cfg.get("name", target_id),
            )
            _attach_console_findings(console_errors, result.findings)
            result.console_errors = console_errors
            browser.close()
            return result
    except Exception as e:
        err = _friendly_playwright_error(str(e))
        return RuntimeScanResult(
            runtime_available=False,
            runtime_error=err,
            screen_coverage=[
                ScreenCoverage(
                    s["state_id"],
                    s.get("label", s["state_id"]),
                    False,
                    str(e),
                    s.get("description", ""),
                )
                for s in ui_states
            ],
            console_errors=console_errors,
        )


# Backward compatibility alias
def scan_er_modeler_runtime(
    base_url: str,
    password: str,
    *,
    skip_runtime: bool = False,
) -> RuntimeScanResult:
    return scan_portal_target_runtime(
        base_url, password, "er-modeler", skip_runtime=skip_runtime
    )
