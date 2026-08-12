"""Read table schema from PostgreSQL (Supabase / DATABASE_URL)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import psycopg2

from .db_client import get_connection_params

# Supabase / Postgres system & managed schemas to hide from design export UI
EXCLUDED_SCHEMAS = frozenset(
    {
        "information_schema",
        "pg_catalog",
        "pg_toast",
        "pg_temp_1",
        "pg_toast_temp_1",
        "auth",
        "storage",
        "extensions",
        "graphql_public",
        "realtime",
        "supabase_functions",
        "supabase_migrations",
        "vault",
        "pgsodium",
        "pgsodium_masks",
        "cron",
        "net",
        "_realtime",
    }
)


@dataclass
class DbColumnInfo:
    schema: str
    table_name: str
    table_comment: str
    column_name: str
    column_comment: str
    pg_type: str
    max_length: int | None
    is_nullable: bool
    is_pk: bool
    ordinal: int


@dataclass
class DbTableInfo:
    schema: str
    name: str
    korean_name: str
    columns: list[DbColumnInfo] = field(default_factory=list)


def list_schemas(conn: Any | None = None) -> list[str]:
    """Return user schemas that contain at least one base table."""
    own = conn is None
    if own:
        conn = psycopg2.connect(**get_connection_params())
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT n.nspname
                FROM pg_namespace n
                WHERE n.nspname NOT LIKE 'pg_%%'
                  AND n.nspname <> 'information_schema'
                  AND EXISTS (
                    SELECT 1
                    FROM pg_class c
                    WHERE c.relnamespace = n.oid
                      AND c.relkind = 'r'
                  )
                ORDER BY n.nspname
                """
            )
            names = [r[0] for r in cur.fetchall()]
        return [n for n in names if n not in EXCLUDED_SCHEMAS]
    finally:
        if own:
            conn.close()


def list_tables(schema: str, conn: Any | None = None) -> list[dict[str, Any]]:
    """Return tables in schema with column counts."""
    schema = (schema or "").strip()
    if not schema:
        raise ValueError("schema is required")
    own = conn is None
    if own:
        conn = psycopg2.connect(**get_connection_params())
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.relname AS table_name,
                    COALESCE(
                        obj_description(c.oid, 'pg_class'),
                        c.relname
                    ) AS table_comment,
                    (
                        SELECT count(*)
                        FROM information_schema.columns ic
                        WHERE ic.table_schema = %s
                          AND ic.table_name = c.relname
                    ) AS column_count
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = %s
                  AND c.relkind = 'r'
                ORDER BY c.relname
                """,
                (schema, schema),
            )
            return [
                {
                    "name": r[0],
                    "korean_name": r[1] or r[0],
                    "columns": int(r[2] or 0),
                }
                for r in cur.fetchall()
            ]
    finally:
        if own:
            conn.close()


def read_schema(
    schema: str = "db1",
    *,
    table_names: list[str] | None = None,
    conn: Any | None = None,
) -> list[DbTableInfo]:
    """Read table/column definitions from PostgreSQL."""
    schema = (schema or "").strip()
    if not schema:
        raise ValueError("schema is required")

    own = conn is None
    if own:
        conn = psycopg2.connect(**get_connection_params())
    try:
        pk_map = _read_pk_columns(conn, schema)
        tables: dict[str, DbTableInfo] = {}
        wanted = {t.lower() for t in table_names} if table_names else None

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.table_schema,
                    c.table_name,
                    obj_description(
                        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
                    ) AS table_comment,
                    c.column_name,
                    col_description(
                        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
                        c.ordinal_position
                    ) AS column_comment,
                    c.data_type,
                    c.character_maximum_length,
                    c.is_nullable,
                    c.ordinal_position,
                    c.numeric_precision
                FROM information_schema.columns c
                WHERE c.table_schema = %s
                  AND c.table_catalog = current_database()
                ORDER BY c.table_name, c.ordinal_position
                """,
                (schema,),
            )
            for row in cur.fetchall():
                table_key = row[1].lower()
                if wanted is not None and table_key not in wanted:
                    continue
                if table_key not in tables:
                    tables[table_key] = DbTableInfo(
                        schema=row[0],
                        name=table_key,
                        korean_name=row[2] or table_key.upper(),
                    )
                col_name = row[3].lower()
                max_len = row[6]
                if max_len is None and row[5] == "numeric" and row[9] is not None:
                    max_len = int(row[9])
                tables[table_key].columns.append(
                    DbColumnInfo(
                        schema=row[0],
                        table_name=table_key,
                        table_comment=row[2] or "",
                        column_name=col_name,
                        column_comment=row[4] or col_name,
                        pg_type=row[5],
                        max_length=max_len,
                        is_nullable=row[7] == "YES",
                        is_pk=col_name in pk_map.get(table_key, set()),
                        ordinal=row[8],
                    )
                )
        return list(tables.values())
    finally:
        if own:
            conn.close()


def _read_pk_columns(conn: Any, schema: str) -> dict[str, set[str]]:
    pk_map: dict[str, set[str]] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = %s
            ORDER BY tc.table_name, kcu.ordinal_position
            """,
            (schema,),
        )
        for table_name, column_name in cur.fetchall():
            key = table_name.lower()
            pk_map.setdefault(key, set()).add(column_name.lower())
    return pk_map
