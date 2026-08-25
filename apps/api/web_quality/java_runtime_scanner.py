from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

from web_quality.external_scanner import ExternalLoginConfig
from web_quality.runtime_common import (
    RuntimeScanResult,
    ScreenCoverage,
    _attach_console_findings,
    scan_page_states,
)
from web_quality.runtime_env import _friendly_playwright_error, _launch_chromium
from web_quality.scenario_steps import open_state_by_steps


def scan_java_upload_runtime(
    base_url: str,
    *,
    ui_states: list[dict[str, Any]],
    scenario_candidates: list[dict[str, Any]],
    login_cfg: ExternalLoginConfig | None = None,
    skip_runtime: bool = False,
) -> RuntimeScanResult:
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
        )

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

            if login_cfg:
                from web_quality.runtime_common import external_login

                external_login(
                    page,
                    login_cfg.login_url,
                    login_cfg.username,
                    login_cfg.password,
                    login_cfg.user_selector,
                    login_cfg.password_selector,
                    login_cfg.submit_selector,
                )

            by_id = {c["state_id"]: c for c in scenario_candidates}
            open_fn = lambda pg, sid: open_state_by_steps(pg, by_id[sid], base_url=base_url)

            result = scan_page_states(
                page,
                ui_states,
                open_state_fn=open_fn,
                filename_prefix="screenshots/java-upload",
                url_hint=base_url,
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
                    err,
                    s.get("description", ""),
                )
                for s in ui_states
            ],
            console_errors=console_errors,
        )
