from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse


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
        if base_host and pu.netloc and pu.netloc != base_host:
            continue
        path = pu.path or "/"
        if pu.query:
            path = f"{path}?{pu.query}"
        key = f"{method}:{path}"
        if key in seen:
            continue
        seen.add(key)
        out.append({"method": method, "path": path, "name": path[:120]})
    return out


def record_har_requests(
    base_url: str,
    candidate: dict[str, Any] | None,
    *,
    storage_state_path: str | None = None,
) -> list[dict[str, Any]]:
    from web_quality.runtime_env import check_playwright_runtime, sanitize_playwright_browsers_path  # type: ignore
    from web_quality.scenario_steps import open_state_by_steps  # type: ignore

    pw = check_playwright_runtime()
    if not pw.get("ok"):
        raise RuntimeError(pw.get("message") or "Playwright 사용 불가")

    sanitize_playwright_browsers_path()
    from playwright.sync_api import sync_playwright

    har_file = Path(tempfile.mkstemp(suffix=".har")[1])
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx_opts: dict[str, Any] = {"record_har_path": str(har_file)}
            if storage_state_path and Path(storage_state_path).is_file():
                ctx_opts["storage_state"] = storage_state_path
            context = browser.new_context(**ctx_opts)
            page = context.new_page()
            if candidate:
                open_state_by_steps(page, candidate, base_url=base_url)
            else:
                page.goto(base_url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(1500)
            context.close()
            browser.close()
        return har_entries_to_requests(har_file, base_url)
    finally:
        har_file.unlink(missing_ok=True)


def run_locust_load_test(
    host: str,
    requests: list[dict[str, Any]],
    *,
    users: int,
    spawn_rate: float,
    duration_sec: int,
    on_progress: Callable[[int, str, dict[str, Any] | None], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> dict[str, Any]:
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

    req_list = list(requests)

    class PerfHttpUser(HttpUser):
        wait_time = constant(0.05)

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
