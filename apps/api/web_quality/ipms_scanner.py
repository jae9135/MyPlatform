"""전기사업정보시스템(ipms.online) Playwright 런타임 진단."""
from __future__ import annotations

import json
from typing import Any
from urllib.request import Request, urlopen

from web_quality.java_static_scanner import _scan_html_like
from web_quality.presets.ipms_online import IPMS_DEFAULT_BASE, build_ipms_candidates
from web_quality.runtime_common import (
    RuntimeScanResult,
    ScreenCoverage,
    _attach_console_findings,
    scan_page_states,
)
from web_quality.runtime_env import _friendly_playwright_error, _launch_chromium
from web_quality.scenario_steps import open_state_by_steps
from web_quality.static_scanner import Finding, StaticScanResult, _add, _fid


def fetch_ipms_shell_static(base_url: str) -> StaticScanResult:
    url = (base_url or IPMS_DEFAULT_BASE).strip()
    if not url.endswith("/"):
        url += "/"
    findings: list[Finding] = []
    try:
        req = Request(url, headers={"User-Agent": "MyPlatform-WQ/1.0"})
        with urlopen(req, timeout=25) as resp:
            content = resp.read().decode("utf-8", "replace")
        _scan_html_like("index.html", content, findings)
        if 'lang="ko"' not in content and "lang='ko'" not in content:
            _add(
                findings,
                location="index.html:html",
                rule_id="7.1.1",
                category="a11y",
                severity="warning",
                message='html lang="ko" 미설정 (현재 lang="en")',
                fix='html lang="ko" 로 변경 권장',
            )
        if "#krds-skip-link" in content:
            _add(
                findings,
                location="index.html:skip",
                rule_id="6.4.1",
                category="a11y",
                severity="info",
                message="본문 바로가기(skip link) 존재",
                status="pass",
            )
        return StaticScanResult(findings=findings, scanned_files={"index.html"})
    except Exception as e:
        _add(
            findings,
            location=url,
            rule_id="WS-1.1",
            category="standard",
            severity="error",
            message=f"홈 HTML fetch 실패: {e}",
            status="not_scanned",
        )
        return StaticScanResult(findings=findings, scanned_files=set())


def _goto_home(page, base_url: str) -> None:
    page.goto(base_url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_selector("#gnb .gnb-main-trigger", timeout=45000)


def ipms_establish_session(
    page,
    base_url: str,
    *,
    username: str = "",
    password: str = "",
) -> tuple[bool, str]:
    """ID/PW 로그인 시도. 공동인증서 2단계 시 세션 미완료."""
    user = (username or "").strip()
    pw = (password or "").strip()
    if not user or not pw:
        return False, "로그인 ID·암호 필요"

    _goto_home(page, base_url)
    page.locator("button.btn-login").click(timeout=10000)
    page.wait_for_selector("#userId", timeout=30000)
    page.fill("#userId", user)
    page.fill("#pswd", pw)
    page.click("#userLoginButton")

    # 성공: 로그아웃 버튼 / 사용자명
    try:
        page.wait_for_selector("#logout, #login-user, .btn-logout", timeout=12000)
        page.wait_for_timeout(800)
        if page.locator("#logout, .btn-logout").count():
            return True, ""
    except Exception:
        pass

    # 2FA(공동인증서) 대화상자
    if page.locator(".ui-dialog, .pop-box.open-confirm").count():
        return False, (
            "ID/PW 확인 후 공동인증서(2단계) 선택 화면 — "
            "자동 진단 불가. Playwright storage_state(JSON) 업로드로 세션을 주입하세요."
        )

    if page.locator(".ui-widget-overlay").count():
        return False, "로그인 후 추가 인증/알림 대화상자 — storage_state 사용 권장"

    return False, "로그인 실패 또는 추가 인증 필요"


def scan_ipms_online_runtime(
    base_url: str,
    *,
    ui_states: list[dict[str, Any]],
    scenario_candidates: list[dict[str, Any]],
    access: str = "public",
    username: str = "",
    password: str = "",
    storage_state: dict[str, Any] | None = None,
    skip_runtime: bool = False,
    on_progress=None,
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

    url = (base_url or IPMS_DEFAULT_BASE).strip()
    if not url.endswith("/"):
        url += "/"

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return RuntimeScanResult(
            runtime_available=False,
            runtime_error="playwright 미설치",
        )

    console_errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = _launch_chromium(p)
            ctx_kwargs: dict[str, Any] = {"viewport": {"width": 1280, "height": 900}}
            if storage_state:
                ctx_kwargs["storage_state"] = storage_state
            context = browser.new_context(**ctx_kwargs)
            page = context.new_page()

            def on_console(msg):
                if msg.type == "error":
                    text = msg.text
                    if "favicon" not in text.lower():
                        console_errors.append(text)

            page.on("console", on_console)

            tier = (access or "public").strip().lower()
            if tier == "auth":
                if storage_state:
                    _goto_home(page, url)
                    if not page.locator("#logout, .btn-logout").count():
                        return RuntimeScanResult(
                            runtime_available=False,
                            runtime_error="storage_state 세션이 만료되었거나 유효하지 않습니다.",
                            screen_coverage=[
                                ScreenCoverage(
                                    s["state_id"],
                                    s.get("label", s["state_id"]),
                                    False,
                                    "세션 무효",
                                    s.get("description", ""),
                                )
                                for s in ui_states
                            ],
                        )
                else:
                    ok, reason = ipms_establish_session(
                        page, url, username=username, password=password
                    )
                    if not ok:
                        return RuntimeScanResult(
                            runtime_available=False,
                            runtime_error=reason,
                            screen_coverage=[
                                ScreenCoverage(
                                    s["state_id"],
                                    s.get("label", s["state_id"]),
                                    False,
                                    reason,
                                    s.get("description", ""),
                                )
                                for s in ui_states
                            ],
                        )
            else:
                _goto_home(page, url)

            by_id = {c["state_id"]: c for c in scenario_candidates}

            def open_fn(pg, sid: str) -> tuple[bool, str]:
                if sid not in by_id:
                    return False, f"unknown state: {sid}"
                # 메뉴 시나리오는 홈에서 GNB 클릭
                if sid != "login_form":
                    try:
                        _goto_home(pg, url)
                    except Exception:
                        pass
                return open_state_by_steps(pg, by_id[sid], base_url=url)

            result = scan_page_states(
                page,
                ui_states,
                open_state_fn=open_fn,
                filename_prefix="screenshots/ipms-online",
                url_hint=url,
                on_progress=on_progress,
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


def parse_storage_state(raw: bytes | str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    if isinstance(raw, bytes):
        text = raw.decode("utf-8", "replace").strip()
    else:
        text = raw.strip()
    if not text:
        return None
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("storage_state JSON must be an object")
    return data
