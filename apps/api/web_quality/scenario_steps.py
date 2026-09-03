from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

IPMS_DIRECT_URL_MSG = (
    "IPMS 직접 URL 접근 불가 — 로그인 후에도 @GetMapping/주소창 직링크는 "
    "「비정상적인 접근」으로 차단됩니다. GNB·메뉴·목록에서 진입하는 화면입니다. "
    "정적(JSP/HTML) 진단을 이용하거나 「IPMS 온라인」 탭을 사용하세요."
)

_ERROR_TITLE_RE = re.compile(
    r"404|not\s*found|page not found|找不到|페이지를 찾을 수 없|요청하신 페이지|"
    r"존재하지 않는|could not be found",
    re.I,
)
_ERROR_BODY_SNIPPET_RE = re.compile(
    r"404|not\s*found|페이지를 찾을 수 없|요청하신 페이지를|존재하지 않는 페이지|"
    r"could not be found|can't find",
    re.I,
)
_IPMS_ABNORMAL_ACCESS_RE = re.compile(
    r"비정상적인\s*접근|세션이\s*종료",
    re.I,
)
_AUTH_JSON_RE = re.compile(
    r'"SUCCESS"\s*:\s*false|"MESSAGE"\s*:\s*"[^"]*인증',
    re.I,
)
_AUTH_BODY_RE = re.compile(
    r"인증이\s*필요|unauthorized",
    re.I,
)


def is_java_direct_goto_page(cand: dict[str, Any]) -> bool:
    """Java ZIP @GetMapping page — goto+wait only (not menu navigation)."""
    if str(cand.get("kind") or "") != "page":
        return False
    open_cfg = cand.get("open") or {}
    steps = open_cfg.get("steps") or cand.get("steps") or []
    if not steps:
        return False
    actions = [(s.get("action") or "").strip() for s in steps if isinstance(s, dict)]
    if not any(a == "goto" for a in actions):
        return False
    return all(a in ("goto", "wait") for a in actions)


def is_ipms_direct_url_error(message: str) -> bool:
    text = (message or "").strip()
    return text.startswith("IPMS 직접 URL 접근 불가")


def _expected_goto_path(steps: list[dict[str, Any]]) -> str:
    for step in steps:
        if (step.get("action") or "").strip() == "goto":
            path = step.get("path") or step.get("url") or ""
            if path and not path.startswith("http://") and not path.startswith("https://"):
                return path.split("?")[0]
    return ""


def _page_text_snippet(page, *, limit: int = 1200) -> str:
    parts: list[str] = []
    try:
        parts.append(page.locator("body").inner_text(timeout=5000) or "")
    except Exception:
        pass
    try:
        parts.append(page.content() or "")
    except Exception:
        pass
    return "\n".join(parts)[:limit]


def _raise_if_auth_or_abnormal(page, *, ipms_deploy: bool = False) -> None:
    combined = _page_text_snippet(page)
    if _IPMS_ABNORMAL_ACCESS_RE.search(combined):
        raise RuntimeError(IPMS_DIRECT_URL_MSG)
    if _AUTH_JSON_RE.search(combined):
        if ipms_deploy:
            raise RuntimeError(IPMS_DIRECT_URL_MSG)
        raise RuntimeError(f"로그인 필요 — {page.url}")
    if ipms_deploy and _AUTH_BODY_RE.search(combined):
        raise RuntimeError(IPMS_DIRECT_URL_MSG)
    if _AUTH_BODY_RE.search(combined):
        raise RuntimeError(f"로그인 필요 — {page.url}")


def _validate_opened_page(
    page,
    candidate: dict[str, Any],
    *,
    expected_path: str = "",
    ipms_deploy: bool = False,
) -> None:
    _raise_if_auth_or_abnormal(page, ipms_deploy=ipms_deploy)

    title = (page.title() or "").strip()
    if title and _ERROR_TITLE_RE.search(title):
        raise RuntimeError(f"오류 페이지로 보입니다 — title={title!r}")

    if expected_path:
        actual_path = urlparse(page.url).path or ""
        norm_expected = expected_path.rstrip("/") or "/"
        norm_actual = actual_path.rstrip("/") or "/"
        if norm_expected not in norm_actual and norm_actual not in norm_expected:
            if ipms_deploy:
                raise RuntimeError(IPMS_DIRECT_URL_MSG)
            raise RuntimeError(
                f"URL 경로 불일치 — 기대 {expected_path}, 실제 {page.url}"
            )

    open_cfg = candidate.get("open") or {}
    ready = open_cfg.get("ready_selector") or "body"
    if ready == "body":
        body_text = _page_text_snippet(page, limit=800)
        if body_text and _ERROR_BODY_SNIPPET_RE.search(body_text):
            if ipms_deploy:
                raise RuntimeError(IPMS_DIRECT_URL_MSG)
            raise RuntimeError("본문에 '페이지를 찾을 수 없' 등 오류 문구가 있습니다.")


def open_state_by_steps(
    page,
    candidate: dict[str, Any],
    *,
    base_url: str = "",
    ipms_deploy: bool = False,
) -> tuple[bool, str]:
    open_cfg = candidate.get("open") or {}
    ready = open_cfg.get("ready_selector") or candidate.get("ready_selector") or "body"
    steps = open_cfg.get("steps") or candidate.get("steps") or []
    fallback_paths = candidate.get("fallback_paths") or open_cfg.get("fallback_paths") or []
    primary_path = _expected_goto_path(steps)
    goto_paths: list[str] = []
    for p in [primary_path, *fallback_paths]:
        if not p:
            continue
        norm = p.rstrip("/") or "/"
        if norm not in {x.rstrip("/") or "/" for x in goto_paths}:
            goto_paths.append(p)

    if not goto_paths:
        goto_paths = [""]

    last_err = ""
    for goto_path in goto_paths:
        trial_steps: list[dict[str, Any]] = []
        replaced = False
        for step in steps:
            if (step.get("action") or "").strip() == "goto" and not replaced:
                trial_steps.append({**step, "path": goto_path or step.get("path") or step.get("url")})
                replaced = True
            else:
                trial_steps.append(step)
        if not replaced and goto_path:
            trial_steps = [{"action": "goto", "path": goto_path}, *trial_steps]

        expected_path = goto_path or primary_path
        try:
            for step in trial_steps:
                _run_step(page, step, base_url=base_url, ipms_deploy=ipms_deploy)
            if ready:
                page.wait_for_selector(ready, timeout=30000)
            _validate_opened_page(
                page,
                candidate,
                expected_path=expected_path,
                ipms_deploy=ipms_deploy,
            )
            return True, ""
        except Exception as e:
            last_err = str(e)
            if is_ipms_direct_url_error(last_err):
                return False, last_err
            if "404" not in last_err and "not found" not in last_err.lower():
                return False, last_err
    if ipms_deploy and last_err:
        return False, IPMS_DIRECT_URL_MSG
    return False, last_err


def _run_step(page, step: dict[str, Any], *, base_url: str = "", ipms_deploy: bool = False) -> None:
    action = (step.get("action") or "").strip()
    timeout = int(step.get("timeout_ms") or 10000)

    if action == "goto":
        path = step.get("path") or step.get("url") or ""
        if path.startswith("http://") or path.startswith("https://"):
            url = path
        elif base_url:
            from urllib.parse import urljoin

            url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
        else:
            url = path
        response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
        if response is not None and response.status >= 400:
            if response.status in (401, 403):
                if ipms_deploy:
                    raise RuntimeError(IPMS_DIRECT_URL_MSG)
                raise RuntimeError(f"로그인 필요 — {url}")
            if response.status == 404:
                if ipms_deploy:
                    raise RuntimeError(IPMS_DIRECT_URL_MSG)
                raise RuntimeError(
                    f"HTTP 404 — 배포 서버에 URL이 없습니다. "
                    f"ZIP의 @GetMapping({path}) 경로가 실제 배포본과 다를 수 있습니다. — {url}"
                )
            raise RuntimeError(f"HTTP {response.status} — {url}")
        _raise_if_auth_or_abnormal(page, ipms_deploy=ipms_deploy)
        return

    if action == "wait":
        page.wait_for_selector(step["selector"], timeout=timeout)
        return

    if action == "click":
        page.click(step["selector"], timeout=timeout)
        return

    if action == "press":
        page.keyboard.press(step["key"])
        page.wait_for_timeout(300)
        return

    if action == "click_has_text":
        sel = step["selector"]
        text = step["text"]
        page.locator(f"{sel}:has-text({_quote(text)})").first.click(timeout=timeout)
        return

    if action == "click_any":
        last_err = "일치하는 요소 없음"
        for sel in step.get("selectors") or []:
            try:
                loc = page.locator(sel).first
                if loc.count():
                    loc.click(timeout=timeout)
                    return
            except Exception as e:
                last_err = str(e)
        raise RuntimeError(f"click_any 실패: {last_err}")

    raise RuntimeError(f"알 수 없는 action: {action}")


def _quote(text: str) -> str:
    if '"' not in text:
        return f'"{text}"'
    return "'" + text.replace("'", "\\'") + "'"
