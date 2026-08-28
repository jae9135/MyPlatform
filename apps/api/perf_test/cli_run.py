"""CLI entry — Locust runs in an isolated Python process (avoids gevent breaking uvicorn)."""
from __future__ import annotations

import json
import sys
from typing import Any


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        from perf_test.runner import run_locust_load_test

        def emit(kind: str, **data: Any) -> None:
            print(json.dumps({"type": kind, **data}, ensure_ascii=False), flush=True)

        def on_progress(pct: int, msg: str, live: dict[str, Any] | None) -> None:
            emit("progress", pct=pct, msg=msg, live=live)

        result = run_locust_load_test(
            payload["host"],
            payload["requests"],
            users=int(payload["users"]),
            spawn_rate=float(payload["spawn_rate"]),
            duration_sec=int(payload["duration_sec"]),
            on_progress=on_progress,
        )
        emit("done", result=result)
        return 0
    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
