from __future__ import annotations

import os
import re
from typing import Any

_SANDBOX_BROWSERS_MARK = "cursor-sandbox-cache"


def sanitize_playwright_browsers_path() -> str | None:
    """Drop Cursor agent sandbox PLAYWRIGHT_BROWSERS_PATH (empty cache, no Chromium)."""
    path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "").strip()
    if path and _SANDBOX_BROWSERS_MARK in path.replace("\\", "/"):
        return os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)
    return None


def _friendly_playwright_error(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return "Playwright 런타임 오류"
    if "Executable doesn't exist" in text or "BrowserType.launch" in text:
        return (
            "Playwright Chromium이 설치되지 않았습니다. "
            "API 터미널에서 `cd apps/api && python -m playwright install chromium` 실행 후 "
            "API 서버를 재시작하세요."
        )
    if "playwright 미설치" in text.lower():
        return text
    if "Sync API inside the asyncio loop" in text:
        return (
            "Playwright 환경 확인 중 내부 오류(비동기 충돌). "
            "진단 실행은 가능할 수 있으나 API validate 호출 방식을 수정 중입니다."
        )
    if len(text) > 220:
        return text[:220] + "…"
    return text


_PORTAL_ENV_LOADED = False


def ensure_portal_password_env() -> None:
    """API에 PORTAL_PASSWORD 없으면 apps/portal/.env.local 에서 1회 로드."""
    global _PORTAL_ENV_LOADED
    if _PORTAL_ENV_LOADED or os.environ.get("PORTAL_PASSWORD", "").strip():
        _PORTAL_ENV_LOADED = True
        return
    from pathlib import Path

    portal_env = Path(__file__).resolve().parent.parent.parent / "portal" / ".env.local"
    if not portal_env.is_file():
        _PORTAL_ENV_LOADED = True
        return
    for line in portal_env.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, val = text.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key == "PORTAL_PASSWORD" and val:
            os.environ.setdefault("PORTAL_PASSWORD", val)
            break
    _PORTAL_ENV_LOADED = True


def _launch_chromium(playwright):
    sanitize_playwright_browsers_path()
    return playwright.chromium.launch(headless=True)


def check_playwright_runtime() -> dict[str, Any]:
    sanitize_playwright_browsers_path()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {
            "ok": False,
            "installed": False,
            "browser_ready": False,
            "message": "playwright 패키지 없음 — pip install playwright",
            "install_hint": "cd apps/api && pip install playwright && python -m playwright install chromium",
        }

    browsers_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "").strip()
    try:
        with sync_playwright() as p:
            browser = _launch_chromium(p)
            browser.close()
        return {
            "ok": True,
            "installed": True,
            "browser_ready": True,
            "message": "Playwright Chromium 사용 가능",
            "browsers_path": browsers_path or "(기본 캐시)",
            "install_hint": "",
        }
    except Exception as e:
        raw = str(e)
        return {
            "ok": False,
            "installed": True,
            "browser_ready": False,
            "message": _friendly_playwright_error(raw),
            "detail": raw[:500],
            "browsers_path": browsers_path or "(기본 캐시)",
            "install_hint": "cd apps/api && python -m playwright install chromium",
        }


def get_environment_status() -> dict[str, Any]:
    ensure_portal_password_env()
    pw = os.environ.get("PORTAL_PASSWORD", "").strip()
    playwright = check_playwright_runtime()
    return {
        "portal_password_set": bool(pw),
        "playwright": playwright,
    }


def check_playwright_runtime_threadsafe(timeout_sec: float = 120.0) -> dict[str, Any]:
    """FastAPI async 라우트 등 이벤트 루프에서 sync Playwright 호출 시 사용."""
    import concurrent.futures

    try:
        import asyncio

        asyncio.get_running_loop()
    except RuntimeError:
        return check_playwright_runtime()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(check_playwright_runtime)
        return future.result(timeout=timeout_sec)
