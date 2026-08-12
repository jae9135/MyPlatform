"""PostgreSQL connection for DBManager apply (Supabase / DATABASE_URL)."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import unquote, urlparse

import psycopg2


MAX_SQL_CHARS = 2_000_000


def is_db_configured() -> bool:
    if (os.getenv("DATABASE_URL") or "").strip():
        return True
    return bool(
        (os.getenv("POSTGRES_HOST") or "").strip()
        and (os.getenv("POSTGRES_USER") or "").strip()
    )


def _params_from_database_url(url: str) -> dict[str, Any]:
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ValueError("DATABASE_URL must be a postgres:// or postgresql:// URI")
    if not parsed.hostname or not parsed.username:
        raise ValueError("DATABASE_URL is missing host or user")
    dbname = (parsed.path or "").lstrip("/") or "postgres"
    return {
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "user": unquote(parsed.username),
        "password": unquote(parsed.password or ""),
        "dbname": dbname,
        "sslmode": "require",
    }


def get_connection_params() -> dict[str, Any]:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        return _params_from_database_url(url)
    host = (os.getenv("POSTGRES_HOST") or "").strip()
    user = (os.getenv("POSTGRES_USER") or "").strip()
    if not host or not user:
        raise ValueError(
            "DATABASE_URL 또는 POSTGRES_HOST/POSTGRES_USER 환경변수가 필요합니다."
        )
    return {
        "host": host,
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
        "user": user,
        "password": os.getenv("POSTGRES_PASSWORD", ""),
        "dbname": os.getenv("POSTGRES_DB", "postgres"),
        "sslmode": os.getenv("POSTGRES_SSLMODE", "require"),
    }


def masked_target(params: dict[str, Any] | None = None) -> str:
    cfg = params or get_connection_params()
    return f"{cfg['user']}@{cfg['host']}:{cfg['port']}/{cfg['dbname']}"


def test_connection(params: dict[str, Any] | None = None) -> tuple[bool, str]:
    try:
        cfg = params or get_connection_params()
        conn = psycopg2.connect(**cfg)
        conn.close()
        return True, f"Connected: {masked_target(cfg)}"
    except Exception as exc:
        return False, str(exc).strip()


def execute_sql(sql: str, *, autocommit: bool = False) -> None:
    text = (sql or "").strip()
    if not text:
        raise ValueError("SQL script is empty.")
    if len(text) > MAX_SQL_CHARS:
        raise ValueError(f"SQL too large (max {MAX_SQL_CHARS} characters).")

    cfg = get_connection_params()
    conn = psycopg2.connect(**cfg)
    conn.autocommit = autocommit
    try:
        with conn.cursor() as cur:
            cur.execute(text)
        if not autocommit:
            conn.commit()
    except Exception:
        if not autocommit:
            conn.rollback()
        raise
    finally:
        conn.close()


def execute_sample_sql_with_next_pks(sql: str) -> dict:
    """Rewrite sample INSERT PKs from DB max+1, then execute."""
    text = (sql or "").strip()
    if not text:
        raise ValueError("SQL script is empty.")
    if len(text) > MAX_SQL_CHARS:
        raise ValueError(f"SQL too large (max {MAX_SQL_CHARS} characters).")

    from .sample_data import rewrite_sample_sql_with_next_pks

    cfg = get_connection_params()
    conn = psycopg2.connect(**cfg)
    conn.autocommit = True
    try:
        rewritten, allocations = rewrite_sample_sql_with_next_pks(conn, text)
        with conn.cursor() as cur:
            cur.execute(rewritten)
        return allocations
    finally:
        conn.close()
