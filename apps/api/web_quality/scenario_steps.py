from __future__ import annotations

from typing import Any


def open_state_by_steps(page, candidate: dict[str, Any], *, base_url: str = "") -> tuple[bool, str]:
    open_cfg = candidate.get("open") or {}
    ready = open_cfg.get("ready_selector") or "body"
    steps = open_cfg.get("steps") or []
    try:
        for step in steps:
            _run_step(page, step, base_url=base_url)
        if ready:
            page.wait_for_selector(ready, timeout=30000)
        return True, ""
    except Exception as e:
        return False, str(e)


def _run_step(page, step: dict[str, Any], *, base_url: str = "") -> None:
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
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
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
