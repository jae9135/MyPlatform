"""Playwright storage_state 세션 생성 (headed 브라우저)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse, urlunparse

from web_quality.job_progress import (
    ScanCancelled,
    check_cancelled,
    create_job,
    get_job,
    is_cancelled,
    submit_job,
    update_job,
)
from web_quality.presets.ipms_online import IPMS_DEFAULT_BASE
from web_quality.runtime_common import has_auth_cookies, is_portal_like_url, looks_like_login_form, page_login_blocked

SessionDetect = Literal["ipms", "generic"]

SESSION_DIR = Path(__file__).resolve().parent.parent / "data" / "ipms_sessions"
SESSION_TIMEOUT_SEC = 600
POLL_INTERVAL_SEC = 1.0


def _session_path(job_id: str) -> Path:
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    return SESSION_DIR / f"{job_id}.json"


def _normalize_url(url: str) -> str:
    p = urlparse(url.strip())
    path = (p.path or "/").rstrip("/") or "/"
    return urlunparse((p.scheme, p.netloc, path, p.params, p.query, ""))


def _has_visible_password(page) -> bool:
    return looks_like_login_form(page)


def _has_portal_session_cookie(context) -> bool:
    try:
        for c in context.cookies():
            if c.get("name") == "mp_portal" and c.get("value"):
                return True
    except Exception:
        pass
    return False


def _generic_login_complete(page, target_url: str, initial_cookie_count: int) -> bool:
    blocked, _ = page_login_blocked(page)
    if blocked:
        return False
    if looks_like_login_form(page):
        return False

    path = urlparse(page.url).path or ""
    if any(k in path.lower() for k in ("/login", "signin", "sign-in")):
        return False

    target = urlparse(target_url)
    host = (target.hostname or "").lower()
    if host in ("localhost", "127.0.0.1", "::1"):
        return _has_portal_session_cookie(page.context)

    try:
        cookies = page.context.cookies()
    except Exception:
        cookies = []
    if len(cookies) <= initial_cookie_count:
        return False
    if not has_auth_cookies(cookies, host):
        return False

    current_p = urlparse(page.url)
    if current_p.netloc != target.netloc:
        return False
    return True


BROWSER_CLOSED_MSG = "브라우저 창이 닫혔습니다. 「로그인 창 띄움」을 다시 시도하세요."


def _browser_window_closed(browser, page) -> bool:
    try:
        return not browser.is_connected() or page.is_closed()
    except Exception:
        return True


def _raise_if_browser_closed(browser, page) -> None:
    if _browser_window_closed(browser, page):
        raise RuntimeError(BROWSER_CLOSED_MSG)


def _is_target_closed(exc: BaseException) -> bool:
    text = str(exc).lower()
    if "has been closed" in text or "target page, context or browser" in text:
        return True
    name = type(exc).__name__
    return name in ("TargetClosedError", "Error") and "closed" in text


def _session_error_message(exc: BaseException) -> str:
    if _is_target_closed(exc):
        return BROWSER_CLOSED_MSG
    return str(exc)


def _goto_or_fail(page, url: str, *, timeout: int = 60000) -> None:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
    except Exception as e:
        if _is_target_closed(e):
            raise RuntimeError(BROWSER_CLOSED_MSG) from e
        raise


def _portal_origin(url: str) -> str:
    p = urlparse(url.strip())
    if not p.scheme or not p.netloc:
        return url.strip()
    return f"{p.scheme}://{p.netloc}/"


def _headed_browser_available() -> bool:
    import os

    if os.name == "nt":
        return True
    return bool(os.environ.get("DISPLAY", "").strip())


def _try_headless_portal_session(job_id: str, url: str, password: str) -> bool:
    """Render 등 headless API — PORTAL_PASSWORD로 /login 자동 로그인 (포털 URL만)."""
    if not is_portal_like_url(url):
        return False
    from playwright.sync_api import sync_playwright

    from web_quality.runtime_common import portal_login
    from web_quality.runtime_env import _launch_chromium, sanitize_playwright_browsers_path

    origin = _portal_origin(url)
    out = _session_path(job_id)
    update_job(
        job_id,
        pct=12,
        message="포털 암호로 자동 로그인 중…",
        step_label="로그인",
    )
    try:
        sanitize_playwright_browsers_path()
        with sync_playwright() as p:
            browser = _launch_chromium(p)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            portal_login(page, origin, password)
            _goto_or_fail(page, url.strip())
            page.wait_for_timeout(500)
            blocked, reason = page_login_blocked(page)
            if blocked:
                browser.close()
                return False
            if not _has_portal_session_cookie(context):
                host = (urlparse(url).hostname or "").lower()
                if host in ("localhost", "127.0.0.1", "::1"):
                    browser.close()
                    return False
            check_cancelled(job_id)
            context.storage_state(path=str(out))
            browser.close()
    except Exception:
        return False

    if not out.is_file():
        return False
    update_job(
        job_id,
        status="done",
        pct=100,
        message="포털 로그인 세션이 생성되었습니다. 「적용」으로 시나리오를 다시 가져오세요.",
        step_label="완료",
        file_path=str(out),
    )
    return True


def _run_session_capture(job_id: str, url: str, *, detect: SessionDetect = "ipms") -> None:
    from playwright.sync_api import sync_playwright

    raw = (url or IPMS_DEFAULT_BASE).strip()
    target = raw
    if detect == "ipms" and not target.endswith("/"):
        target += "/"

    update_job(
        job_id,
        pct=5,
        message="Chromium 실행 중…",
        step_label="브라우저 열기",
    )

    out = _session_path(job_id)
    portal_target = detect == "generic" and is_portal_like_url(raw)
    wait_message = (
        "Chromium 창에서 http://…/login 으로 이동해 포털 암호 로그인을 완료하세요. "
        "mp_portal 쿠키가 생기면 자동 저장됩니다."
        if portal_target
        else "Chromium 창에서 해당 사이트 로그인을 완료하세요. 로그인 후 쿠키가 저장되면 자동 완료됩니다."
        if detect == "generic"
        else "브라우저에서 IPMS 로그인 + 공동인증서(2단계)를 완료하세요."
    )
    done_message = (
        "로그인 세션이 생성되었습니다. 「적용」으로 시나리오를 다시 가져오세요."
        if detect == "generic"
        else "로그인 세션이 생성되었습니다. 「로그인 화면 진단」을 실행하세요."
    )

    if detect == "generic":
        from web_quality.runtime_env import ensure_portal_password_env

        ensure_portal_password_env()
        pw = __import__("os").environ.get("PORTAL_PASSWORD", "").strip()
        if portal_target and pw and _try_headless_portal_session(job_id, raw, pw):
            return
        if not _headed_browser_available():
            if portal_target:
                update_job(
                    job_id,
                    status="error",
                    error=(
                        "배포 API에서는 브라우저 창을 띄울 수 없습니다. "
                        "API에 PORTAL_PASSWORD를 설정했는지 확인하거나 세션 JSON 업로드를 사용하세요."
                    ),
                    message="포털 자동 로그인 실패 — 세션 JSON 업로드를 이용하세요.",
                    pct=0,
                )
            else:
                update_job(
                    job_id,
                    status="error",
                    error=(
                        "배포 API에서는 외부 사이트용 로그인 창을 띄울 수 없습니다. "
                        "「세션 JSON 업로드」로 Playwright storage_state를 등록하세요."
                    ),
                    message="외부 URL — 세션 JSON 업로드를 이용하세요.",
                    pct=0,
                )
            return

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(
                    headless=False,
                    args=["--start-maximized", "--window-position=0,0"],
                )
            except Exception as e:
                if "Executable doesn't exist" in str(e):
                    raise RuntimeError(
                        "Chromium 미설치 — API 터미널에서 "
                        "`cd apps/api && python -m playwright install chromium` 실행"
                    ) from e
                raise

            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            try:
                page.bring_to_front()
            except Exception:
                pass
            try:
                page.evaluate("() => { window.focus(); }")
            except Exception:
                pass
            _goto_or_fail(page, target)
            initial_cookies = len(context.cookies())

            update_job(
                job_id,
                pct=10,
                message=wait_message,
                step_label="로그인 대기",
            )

            deadline = time.time() + SESSION_TIMEOUT_SEC
            login_ready = False
            while time.time() < deadline:
                if is_cancelled(job_id):
                    browser.close()
                    raise ScanCancelled("cancelled")
                _raise_if_browser_closed(browser, page)
                try:
                    if detect == "ipms":
                        if page.locator("#logout, .btn-logout, #login-user").count():
                            login_ready = True
                            break
                    elif _generic_login_complete(page, raw, initial_cookies):
                        login_ready = True
                        break
                except Exception as e:
                    if _is_target_closed(e) or _browser_window_closed(browser, page):
                        raise RuntimeError(BROWSER_CLOSED_MSG) from e
                    raise
                elapsed_sec = int(time.time() - (deadline - SESSION_TIMEOUT_SEC))
                update_job(
                    job_id,
                    pct=15,
                    message=f"{wait_message} ({elapsed_sec}초 경과 · 최대 {SESSION_TIMEOUT_SEC // 60}분)",
                )
                time.sleep(POLL_INTERVAL_SEC)
            else:
                browser.close()
                raise RuntimeError(
                    f"로그인 대기 시간 초과({SESSION_TIMEOUT_SEC // 60}분). "
                    "브라우저에서 로그인을 완료한 뒤 다시 시도하세요."
                )

            if login_ready and detect == "generic" and _normalize_url(page.url) != _normalize_url(raw):
                try:
                    _goto_or_fail(page, raw)
                    page.wait_for_timeout(400)
                except RuntimeError as e:
                    if str(e) == BROWSER_CLOSED_MSG:
                        raise
                    pass
                except Exception:
                    pass

            if detect == "generic":
                host = (urlparse(raw).hostname or "").lower()
                if host in ("localhost", "127.0.0.1", "::1") and not _has_portal_session_cookie(context):
                    browser.close()
                    raise RuntimeError(
                        "포털 로그인(mp_portal)이 확인되지 않았습니다. "
                        "Chromium 창에서 /login 으로 이동해 포털 암호 로그인을 완료한 뒤 다시 시도하세요."
                    )
                cookies = context.cookies()
                if host not in ("localhost", "127.0.0.1", "::1") and not has_auth_cookies(cookies, host):
                    browser.close()
                    raise RuntimeError(
                        "로그인 쿠키가 확인되지 않았습니다. "
                        "Chromium 창에서 로그인을 완료한 뒤 다시 시도하세요."
                    )
                blocked, reason = page_login_blocked(page)
                if blocked:
                    browser.close()
                    raise RuntimeError(
                        reason or "로그인 화면이 확인되었습니다. 로그인을 완료한 뒤 다시 시도하세요."
                    )

            check_cancelled(job_id)
            context.storage_state(path=str(out))
            browser.close()

    except ScanCancelled:
        update_job(job_id, status="cancelled", message="취소됨", error="cancelled", pct=0)
        return
    except Exception as e:
        msg = _session_error_message(e)
        update_job(job_id, status="error", error=msg, message=msg, pct=0)
        return

    if not out.is_file():
        update_job(job_id, status="error", error="세션 파일 저장 실패", message="저장 실패")
        return

    update_job(
        job_id,
        status="done",
        pct=100,
        message=done_message,
        step_label="완료",
        file_path=str(out),
    )


def start_browser_session_job(page_url: str = "", *, detect: SessionDetect = "generic") -> str:
    kind = "browser-session" if detect == "generic" else "ipms-session"
    job_id = create_job(kind, message="세션 생성 대기 중…")
    submit_job(job_id, lambda: _run_session_capture(job_id, page_url, detect=detect))
    return job_id


def start_ipms_session_job(page_url: str = "") -> str:
    return start_browser_session_job(page_url, detect="ipms")


def load_session_json(job_id: str) -> dict[str, Any] | None:
    job = get_job(job_id)
    if job and job.file_path:
        path = Path(job.file_path)
    else:
        path = _session_path(job_id)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def session_file_path(job_id: str) -> Path | None:
    p = _session_path(job_id)
    return p if p.is_file() else None
