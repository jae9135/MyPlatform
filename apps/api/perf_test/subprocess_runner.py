"""Run Locust in a child Python process so gevent monkey-patching cannot break uvicorn."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable

API_DIR = Path(__file__).resolve().parent.parent


def run_locust_isolated(
    host: str,
    requests: list[dict[str, Any]],
    *,
    users: int,
    spawn_rate: float,
    duration_sec: int,
    on_progress: Callable[[int, str, dict[str, Any] | None], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    payload = {
        "host": host,
        "requests": requests,
        "users": users,
        "spawn_rate": spawn_rate,
        "duration_sec": duration_sec,
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "perf_test.cli_run"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(API_DIR),
        env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
    )
    assert proc.stdin is not None
    proc.stdin.write(json.dumps(payload, ensure_ascii=False))
    proc.stdin.close()

    result: dict[str, Any] | None = None
    deadline = time.time() + duration_sec + 90

    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            if cancel_check and cancel_check():
                proc.terminate()
                raise RuntimeError("cancelled")
            if time.time() > deadline:
                proc.terminate()
                raise RuntimeError("부하 테스트 subprocess 시간 초과")
            line = line.strip()
            if not line:
                continue
            msg = json.loads(line)
            kind = msg.get("type")
            if kind == "progress" and on_progress:
                on_progress(
                    int(msg.get("pct") or 0),
                    str(msg.get("msg") or ""),
                    msg.get("live"),
                )
            elif kind == "done":
                result = msg.get("result")
            elif kind == "error":
                raise RuntimeError(str(msg.get("message") or "부하 테스트 실패"))
    finally:
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    if proc.returncode not in (0, None) and result is None:
        err = (proc.stderr.read() if proc.stderr else "") or f"exit code {proc.returncode}"
        raise RuntimeError(err.strip() or "부하 테스트 subprocess 실패")

    if result is None:
        raise RuntimeError("부하 테스트 결과를 받지 못했습니다.")
    return result
