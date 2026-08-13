"""Best-effort write of run_events metadata (no file contents)."""

from __future__ import annotations

import json
from typing import Any

from .db_client import get_connection_params

import psycopg2


def log_run_event(
    kind: str,
    *,
    ok: bool,
    detail: dict[str, Any] | None = None,
    client: str = "api",
) -> None:
    payload = json.dumps(detail or {}, ensure_ascii=False, default=str)
    try:
        conn = psycopg2.connect(**get_connection_params())
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.run_events (app_id, kind, client, ok, detail)
                    VALUES ('db-manager', %s, %s, %s, %s::jsonb)
                    """,
                    (kind[:80], client[:80], ok, payload),
                )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        return


def list_run_events(limit: int = 20) -> list[dict[str, Any]]:
    limit_n = max(1, min(int(limit or 20), 100))
    conn = psycopg2.connect(**get_connection_params())
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, kind, client, ok, detail, created_at
                FROM public.run_events
                WHERE app_id = 'db-manager'
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit_n,),
            )
            rows = []
            for r in cur.fetchall():
                created = r[5]
                rows.append(
                    {
                        "id": r[0],
                        "kind": r[1],
                        "client": r[2],
                        "ok": r[3],
                        "detail": r[4] if isinstance(r[4], dict) else {},
                        "created_at": created.isoformat() if created else None,
                    }
                )
            return rows
    finally:
        conn.close()
