from __future__ import annotations

from typing import Any
from urllib.parse import urljoin, urlparse


def parse_state_ids(raw: str | list[str]) -> list[str]:
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if not raw:
        return []
    text = raw.strip()
    if text.startswith("["):
        import json

        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
    return [x.strip() for x in text.split(",") if x.strip()]


def urls_from_candidate(candidate: dict[str, Any], base_url: str) -> list[str]:
    out: list[str] = []
    open_block = candidate.get("open") or {}
    steps = open_block.get("steps") or candidate.get("steps") or []
    for step in steps:
        if not isinstance(step, dict):
            continue
        action = str(step.get("action") or "").lower()
        if action == "goto" and step.get("url"):
            out.append(str(step["url"]).strip())
    if not out and candidate.get("page_url"):
        out.append(str(candidate["page_url"]).strip())
    normalized: list[str] = []
    for url in out:
        if url.startswith("http://") or url.startswith("https://"):
            normalized.append(url)
        elif base_url:
            normalized.append(urljoin(base_url.rstrip("/") + "/", url.lstrip("/")))
        else:
            normalized.append(url)
    return normalized


def urls_to_requests(urls: list[str], base_url: str) -> list[dict[str, Any]]:
    host = base_url.rstrip("/")
    parsed_base = urlparse(host if "://" in host else f"http://{host}")
    base_origin = f"{parsed_base.scheme}://{parsed_base.netloc}"
    requests: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url in urls:
        if not url:
            continue
        if url.startswith("http://") or url.startswith("https://"):
            pu = urlparse(url)
            if pu.netloc and pu.netloc != parsed_base.netloc:
                path = url
                name = pu.path or "/"
            else:
                path = pu.path or "/"
                if pu.query:
                    path = f"{path}?{pu.query}"
                name = path[:120]
        else:
            path = url if url.startswith("/") else f"/{url}"
            name = path[:120]
        key = f"GET:{path}"
        if key in seen:
            continue
        seen.add(key)
        requests.append({"method": "GET", "path": path, "name": name})
    if not requests and base_origin:
        requests.append({"method": "GET", "path": "/", "name": "/"})
    return requests


def fetch_scenarios(
    target: str,
    *,
    base_url: str = "",
    access: str = "public",
) -> dict[str, Any]:
    cfg_target = (target or "").strip() or "my-gantt"
    if cfg_target == "ipms-online":
        from web_quality.presets.ipms_online import extract_ipms_scenarios  # type: ignore

        tier = (access or "public").strip().lower() or "public"
        return extract_ipms_scenarios(base_url=base_url, access=tier)

    from web_quality.manifest import PORTAL_TARGET_IDS  # type: ignore
    from web_quality.scenario_extract import extract_scenarios  # type: ignore

    if cfg_target not in PORTAL_TARGET_IDS:
        raise ValueError(f"지원하지 않는 포털 앱: {cfg_target}")
    return extract_scenarios(cfg_target)


def select_candidates(
    scenario_payload: dict[str, Any],
    state_ids: list[str],
) -> list[dict[str, Any]]:
    candidates = scenario_payload.get("candidates") or []
    if not isinstance(candidates, list):
        return []
    if not state_ids:
        defaults = scenario_payload.get("defaults_selected") or []
        if isinstance(defaults, list) and defaults:
            state_ids = [str(x) for x in defaults]
        else:
            state_ids = [
                str(c.get("state_id"))
                for c in candidates
                if isinstance(c, dict) and c.get("selectable", True) and c.get("recommended", True)
            ]
    id_set = set(state_ids)
    selected = [c for c in candidates if isinstance(c, dict) and c.get("state_id") in id_set]
    return selected


def build_requests_from_scenarios(
    scenario_payload: dict[str, Any],
    state_ids: list[str],
    base_url: str,
    manual_urls: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    urls: list[str] = list(manual_urls or [])
    for candidate in select_candidates(scenario_payload, state_ids):
        urls.extend(urls_from_candidate(candidate, base_url))
    if not urls and base_url:
        urls.append(base_url)
    return urls_to_requests(urls, base_url), urls
