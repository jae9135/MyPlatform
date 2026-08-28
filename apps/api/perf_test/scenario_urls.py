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


def normalize_locust_requests(
    base_url: str,
    requests: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    """Locust host에 base path가 포함된 경우 요청 path를 상대 경로로 맞춘다."""
    raw = (base_url or "").strip()
    parsed = urlparse(raw if "://" in raw else f"http://{raw}")
    base_path = (parsed.path or "").rstrip("/")
    if base_path:
        locust_host = f"{parsed.scheme}://{parsed.netloc}{base_path}"
    else:
        locust_host = f"{parsed.scheme}://{parsed.netloc}"

    out: list[dict[str, Any]] = []
    for req in requests:
        path = str(req.get("path") or "/")
        if base_path:
            if path == base_path or path == f"{base_path}/":
                path = "/"
            elif path.startswith(base_path + "/"):
                path = path[len(base_path) :] or "/"
            elif path.startswith(base_path) and len(path) > len(base_path):
                path = path[len(base_path) :] or "/"
        if not path.startswith("/"):
            path = f"/{path}"
        out.append({**req, "path": path})
    return locust_host, out


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


def _base_path_from_url(base_url: str) -> str:
    host = (base_url or "").strip()
    parsed = urlparse(host if "://" in host else f"http://{host}")
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    return path


def _manifest_path_for_target(target: str) -> str | None:
    if not target or target == "ipms-online":
        return None
    from web_quality.manifest import get_target  # type: ignore

    cfg = get_target(target)
    if not cfg:
        return None
    p = (cfg.get("path") or "").strip()
    return p if p else None


def candidate_to_request_entries(
    candidate: dict[str, Any],
    base_url: str,
    fallback_path: str | None = None,
) -> list[dict[str, Any]]:
    urls = urls_from_candidate(candidate, base_url)
    if urls:
        return urls_to_requests(urls, base_url)
    path = fallback_path or _base_path_from_url(base_url)
    label = str(candidate.get("label") or candidate.get("state_id") or path)
    sid = str(candidate.get("state_id") or "")
    name = label if not sid else f"{label} [{sid}]"
    return [{"method": "GET", "path": path, "name": name[:120]}]


def _dedupe_requests(requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for req in requests:
        method = str(req.get("method") or "GET").upper()
        path = str(req.get("path") or "/")
        name = str(req.get("name") or path)[:120]
        key = f"{method}:{path}:{name}"
        if key in seen:
            continue
        seen.add(key)
        out.append({"method": method, "path": path, "name": name})
    return out


def build_requests_from_scenarios(
    scenario_payload: dict[str, Any],
    state_ids: list[str],
    base_url: str,
    manual_urls: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    manifest_path = _manifest_path_for_target(str(scenario_payload.get("target") or ""))
    requests: list[dict[str, Any]] = []

    if manual_urls:
        requests.extend(urls_to_requests(manual_urls, base_url))

    for candidate in select_candidates(scenario_payload, state_ids):
        requests.extend(
            candidate_to_request_entries(candidate, base_url, manifest_path or _base_path_from_url(base_url))
        )

    requests = _dedupe_requests(requests)
    if not requests and base_url:
        requests = urls_to_requests([base_url], base_url)

    url_labels = [str(r.get("name") or r.get("path") or "") for r in requests]
    return requests, url_labels
