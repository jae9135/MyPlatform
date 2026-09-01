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
from web_quality.scenario_open import make_portal_open_fn
from web_quality.runtime_env import _friendly_playwright_error, _launch_chromium


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

            open_fn = make_portal_open_fn(
                target_id,
                scenario_candidates=scenario_candidates,
                ready_selector=ready,
            )

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
