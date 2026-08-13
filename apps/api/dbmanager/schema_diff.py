"""Compare Excel design vs live PostgreSQL schema and draft ALTER SQL."""

from __future__ import annotations

from .comments import encode_column_comment
from .ddl_generator import build_table_ddl
from .excel_parser import ColumnDef, TableDef
from .schema_reader import DbColumnInfo, DbTableInfo, assert_user_schema
from .type_mapper import map_type


def diff_design_to_db(
    design_tables: list[TableDef],
    db_tables: list[DbTableInfo],
) -> dict:
    """Return change list + safe/caution ALTER scripts. DROP is never generated."""
    db_by_key = {(t.schema.lower(), t.name.lower()): t for t in db_tables}
    design_keys = {(t.schema.lower(), t.name.lower()) for t in design_tables}

    changes: list[dict] = []
    safe_sql: list[str] = []
    caution_sql: list[str] = []

    for table in sorted(design_tables, key=lambda t: (t.schema, t.name)):
        schema = assert_user_schema(table.schema)
        key = (schema.lower(), table.name.lower())
        db_table = db_by_key.get(key)
        if db_table is None:
            ddl = build_table_ddl(table).strip()
            changes.append(
                {
                    "kind": "new_table",
                    "severity": "safe",
                    "schema": schema,
                    "table": table.name,
                    "column": None,
                    "detail": f"테이블 없음 → CREATE TABLE {schema}.{table.name}",
                }
            )
            safe_sql.append(ddl)
            continue

        db_cols = {c.column_name.lower(): c for c in db_table.columns}
        for col in table.columns:
            db_col = db_cols.get(col.name.lower())
            want_type = map_type(col.data_type, col.length)
            want_null = not (col.not_null or col.is_pk)
            if db_col is None:
                null_sql = "" if want_null else " NOT NULL"
                stmt = (
                    f'ALTER TABLE {schema}.{table.name} '
                    f'ADD COLUMN IF NOT EXISTS {col.name} {want_type}{null_sql};'
                )
                comment = ""
                if col.korean_name:
                    comment = (
                        f"COMMENT ON COLUMN {schema}.{table.name}.{col.name} "
                        f"IS '{_escape(col.korean_name)}';"
                    )
                severity = "caution" if not want_null else "safe"
                changes.append(
                    {
                        "kind": "add_column",
                        "severity": severity,
                        "schema": schema,
                        "table": table.name,
                        "column": col.name,
                        "detail": f"컬럼 추가 {col.name} {want_type}",
                    }
                )
                (caution_sql if severity == "caution" else safe_sql).append(stmt)
                if comment:
                    safe_sql.append(comment)
                continue

            have_type = _db_type_sql(db_col)
            if _norm_type(have_type) != _norm_type(want_type):
                stmt = (
                    f"ALTER TABLE {schema}.{table.name} "
                    f"ALTER COLUMN {col.name} TYPE {want_type};"
                )
                changes.append(
                    {
                        "kind": "type_change",
                        "severity": "caution",
                        "schema": schema,
                        "table": table.name,
                        "column": col.name,
                        "detail": f"타입 {have_type} → {want_type}",
                    }
                )
                caution_sql.append(stmt)

            have_null = db_col.is_nullable
            if have_null and not want_null:
                stmt = (
                    f"ALTER TABLE {schema}.{table.name} "
                    f"ALTER COLUMN {col.name} SET NOT NULL;"
                )
                changes.append(
                    {
                        "kind": "set_not_null",
                        "severity": "caution",
                        "schema": schema,
                        "table": table.name,
                        "column": col.name,
                        "detail": f"{col.name} NOT NULL 설정",
                    }
                )
                caution_sql.append(stmt)
            elif (not have_null) and want_null and not col.is_pk:
                stmt = (
                    f"ALTER TABLE {schema}.{table.name} "
                    f"ALTER COLUMN {col.name} DROP NOT NULL;"
                )
                changes.append(
                    {
                        "kind": "drop_not_null",
                        "severity": "caution",
                        "schema": schema,
                        "table": table.name,
                        "column": col.name,
                        "detail": f"{col.name} NULL 허용",
                    }
                )
                caution_sql.append(stmt)

                encoded = encode_column_comment(col.korean_name, col.comment)
                have_comment = (db_col.column_comment or "").strip()
                if encoded and encoded != have_comment:
                    stmt = (
                        f"COMMENT ON COLUMN {schema}.{table.name}.{col.name} "
                        f"IS '{_escape(encoded)}';"
                    )
                    changes.append(
                        {
                            "kind": "comment",
                            "severity": "safe",
                            "schema": schema,
                            "table": table.name,
                            "column": col.name,
                            "detail": f"코멘트/한글명 → {encoded}",
                        }
                    )
                    safe_sql.append(stmt)

        design_col_names = {c.name.lower() for c in table.columns}
        extra_db_cols = [
            d
            for d in db_table.columns
            if d.column_name.lower() not in design_col_names
        ]
        added = [
            c
            for c in table.columns
            if c.name.lower() not in {d.column_name.lower() for d in db_table.columns}
        ]
        used_extra: set[str] = set()
        for new_col in added:
            want_type = _norm_type(map_type(new_col.data_type, new_col.length))
            matches = [
                d
                for d in extra_db_cols
                if d.column_name.lower() not in used_extra
                and _norm_type(_db_type_sql(d)) == want_type
            ]
            if len(matches) != 1:
                continue
            old = matches[0]
            used_extra.add(old.column_name.lower())
            stmt = (
                f"ALTER TABLE {schema}.{table.name} "
                f"RENAME COLUMN {old.column_name} TO {new_col.name};"
            )
            changes.append(
                {
                    "kind": "rename_column",
                    "severity": "caution",
                    "schema": schema,
                    "table": table.name,
                    "column": f"{old.column_name}→{new_col.name}",
                    "detail": (
                        f"컬럼명 변경 추정 {old.column_name} → {new_col.name} "
                        f"(같은 타입)"
                    ),
                }
            )
            caution_sql.append(stmt)

        for db_col in extra_db_cols:
            if db_col.column_name.lower() in used_extra:
                continue
            changes.append(
                {
                    "kind": "extra_column",
                    "severity": "info",
                    "schema": schema,
                    "table": table.name,
                    "column": db_col.column_name,
                    "detail": "설계서에 없는 컬럼 (DROP 하지 않음)",
                }
            )
        renamed_new = {
            c["column"].split("→", 1)[1]
            for c in changes
            if c["kind"] == "rename_column"
            and c["table"] == table.name
            and "→" in (c.get("column") or "")
        }
        if renamed_new:
            changes[:] = [
                c
                for c in changes
                if not (
                    c["kind"] == "add_column"
                    and c["table"] == table.name
                    and c.get("column") in renamed_new
                )
            ]
            safe_sql[:] = [
                s
                for s in safe_sql
                if not any(
                    f"ADD COLUMN IF NOT EXISTS {name} " in s for name in renamed_new
                )
            ]
            caution_sql[:] = [
                s
                for s in caution_sql
                if not any(
                    f"ADD COLUMN IF NOT EXISTS {name} " in s for name in renamed_new
                )
            ]

    for key, db_table in sorted(db_by_key.items()):
        if key not in design_keys:
            changes.append(
                {
                    "kind": "extra_table",
                    "severity": "info",
                    "schema": db_table.schema,
                    "table": db_table.name,
                    "column": None,
                    "detail": "설계서에 없는 테이블 (DROP 하지 않음)",
                }
            )

    return {
        "changes": changes,
        "safe_sql": "\n".join(safe_sql).strip(),
        "caution_sql": "\n".join(caution_sql).strip(),
        "summary": {
            "new_tables": sum(1 for c in changes if c["kind"] == "new_table"),
            "add_columns": sum(1 for c in changes if c["kind"] == "add_column"),
            "type_changes": sum(1 for c in changes if c["kind"] == "type_change"),
            "extra_columns": sum(1 for c in changes if c["kind"] == "extra_column"),
            "extra_tables": sum(1 for c in changes if c["kind"] == "extra_table"),
            "rename_columns": sum(1 for c in changes if c["kind"] == "rename_column"),
            "safe_statements": len(safe_sql),
            "caution_statements": len(caution_sql),
        },
    }


def validate_alter_sql(sql: str, *, allow_caution: bool = False) -> str:
    """Allow only CREATE SCHEMA/TABLE, ALTER TABLE ADD/ALTER COLUMN, COMMENT ON."""
    text = (sql or "").strip()
    if not text:
        raise ValueError("SQL script is empty.")
    if "\\" in text:
        raise ValueError("SQL contains invalid characters.")

    chunks = _split_statements(text)
    if not chunks:
        raise ValueError("No SQL statements found.")

    allowed_prefixes = [
        "CREATE SCHEMA",
        "CREATE TABLE",
        "CREATE INDEX",
        "CREATE UNIQUE INDEX",
        "ALTER TABLE",
        "COMMENT ON",
    ]
    forbidden = (
        "DROP ",
        "TRUNCATE",
        "DELETE ",
        "INSERT ",
        "UPDATE ",
        "GRANT ",
        "REVOKE ",
        "ALTER DATABASE",
        "CREATE DATABASE",
        "CREATE USER",
        "ALTER USER",
        "CREATE ROLE",
    )
    caution_markers = (
        " ALTER COLUMN ",
        " TYPE ",
        " SET NOT NULL",
        " DROP NOT NULL",
        " RENAME COLUMN ",
    )

    for stmt in chunks:
        cleaned = _strip_line_comments(stmt)
        if not cleaned:
            continue
        upper = " ".join(cleaned.upper().split())
        if any(tok in upper for tok in forbidden):
            raise ValueError(f"Forbidden statement: {cleaned[:80]}")
        if not any(upper.startswith(p) for p in allowed_prefixes):
            raise ValueError(f"Statement not allowed: {cleaned[:80]}")
        if upper.startswith("ALTER TABLE"):
            if " ADD COLUMN" in upper:
                if " NOT NULL" in upper and not allow_caution:
                    raise ValueError(
                        "ADD COLUMN NOT NULL is caution-only. "
                        "Set include_caution=true to apply."
                    )
                continue
            if " ADD CONSTRAINT" in upper:
                continue
            if not allow_caution:
                raise ValueError(
                    "ALTER COLUMN / RENAME is caution-only. "
                    "Set include_caution=true to apply."
                )
            if not any(m in f" {upper} " for m in caution_markers):
                raise ValueError(f"Unsupported ALTER TABLE: {cleaned[:80]}")
    return text


def _db_type_sql(col: DbColumnInfo) -> str:
    dtype = (col.pg_type or "").lower()
    length = col.max_length
    if dtype in ("character varying", "varchar"):
        return f"VARCHAR({length or 255})"
    if dtype in ("character", "char"):
        return f"CHAR({length or 1})"
    if dtype.startswith("timestamp"):
        return "TIMESTAMP"
    if dtype == "date":
        return "TIMESTAMP"
    if dtype == "integer":
        return "INTEGER"
    if dtype == "bigint":
        return "BIGINT"
    if dtype == "smallint":
        return "SMALLINT"
    if dtype == "numeric":
        return f"NUMERIC({length})" if length else "NUMERIC"
    if dtype == "text":
        return "TEXT"
    if dtype == "boolean":
        return "CHAR(1)"
    if dtype == "bytea":
        return "BYTEA"
    return dtype.upper()


def _norm_type(value: str) -> str:
    return " ".join((value or "").upper().split())


def _escape(text: str) -> str:
    return text.replace("'", "''")


def _split_statements(sql: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    in_str = False
    i = 0
    while i < len(sql):
        ch = sql[i]
        if in_str:
            if ch == "'" and i + 1 < len(sql) and sql[i + 1] == "'":
                buf.append("''")
                i += 2
                continue
            if ch == "'":
                in_str = False
            buf.append(ch)
            i += 1
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
            i += 1
            continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                parts.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def _strip_line_comments(stmt: str) -> str:
    lines = [
        line
        for line in stmt.splitlines()
        if line.strip() and not line.strip().startswith("--")
    ]
    return "\n".join(lines).strip()
