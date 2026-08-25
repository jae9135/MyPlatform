"""Playwright storage_state 세션 생성 (headed 브라우저)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse, urlunparse

from web_quality.job_progress import create_job, get_job, submit_job, update_job
from web_quality.presets.ipms_online import IPMS_DEFAULT_BASE

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
    try:
        return page.locator('input[type="password"]:visible').count() > 0
    except Exception:
        return False


def _generic_login_complete(page, target_url: str, initial_cookie_count: int) -> bool:
    current = page.url
    if _normalize_url(current) == _normalize_url(target_url) and not _has_visible_password(page):
        return True
    try:
        cookies = page.context.cookies()
    except Exception:
        cookies = []
    if len(cookies) > initial_cookie_count and not _has_visible_password(page):
        target = urlparse(target_url)
        current_p = urlparse(current)
        if current_p.netloc == target.netloc:
            return True
    return False


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
    wait_message = (
        "브라우저에서 로그인을 완료한 뒤, 진단 URL 화면으로 이동하세요."
        if detect == "generic"
        else "브라우저에서 IPMS 로그인 + 공동인증서(2단계)를 완료하세요."
    )
    done_message = (
        "로그인 세션이 생성되었습니다. 「화면 시나리오 가져오기」 후 진단을 실행하세요."
        if detect == "generic"
        else "로그인 세션이 생성되었습니다. 「로그인 화면 진단」을 실행하세요."
    )

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(headless=False)
            except Exception as e:
                if "Executable doesn't exist" in str(e):
                    raise RuntimeError(
                        "Chromium 미설치 — API 터미널에서 "
                        "`cd apps/api && python -m playwright install chromium` 실행"
                    ) from e
                raise

            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.goto(target, wait_until="domcontentloaded", timeout=60000)
            initial_cookies = len(context.cookies())

            update_job(
                job_id,
                pct=10,
                message=wait_message,
                step_label="로그인 대기",
            )

            deadline = time.time() + SESSION_TIMEOUT_SEC
            while time.time() < deadline:
                if detect == "ipms":
                    if page.locator("#logout, .btn-logout, #login-user").count():
                        break
                elif _generic_login_complete(page, raw, initial_cookies):
                    break
                elapsed = SESSION_TIMEOUT_SEC - (deadline - time.time())
                pct = min(85, 10 + int(elapsed / SESSION_TIMEOUT_SEC * 75))
                update_job(job_id, pct=pct)
                time.sleep(POLL_INTERVAL_SEC)
            else:
                raise RuntimeError(
                    f"로그인 대기 시간 초과({SESSION_TIMEOUT_SEC // 60}분). "
                    "브라우저에서 로그인을 완료한 뒤 다시 시도하세요."
                )

            context.storage_state(path=str(out))
            browser.close()

    except Exception as e:
        update_job(job_id, status="error", error=str(e), message=str(e), pct=0)
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
