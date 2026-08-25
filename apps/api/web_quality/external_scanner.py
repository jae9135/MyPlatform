from __future__ import annotations



from dataclasses import dataclass

from typing import Any



from web_quality.runtime_common import (

    RuntimeScanResult,

    ScreenCoverage,

    _attach_console_findings,

    external_login,

    portal_login,

    scan_page_states,

)

from web_quality.runtime_env import _friendly_playwright_error, _launch_chromium

from web_quality.scenario_steps import open_state_by_steps





@dataclass

class ExternalLoginConfig:

    login_url: str = ""

    username: str = ""

    password: str = ""

    portal_password: str = ""

    user_selector: str = ""

    password_selector: str = ""

    submit_selector: str = ""

    need_login: bool = False





def _is_portal_host(url: str) -> bool:

    from urllib.parse import urlparse



    host = urlparse(url).hostname or ""

    return host in ("127.0.0.1", "localhost", "::1")





def _establish_session(page, entry_url: str, login: ExternalLoginConfig) -> tuple[bool, str]:

    if not login.need_login:

        return True, ""



    pw = (login.password or login.portal_password or "").strip()

    user = login.username.strip()

    lu = login.login_url.strip()



    if _is_portal_host(entry_url) and pw and not lu and not user:
        try:
            from urllib.parse import urlparse

            p = urlparse(entry_url)
            base = f"{p.scheme}://{p.netloc}/"
            portal_login(page, base, pw)
            return True, ""
        except Exception as e:
            return False, f"포털 로그인 실패: {e}"



    if lu and user and pw:

        try:

            external_login(

                page,

                lu,

                user,

                pw,

                user_selector=login.user_selector,

                password_selector=login.password_selector,

                submit_selector=login.submit_selector,

            )

            return True, ""

        except Exception as e:

            return False, f"로그인 실패: {e}"



    if login.need_login:

        return False, "로그인 정보가 없습니다."

    return True, ""





def scan_external_url_runtime(

    page_url: str,

    login: ExternalLoginConfig | None = None,

    *,

    ui_states: list[dict[str, Any]] | None = None,

    scenario_candidates: list[dict[str, Any]] | None = None,

    storage_state: dict[str, Any] | None = None,

    skip_runtime: bool = False,

    on_progress=None,

) -> RuntimeScanResult:

    url = (page_url or "").strip()

    if not url.startswith("http://") and not url.startswith("https://"):

        return RuntimeScanResult(

            runtime_available=False,

            runtime_error="page_url은 http:// 또는 https:// 로 시작해야 합니다.",

        )



    login = login or ExternalLoginConfig()

    states = ui_states or [

        {"state_id": "page", "label": "진단 페이지", "description": url, "required": True}

    ]

    candidates = scenario_candidates or []



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

                for s in states

            ],

        )



    try:

        from playwright.sync_api import sync_playwright

    except ImportError:

        return RuntimeScanResult(

            runtime_available=False,

            runtime_error="playwright 미설치",

            screen_coverage=[

                ScreenCoverage(

                    s["state_id"],

                    s.get("label", s["state_id"]),

                    False,

                    "playwright 없음",

                    s.get("description", ""),

                )

                for s in states

            ],

        )



    console_errors: list[str] = []



    try:

        with sync_playwright() as p:

            browser = _launch_chromium(p)

            ctx: dict[str, Any] = {"viewport": {"width": 1280, "height": 900}}

            if storage_state:

                ctx["storage_state"] = storage_state

            context = browser.new_context(**ctx)

            page = context.new_page()



            def on_console(msg):

                if msg.type == "error":

                    text = msg.text

                    if "favicon" not in text.lower():

                        console_errors.append(text)



            page.on("console", on_console)



            if not storage_state:

                ok, reason = _establish_session(page, url, login)

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

                            for s in states

                        ],

                    )



            by_id = {c["state_id"]: c for c in candidates}



            def open_fn(pg, sid: str) -> tuple[bool, str]:

                if sid in by_id:

                    return open_state_by_steps(pg, by_id[sid], base_url=url)

                if sid == "page":

                    pg.goto(url, wait_until="domcontentloaded", timeout=60000)

                    pg.wait_for_selector("body", timeout=30000)

                    return True, ""

                return False, f"unknown state: {sid}"



            result = scan_page_states(

                page,

                states,

                open_state_fn=open_fn,

                filename_prefix="screenshots/external",

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

                for s in states

            ],

            console_errors=console_errors,

        )

