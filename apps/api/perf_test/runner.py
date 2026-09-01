from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from perf_test.scenario_urls import (
    candidate_display_name,
    dedupe_manual_urls,
    format_labeled_request_name,
    LABEL_PATH_SEP,
    normalize_locust_requests,
)


def _normalize_host(host: str) -> str:
    h = (host or "").strip().lower()
    if h.startswith("[") and h.endswith("]"):
        h = h[1:-1]
    if h in ("localhost", "127.0.0.1", "::1"):
        return "localhost"
    return h


def _hosts_compatible(base_netloc: str, req_netloc: str) -> bool:
    if not base_netloc or not req_netloc:
        return True
    base_host, _, base_port = base_netloc.partition(":")
    req_host, _, req_port = req_netloc.partition(":")
    if base_port != req_port:
        return False
    return _normalize_host(base_host) == _normalize_host(req_host)


def _canonical_har_path(path: str) -> str:
    """Next.js dev ?v= 캐시버스트 등 — 동일 정적 리소스로 dedupe."""
    raw = (path or "/").strip()
    if "?" not in raw:
        return raw
    base, _, query = raw.partition("?")
    if base.startswith("/_next/"):
        return base
    from urllib.parse import parse_qsl, urlencode

    kept = [(k, v) for k, v in parse_qsl(query, keep_blank_values=True) if k.lower() != "v"]
    if not kept:
        return base
    return f"{base}?{urlencode(kept)}"


def har_entries_to_requests(har_path: Path, base_url: str) -> list[dict[str, Any]]:
    data = json.loads(har_path.read_text(encoding="utf-8"))
    entries = data.get("log", {}).get("entries") or []
    parsed_base = urlparse(base_url if "://" in base_url else f"http://{base_url}")
    base_host = parsed_base.netloc
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in entries:
        req = entry.get("request") or {}
        method = str(req.get("method") or "GET").upper()
        url = str(req.get("url") or "")
        if not url:
            continue
        pu = urlparse(url)
        if pu.scheme not in ("http", "https"):
            continue
        if base_host and pu.netloc and not _hosts_compatible(base_host, pu.netloc):
            continue
        path = pu.path or "/"
        if pu.query:
            path = f"{path}?{pu.query}"
        path = _canonical_har_path(path)
        key = f"{method}:{path}"
        if key in seen:
            continue
        seen.add(key)
        out.append({"method": method, "path": path, "name": path[:120]})
    return out


def _playwright_ready() -> None:
    from web_quality.runtime_env import (  # type: ignore
        check_playwright_runtime_threadsafe,
        sanitize_playwright_browsers_path,
    )

    pw = check_playwright_runtime_threadsafe()
    if not (pw.get("browser_ready") or pw.get("ok")):
        raise RuntimeError(pw.get("message") or "Playwright 사용 불가")
    sanitize_playwright_browsers_path()


def _record_har_session(
    base_url: str,
    *,
    navigate: Callable[[Any], None],
    storage_state: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Playwright 1회 세션 HAR 녹화."""
    from playwright.sync_api import sync_playwright

    fd, har_path = tempfile.mkstemp(suffix=".har")
    os.close(fd)
    har_file = Path(har_path)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            from perf_test.session import new_playwright_context  # type: ignore

            context = new_playwright_context(
                browser,
                storage_state=storage_state,
                base_url=base_url,
                extra_opts={"record_har_path": str(har_file)},
            )
            page = context.new_page()
            navigate(page)
            context.close()
            browser.close()
        return har_entries_to_requests(har_file, base_url)
    finally:
        _safe_unlink(har_file)


def _safe_page_goto(page: Any, url: str, *, timeout_ms: int = 120_000) -> None:
    """느린/외부 URL — domcontentloaded 실패 시 commit으로 재시도."""
    last_err: Exception | None = None
    for wait_until in ("domcontentloaded", "commit"):
        try:
            page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            return
        except Exception as e:
            last_err = e
    if last_err:
        raise last_err


def record_har_multi(
    base_url: str,
    *,
    candidates: list[dict[str, Any]] | None = None,
    manual_urls: list[str] | None = None,
    manifest_path: str | None = None,
    target_id: str = "",
    storage_state: dict[str, Any] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """선택 시나리오/URL마다 HAR를 녹화하고 시나리오 라벨·경로 name으로 병합한다.

    Returns:
        (merged_requests, scenario_har_status)
    """
    from perf_test.scenario_urls import resolve_har_start_url, resolve_manual_goto_url
    from web_quality.manifest import get_target  # type: ignore
    from web_quality.scenario_open import ensure_portal_page_ready, open_candidate  # type: ignore

    cand_list = [c for c in (candidates or []) if isinstance(c, dict)]
    url_list = dedupe_manual_urls([u.strip() for u in (manual_urls or []) if u and str(u).strip()])
    if not cand_list and not url_list:
        raise ValueError("HAR 녹화 대상이 없습니다.")

    _playwright_ready()
    all_requests: list[dict[str, Any]] = []
    scenario_har: list[dict[str, Any]] = []
    tid = (target_id or "").strip()

    def _abort_if_cancelled() -> None:
        if cancel_check and cancel_check():
            from perf_test.job_progress import PerfCancelled

            raise PerfCancelled("cancelled")

    if cand_list:
        for candidate in cand_list:
            _abort_if_cancelled()
            tag = candidate_display_name(candidate)
            sid = str(candidate.get("state_id") or "")
            open_ok = False
            open_err = ""

            def _nav(page: Any, _candidate: dict[str, Any] = candidate) -> None:
                nonlocal open_ok, open_err
                start_url = resolve_har_start_url(_candidate, base_url, manifest_path=manifest_path)
                _safe_page_goto(page, start_url)
                page.wait_for_timeout(400)
                portal_cfg = get_target(tid) if tid and manifest_path else None
                if portal_cfg and portal_cfg.get("mode") == "portal":
                    ready = str(portal_cfg.get("ready_selector") or "main")
                    open_ok, open_err = ensure_portal_page_ready(
                        page,
                        base_url,
                        ready_selector=ready,
                        had_storage=bool(storage_state),
                        app_url=start_url,
                    )
                    if not open_ok:
                        page.wait_for_timeout(400)
                        return
                open_ok, open_err = open_candidate(
                    page, _candidate, target_id=tid, base_url=base_url
                )
                if not open_ok:
                    page.wait_for_timeout(600)
                page.wait_for_timeout(400)

            segment = _record_har_session(
                base_url,
                navigate=_nav,
                storage_state=storage_state,
            )
            for req in segment:
                path = _canonical_har_path(str(req.get("path") or "/"))
                req["name"] = format_labeled_request_name(tag, path)
                if sid:
                    req["scenario_id"] = sid
            all_requests.extend(segment)
            scenario_har.append(
                {
                    "state_id": sid,
                    "label": tag,
                    "open_ok": open_ok,
                    "open_error": open_err or "",
                    "har_request_count": len(segment),
                }
            )
    else:
        for raw in url_list:
            _abort_if_cancelled()
            label = raw if raw.startswith("/") else f"/{raw.lstrip('/')}"

            def _nav(page: Any, _raw: str = raw) -> None:
                goto = resolve_manual_goto_url(_raw, base_url)
                _safe_page_goto(page, goto)
                page.wait_for_timeout(800)

            segment = _record_har_session(
                base_url,
                navigate=_nav,
                storage_state=storage_state,
            )
            for req in segment:
                path = _canonical_har_path(str(req.get("path") or "/"))
                req["name"] = format_labeled_request_name(label, path)
            all_requests.extend(segment)
            scenario_har.append(
                {
                    "state_id": label,
                    "label": label,
                    "open_ok": True,
                    "open_error": "",
                    "har_request_count": len(segment),
                }
            )

    if not all_requests:
        raise RuntimeError(
            "HAR에 기록된 HTTP 요청이 없습니다. Base URL·시나리오·로그인 필요 여부를 확인하세요."
        )
    return _merge_labeled_requests(all_requests), scenario_har


def _merge_labeled_requests(requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """시나리오별 HAR 병합 — 동일 path라도 scenario_id/라벨이 다르면 유지."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for req in requests:
        method = str(req.get("method") or "GET").upper()
        path = _canonical_har_path(str(req.get("path") or "/"))
        raw_name = str(req.get("name") or path)
        sid = str(req.get("scenario_id") or "").strip()
        if LABEL_PATH_SEP in raw_name:
            label = raw_name.split(LABEL_PATH_SEP, 1)[0].strip()
            name = format_labeled_request_name(label, path)
        else:
            label = ""
            name = path[:120]
        scope = sid or label
        key = f"{method}:{path}:{scope}"
        if key in seen:
            continue
        seen.add(key)
        entry: dict[str, Any] = {**req, "method": method, "path": path, "name": name[:120]}
        if sid:
            entry["scenario_id"] = sid
        out.append(entry)
    return out


def record_har_requests(
    base_url: str,
    candidate: dict[str, Any] | None,
    *,
    storage_state: dict[str, Any] | None = None,
    manifest_path: str | None = None,
) -> list[dict[str, Any]]:
    """단일 시나리오 HAR (하위 호환)."""
    candidates = [candidate] if candidate else None
    requests, _status = record_har_multi(
        base_url,
        candidates=candidates,
        manifest_path=manifest_path,
        storage_state=storage_state,
    )
    return requests


def _safe_unlink(path: Path) -> None:
    for delay in (0, 0.15, 0.4):
        if delay:
            time.sleep(delay)
        try:
            path.unlink(missing_ok=True)
            return
        except OSError:
            continue


def run_locust_load_test(
    host: str,
    requests: list[dict[str, Any]],
    *,
    users: int,
    spawn_rate: float,
    duration_sec: int,
    on_progress: Callable[[int, str, dict[str, Any] | None], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    storage_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from perf_test.session import cookies_for_host
    try:
        import gevent
        from locust import HttpUser, constant, task
        from locust.env import Environment
        from locust.runners import Runner

        from perf_test.job_progress import PerfCancelled
    except ImportError as e:
        raise RuntimeError(
            "locust 미설치 — pip install locust 실행 후 API 재시작"
        ) from e

    if not requests:
        raise ValueError("부하 요청 목록이 비어 있습니다.")

    host = host.rstrip("/")
    if not host.startswith("http"):
        host = f"http://{host}"

    host, req_list = normalize_locust_requests(host, list(requests))
    session_cookies = cookies_for_host(storage_state, host)

    class PerfHttpUser(HttpUser):
        wait_time = constant(0.05)

        def on_start(self) -> None:
            for c in session_cookies:
                domain = c.get("domain")
                path = c.get("path") or "/"
                if domain:
                    self.client.cookies.set(c["name"], c["value"], domain=domain, path=path)
                else:
                    self.client.cookies.set(c["name"], c["value"], path=path)

        @task
        def run_flow(self) -> None:
            for req in req_list:
                if cancel_check and cancel_check():
                    return
                method = str(req.get("method") or "GET").upper()
                path = str(req.get("path") or "/")
                name = str(req.get("name") or path)[:120]
                if method == "GET":
                    self.client.get(path, name=name, timeout=30)
                elif method == "POST":
                    self.client.post(path, name=name, timeout=30)
                else:
                    self.client.request(method, path, name=name, timeout=30)

    env = Environment(user_classes=[PerfHttpUser], host=host)
    runner: Runner = env.create_local_runner()
    time_series: list[dict[str, Any]] = []
    started = time.time()
    stop_flag = {"stop": False}

    def sampler() -> None:
        while not stop_flag["stop"]:
            total = env.stats.total
            elapsed = max(time.time() - started, 0.001)
            snap = {
                "elapsed_sec": round(elapsed, 1),
                "users": runner.user_count,
                "rps": round(total.total_rps, 2),
                "fail_ratio": round(total.fail_ratio, 4),
                "avg_ms": round(total.avg_response_time or 0, 1),
                "p95_ms": round(total.get_response_time_percentile(0.95) or 0, 1),
                "total_requests": total.num_requests,
                "total_failures": total.num_failures,
            }
            time_series.append(snap)
            if on_progress:
                pct = min(99, int(elapsed / max(duration_sec, 1) * 100))
                on_progress(pct, f"부하 실행 중 · {snap['users']} VU · {snap['rps']} rps", snap)
            gevent.sleep(1)

    def stop_test() -> None:
        stop_flag["stop"] = True
        runner.quit()

    sampler_greenlet = gevent.spawn(sampler)
    runner.start(users, spawn_rate=spawn_rate)
    gevent.spawn_later(duration_sec, stop_test)

    try:
        while runner.state not in ("stopped", "ready"):
            if cancel_check and cancel_check():
                stop_test()
                raise PerfCancelled("cancelled")
            gevent.sleep(0.2)
        runner.greenlet.join(timeout=duration_sec + 30)
    finally:
        stop_test()
        sampler_greenlet.kill()

    total = env.stats.total
    elapsed = max(time.time() - started, 0.001)
    summary = {
        "total_requests": total.num_requests,
        "total_failures": total.num_failures,
        "fail_ratio": round(total.fail_ratio, 4),
        "avg_response_time_ms": round(total.avg_response_time or 0, 1),
        "min_response_time_ms": round(total.min_response_time or 0, 1),
        "max_response_time_ms": round(total.max_response_time or 0, 1),
        "p50_ms": round(total.get_response_time_percentile(0.5) or 0, 1),
        "p90_ms": round(total.get_response_time_percentile(0.9) or 0, 1),
        "p95_ms": round(total.get_response_time_percentile(0.95) or 0, 1),
        "p99_ms": round(total.get_response_time_percentile(0.99) or 0, 1),
        "rps": round(total.total_rps, 2),
        "duration_sec": round(elapsed, 1),
        "users": users,
        "spawn_rate": spawn_rate,
    }
    per_endpoint: list[dict[str, Any]] = []
    for stat in env.stats.entries.values():
        if stat.name == "Aggregated":
            continue
        per_endpoint.append(
            {
                "name": stat.name,
                "method": stat.method,
                "num_requests": stat.num_requests,
                "num_failures": stat.num_failures,
                "avg_ms": round(stat.avg_response_time or 0, 1),
                "p95_ms": round(stat.get_response_time_percentile(0.95) or 0, 1),
            }
        )
    per_endpoint.sort(key=lambda x: x["num_requests"], reverse=True)

    return {
        "summary": summary,
        "time_series": time_series,
        "endpoints": per_endpoint[:50],
        "host": host,
        "request_count": len(req_list),
    }
