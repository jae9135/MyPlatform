"""Read table schema from PostgreSQL (Supabase / DATABASE_URL)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import psycopg2

from .comments import decode_column_comment
from .db_client import get_connection_params

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

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

# Platform meta tables — query OK, write/ALTER blocked
PROTECTED_TABLES = frozenset(
    {
        ("public", "apps"),
        ("public", "sample_assets"),
        ("public", "run_events"),
    }
)


def assert_ident(name: str, label: str = "identifier") -> str:
    value = (name or "").strip()
    if not _IDENT.match(value):
        raise ValueError(f"Invalid {label}: {name!r}")
    return value


def assert_user_schema(schema: str) -> str:
    value = assert_ident(schema, "schema")
    if value in EXCLUDED_SCHEMAS or value.startswith("pg_"):
        raise ValueError(f"Schema is not available: {value}")
    return value


def assert_writable_table(schema: str, table: str) -> tuple[str, str]:
    schema_name = assert_user_schema(schema)
    table_name = assert_ident(table, "table")
    if (schema_name.lower(), table_name.lower()) in PROTECTED_TABLES:
        raise ValueError(
            f"Platform table {schema_name}.{table_name} cannot be modified here."
        )
    return schema_name, table_name


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
    korean_name: str = ""
    extra_comment: str = ""
    column_default: str | None = None
    is_fk: bool = False
    fk_ref: str | None = None
    index_key: str | None = None
    is_uk: bool = False


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
    schema = assert_user_schema(schema)
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
    schema = assert_user_schema(schema)

    own = conn is None
    if own:
        conn = psycopg2.connect(**get_connection_params())
    try:
        pk_map = _read_pk_columns(conn, schema)
        fk_map = _read_fk_columns(conn, schema)
        uk_map = _read_unique_columns(conn, schema)
        idx_map = _read_index_keys(conn, schema)
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
                    c.numeric_precision,
                    c.column_default
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
                korean, extra = decode_column_comment(row[4] or "")
                col_key = (table_key, col_name)
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
                        korean_name=korean or col_name,
                        extra_comment=extra,
                        column_default=_clean_default(row[10]),
                        is_fk=col_key in fk_map,
                        fk_ref=fk_map.get(col_key),
                        index_key=idx_map.get(col_key),
                        is_uk=col_name in uk_map.get(table_key, set()),
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


def _read_fk_columns(conn: Any, schema: str) -> dict[tuple[str, str], str]:
    result: dict[tuple[str, str], str] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                kcu.table_name,
                kcu.column_name,
                ccu.table_name,
                ccu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = %s
            """,
            (schema,),
        )
        for table_name, column_name, ref_table, ref_col in cur.fetchall():
            result[(table_name.lower(), column_name.lower())] = (
                f"{ref_table}({ref_col})"
            )
    return result


def _read_unique_columns(conn: Any, schema: str) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema = %s
            """,
            (schema,),
        )
        for table_name, column_name in cur.fetchall():
            result.setdefault(table_name.lower(), set()).add(column_name.lower())
    return result


def _read_index_keys(conn: Any, schema: str) -> dict[tuple[str, str], str]:
    result: dict[tuple[str, str], str] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT tablename, indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = %s
            """,
            (schema,),
        )
        for table_name, index_name, indexdef in cur.fetchall():
            name = (index_name or "").lower()
            if name.startswith("pk_"):
                continue
            cols = _index_cols_from_def(indexdef or "")
            for col in cols:
                key = (table_name.lower(), col.lower())
                label = f"{index_name}({','.join(c.upper() for c in cols)})"
                result.setdefault(key, label)
    return result


def _index_cols_from_def(indexdef: str) -> list[str]:
    if "(" not in indexdef or not indexdef.endswith(")"):
        return []
    inner = indexdef[indexdef.rfind("(") + 1 : -1]
    return [c.strip().strip('"') for c in inner.split(",") if c.strip()]


def _clean_default(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if "::" in text:
        text = text.split("::", 1)[0].strip()
    return text or None
