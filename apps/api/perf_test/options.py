from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

DEFAULT_MAX_USERS = int(os.getenv("PERF_MAX_USERS", "100"))
DEFAULT_DURATION_SEC = 30
DEFAULT_SPAWN_RATE = 1.0
DEFAULT_USERS = 5


@dataclass
class PerfTestOptions:
    target: str = ""
    base_url: str = ""
    state_ids: list[str] = field(default_factory=list)
    users: int = DEFAULT_USERS
    spawn_rate: float = DEFAULT_SPAWN_RATE
    duration_sec: int = DEFAULT_DURATION_SEC
    record_har: bool = False
    confirm_high_load: bool = False
    access: str = "public,auth"
    manual_urls: list[str] = field(default_factory=list)
    session_job_id: str = ""
    session_storage: dict[str, Any] | None = field(default=None, repr=False)

    @classmethod
    def from_params(
        cls,
        *,
        target: str = "",
        base_url: str = "",
        state_ids: str | list[str] = "",
        users: int = DEFAULT_USERS,
        spawn_rate: float = DEFAULT_SPAWN_RATE,
        duration_sec: int = DEFAULT_DURATION_SEC,
        record_har: bool = False,
        confirm_high_load: bool = False,
        access: str = "public,auth",
        manual_urls: str = "",
        session_job_id: str = "",
    ) -> PerfTestOptions:
        ids: list[str] = []
        if isinstance(state_ids, list):
            ids = [str(x).strip() for x in state_ids if str(x).strip()]
        elif state_ids:
            raw = state_ids.strip()
            if raw.startswith("["):
                import json

                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        ids = [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    ids = []
            if not ids:
                ids = [x.strip() for x in raw.split(",") if x.strip()]

        urls: list[str] = []
        if manual_urls:
            from perf_test.scenario_urls import dedupe_manual_urls

            raw_urls = [u.strip() for u in manual_urls.replace("\n", ",").split(",") if u.strip()]
            urls = dedupe_manual_urls(raw_urls)

        return cls(
            target=(target or "").strip(),
            base_url=(base_url or "").strip().rstrip("/"),
            state_ids=ids,
            users=max(1, int(users or DEFAULT_USERS)),
            spawn_rate=max(0.1, float(spawn_rate or DEFAULT_SPAWN_RATE)),
            duration_sec=max(5, min(3600, int(duration_sec or DEFAULT_DURATION_SEC))),
            record_har=bool(record_har),
            confirm_high_load=bool(confirm_high_load),
            access=(access or "public,auth").strip() or "public,auth",
            manual_urls=urls,
            session_job_id=(session_job_id or "").strip(),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "target": self.target,
            "base_url": self.base_url,
            "state_ids": self.state_ids,
            "users": self.users,
            "spawn_rate": self.spawn_rate,
            "duration_sec": self.duration_sec,
            "record_har": self.record_har,
            "access": self.access,
            "manual_urls": self.manual_urls,
            "session_job_id": self.session_job_id,
            "has_session_storage": bool(self.session_storage),
        }
