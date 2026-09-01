from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from web_quality.runtime_env import ensure_portal_password_env

def normalize_portal_storage_state(state: dict[str, Any], base_url: str = "") -> dict[str, Any]:
    """로컬 포털 — localhost ↔ 127.0.0.1 쿠키 도메인 불일치 보정."""
    host = (urlparse(base_url).hostname or "").lower() if base_url else ""
    if host not in ("localhost", "127.0.0.1", "::1"):
        return state
    cookies = [dict(c) for c in (state.get("cookies") or []) if isinstance(c, dict)]
    if not cookies:
        return state
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, Any]] = []

    def _add(c: dict[str, Any]) -> None:
        key = (str(c.get("name") or ""), str(c.get("domain") or ""), str(c.get("path") or "/"))
        if key in seen:
            return
        seen.add(key)
        out.append(c)

    for c in cookies:
        _add(c)
        if c.get("name") == "mp_portal":
            for alt in ("localhost", "127.0.0.1"):
                cc = dict(c)
                cc["domain"] = alt
                _add(cc)
    return {**state, "cookies": out}


def validate_portal_storage_state(state: dict[str, Any] | None, base_url: str = "") -> tuple[bool, str]:
    """로컬 포털 세션 JSON에 mp_portal 쿠키가 있는지 확인."""
    if not state:
        return False, "세션이 없습니다."
    host = (urlparse(base_url).hostname or "").lower() if base_url else ""
    if host not in ("localhost", "127.0.0.1", "::1"):
        return True, ""
    for c in state.get("cookies") or []:
        if isinstance(c, dict) and c.get("name") == "mp_portal" and str(c.get("value") or "").strip():
            return True, ""
    return (
        False,
        "mp_portal 쿠키가 없습니다. Chromium 창에서 /login 포털 암호 로그인을 완료한 뒤 "
        "「로그인 세션 자동 생성」을 다시 실행하세요.",
    )


def _origin_variants(base_url: str) -> list[str]:
    raw = (base_url or "").strip().rstrip("/")
    if not raw:
        return []
    if "://" not in raw:
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()
    port = parsed.port
    scheme = parsed.scheme or "http"
    default_port = 443 if scheme == "https" else 80

    def _build(h: str) -> str:
        if port and port != default_port:
            return f"{scheme}://{h}:{port}"
        return f"{scheme}://{h}"

    origins = [_build(host)]
    if host in ("localhost", "127.0.0.1"):
        alt = "127.0.0.1" if host == "localhost" else "localhost"
        alt_origin = _build(alt)
        if alt_origin not in origins:
            origins.append(alt_origin)
    return origins


def inject_storage_cookies(context, storage: dict[str, Any], base_url: str) -> None:
    """storage_state만으로 localhost 쿠키가 누락될 때 add_cookies(url=)로 보강."""
    origins = _origin_variants(base_url)
    if not origins:
        return
    batch: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for c in storage.get("cookies") or []:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "")
        if not name:
            continue
        value = str(c.get("value") or "")
        for origin in origins:
            url = origin.rstrip("/") + "/"
            key = (name, url)
            if key in seen:
                continue
            seen.add(key)
            entry: dict[str, Any] = {"name": name, "value": value, "url": url}
            for field in ("httpOnly", "secure", "sameSite"):
                if field in c:
                    entry[field] = c[field]
            batch.append(entry)
    if batch:
        try:
            context.add_cookies(batch)
        except Exception:
            pass


def new_playwright_context(
    browser,
    *,
    storage_state: dict[str, Any] | None = None,
    base_url: str = "",
    extra_opts: dict[str, Any] | None = None,
):
    """Playwright BrowserContext — storage_state + localhost 쿠키 주입."""
    opts: dict[str, Any] = {"viewport": {"width": 1280, "height": 900}}
    if extra_opts:
        opts.update(extra_opts)
    if storage_state:
        opts["storage_state"] = storage_state
    context = browser.new_context(**opts)
    if storage_state and base_url:
        inject_storage_cookies(context, storage_state, base_url)
    return context

def resolve_storage_state(
    *,
    session_job_id: str = "",
    session_storage_bytes: bytes | None = None,
    base_url: str = "",
) -> dict[str, Any] | None:
    """Playwright storage_state — session_job_id 또는 업로드 JSON."""
    from web_quality.ipms_scanner import parse_storage_state  # type: ignore

    state: dict[str, Any] | None = None
    if session_storage_bytes:
        state = parse_storage_state(session_storage_bytes)
    else:
        job_id = (session_job_id or "").strip()
        if not job_id:
            return None
        from web_quality.ipms_session import load_session_json  # type: ignore

        state = load_session_json(job_id)
        if not state:
            raise ValueError(
                "로그인 세션을 찾을 수 없습니다. 세션을 다시 생성하거나 storage_state JSON을 업로드하세요."
            )
    if state and base_url:
        state = normalize_portal_storage_state(state, base_url)
    return state


def check_portal_session(
    *,
    session_job_id: str = "",
    session_storage_bytes: bytes | None = None,
    base_url: str = "",
) -> dict[str, Any]:
    ensure_portal_password_env()
    try:
        state = resolve_storage_state(
            session_job_id=session_job_id,
            session_storage_bytes=session_storage_bytes,
            base_url=base_url,
        )
    except ValueError as e:
        return {"ok": True, "valid": False, "message": str(e)}
    if not state:
        return {"ok": True, "valid": False, "message": "세션이 없습니다."}
    valid, message = validate_portal_storage_state(state, base_url)
    names = [
        str(c.get("name"))
        for c in (state.get("cookies") or [])
        if isinstance(c, dict) and c.get("name")
    ]
    return {
        "ok": True,
        "valid": valid,
        "message": message if not valid else "포털 세션(mp_portal) 확인됨",
        "cookie_names": names[:20],
        "has_mp_portal": any(n == "mp_portal" for n in names),
    }

def cookies_for_host(storage_state: dict[str, Any] | None, host_url: str) -> list[dict[str, Any]]:
    """Locust HttpSession용 쿠키 목록 (host 도메인과 일치하는 것만)."""
    if not storage_state:
        return []
    from urllib.parse import urlparse

    parsed = urlparse(host_url if "://" in host_url else f"http://{host_url}")
    host = (parsed.hostname or "").lower()
    if not host:
        return []

    out: list[dict[str, Any]] = []
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    for cookie in storage_state.get("cookies") or []:
        if not isinstance(cookie, dict):
            continue
        name = cookie.get("name")
        value = cookie.get("value")
        if not name:
            continue
        domain = str(cookie.get("domain") or "").lstrip(".").lower()
        if domain:
            if host in local_hosts and domain in local_hosts:
                pass
            elif host != domain and not host.endswith(f".{domain}") and domain not in host:
                continue
        out.append(
            {
                "name": str(name),
                "value": str(value or ""),
                "domain": cookie.get("domain"),
                "path": str(cookie.get("path") or "/"),
            }
        )
    return out
