"""Generate sample INSERT data matching table design column lengths."""

from __future__ import annotations

import re
from typing import Any

from .excel_parser import ColumnDef, TableDef
from .type_mapper import map_type

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_INSERT_HEAD = re.compile(
    r"INSERT\s+INTO\s+(?:(\w+)\.)?(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(",
    re.IGNORECASE,
)


def build_sample_data_sql(
    tables: list[TableDef],
    *,
    start_by_table: dict[str, int] | None = None,
) -> str:
    """Build combined sample INSERT script for all tables.

    Primary keys are numeric strings ("1", "2", …). When ``start_by_table``
    is provided (key: ``schema.table``), numbering continues from that value.
    """
    lines = [
        "-- Sample data script (aligned to table definition lengths)",
        "-- PK values are numeric strings (1, 2, …); apply step continues from DB max",
        "-- Connect to target database before running",
        "",
    ]
    starts = start_by_table or {}
    for table in sorted(tables, key=lambda t: t.name):
        key = table.name
        legacy_key = f"{table.schema}.{table.name}"
        start = int(starts.get(key, starts.get(legacy_key, 1)))
        rows = _sample_rows_for_table(table, start=start)
        if not rows:
            continue
        lines.append(f"-- Sample data: {table.name} (pk from {start})")
        col_names = [c.name for c in table.columns]
        for row in rows:
            ordered = {c: row.get(c) for c in col_names if c in row}
            cols = ", ".join(ordered.keys())
            vals = ", ".join(_format_value(v) for v in ordered.values())
            lines.append(
                f"INSERT INTO {table.name} ({cols}) VALUES ({vals});"
            )
        lines.append("")
    return "\n".join(lines)


def rewrite_sample_sql_with_next_pks(conn: Any, sql: str) -> tuple[str, dict[str, Any]]:
    """Rewrite INSERT PK literals to continue after each table's max numeric PK.

    Returns (rewritten_sql, allocation_info).
    """
    text = sql or ""
    allocations: dict[str, Any] = {}
    next_start: dict[str, int] = {}
    pk_cols_cache: dict[str, list[str]] = {}
    out: list[str] = []
    pos = 0

    while True:
        m = _INSERT_HEAD.search(text, pos)
        if not m:
            out.append(text[pos:])
            break

        out.append(text[pos : m.start()])
        schema, table = m.group(1), m.group(2)
        if schema and not _IDENT.match(schema):
            raise ValueError(f"Invalid schema identifier: {schema}")
        if not _IDENT.match(table):
            raise ValueError(f"Invalid table identifier: {table}")

        col_names = [c.strip() for c in m.group(3).split(",") if c.strip()]
        for c in col_names:
            if not _IDENT.match(c):
                raise ValueError(f"Invalid column identifier: {c}")

        values_start = m.end()
        values_end = _find_matching_paren(text, values_start - 1)
        if values_end < 0:
            raise ValueError(f"Unclosed VALUES for {schema}.{table}")

        values_inner = text[values_start:values_end]
        stmt_end = values_end + 1
        while stmt_end < len(text) and text[stmt_end].isspace():
            stmt_end += 1
        if stmt_end < len(text) and text[stmt_end] == ";":
            stmt_end += 1

        key = f"{schema}.{table}" if schema else table
        if key not in pk_cols_cache:
            if not schema:
                raise ValueError(
                    f"INSERT INTO {table} must be schema-qualified before apply"
                )
            pk_cols_cache[key] = _query_pk_columns(conn, schema, table)
            if pk_cols_cache[key]:
                next_start[key] = (
                    _query_max_numeric_pk(conn, schema, table, pk_cols_cache[key][0])
                    + 1
                )
            else:
                next_start[key] = 1

        pk_cols = pk_cols_cache[key]
        start_used = next_start.get(key, 1)
        values = _split_sql_values(values_inner)

        if len(values) != len(col_names):
            raise ValueError(
                f"Column/value count mismatch for {key}: "
                f"{len(col_names)} cols vs {len(values)} values"
            )

        if pk_cols:
            pk_col = pk_cols[0]
            if pk_col in col_names:
                idx = col_names.index(pk_col)
                n = next_start[key]
                values[idx] = _format_value(str(n))
                next_start[key] = n + 1
                info = allocations.setdefault(
                    key, {"from": start_used, "to": n, "count": 0}
                )
                info["to"] = n
                info["count"] = int(info["count"]) + 1

        insert_target = f"{schema}.{table}" if schema else table
        out.append(
            f"INSERT INTO {insert_target} ({', '.join(col_names)}) "
            f"VALUES ({', '.join(values)});"
        )
        pos = stmt_end

    return "".join(out), allocations


def _sample_rows_for_table(table: TableDef, *, start: int = 1) -> list[dict]:
    raw_rows: list[dict]
    if table.name == "cmt_faq":
        raw_rows = _faq_seed_rows()
    elif table.name == "cmt_site":
        raw_rows = _site_seed_rows()
    else:
        raw_rows = [_generic_seed_row(table)]

    fitted = [_fit_row_to_design(table, row) for row in raw_rows]
    return _assign_sequential_pks(table, fitted, start=start)


def _assign_sequential_pks(
    table: TableDef, rows: list[dict], *, start: int
) -> list[dict]:
    pk_cols = [c.name for c in table.columns if c.is_pk]
    if not pk_cols:
        return rows
    pk = pk_cols[0]
    for i, row in enumerate(rows):
        row[pk] = str(start + i)
    return rows


def _faq_seed_rows() -> list[dict]:
    """Seed values for cmt_faq — PK filled as 1, 2, 3 by _assign_sequential_pks."""
    base = {
        "pstg_yn": "Y",
        "rgtr_id": "admin",
        "reg_dt": "2026-01-15 09:00:00",
        "mdfr_id": "admin",
        "mdfcn_dt": "2026-01-15 09:00:00",
        "dltr_id": "admin",
        "del_dt": "2026-01-15 09:00:00",
        "del_yn": "N",
    }
    return [
        {
            "faq_id": "1",
            "faq_se": "GENERAL",
            "qstn_cn": "발전사업 인허가란 무엇인가요?",
            "ans_cn": "발전소 건설·운영에 필요한 법적 승인 절차입니다.",
            **base,
        },
        {
            "faq_id": "2",
            "faq_se": "TECH",
            "qstn_cn": "온라인 신청은 어떻게 하나요?",
            "ans_cn": "포털 가입 후 민원신청 메뉴에서 신청합니다.",
            **base,
        },
        {
            "faq_id": "3",
            "faq_se": "POLICY",
            "qstn_cn": "처리 기간은 얼마나 걸리나요?",
            "ans_cn": "사업 유형에 따라 보통 30~60일 소요됩니다.",
            **base,
        },
    ]


def _site_seed_rows() -> list[dict]:
    """Seed values for cmt_site — PK filled as 1, 2, 3 by _assign_sequential_pks."""
    base = {
        "pstg_yn": "Y",
        "rgtr_id": "admin",
        "reg_dt": "2026-01-15 09:00:00",
        "mdfr_id": "admin",
        "mdfcn_dt": "2026-01-15 09:00:00",
        "dltr_id": "admin",
        "del_dt": "2026-01-15 09:00:00",
        "del_yn": "N",
    }
    return [
        {
            "gebs_id": "1",
            "gebs_nm": "발전사업 통합인허가 포털",
            "gebs_url": "https://ex.go.kr",
            "gebs_expln": "인허가 통합관리 메인 포털",
            "sort_seq": 1,
            **base,
        },
        {
            "gebs_id": "2",
            "gebs_nm": "민원신청 안내",
            "gebs_url": "https://ex.go.kr/c",
            "gebs_expln": "민원 신청 및 처리 현황",
            "sort_seq": 2,
            **base,
        },
        {
            "gebs_id": "3",
            "gebs_nm": "정책자료실",
            "gebs_url": "https://ex.go.kr/p",
            "gebs_expln": "관련 법령 및 정책 자료",
            "sort_seq": 3,
            **base,
        },
    ]


def _generic_seed_row(table: TableDef) -> dict:
    row: dict = {}
    for col in table.columns:
        row[col.name] = _default_value_for_column(table, col)
    return row


def _default_value_for_column(table: TableDef, col: ColumnDef):
    name = col.name
    if col.is_pk:
        return "1"
    if "yn" in name:
        return "N"
    if name.endswith("_dt") or _is_timestamp_type(col):
        return "2026-01-15 09:00:00"
    if "seq" in name or _is_numeric_type(col):
        return 1
    if name.endswith("_id"):
        return _clip("sample", col.length)
    return _clip(f"s_{name}", col.length)


def _fit_row_to_design(table: TableDef, seed: dict) -> dict:
    """Keep only design columns; clip strings; fill NOT NULL gaps."""
    out: dict = {}
    for col in table.columns:
        if col.name in seed:
            val = seed[col.name]
        else:
            val = _default_value_for_column(table, col)

        if val is None:
            if col.not_null or col.is_pk:
                val = _default_value_for_column(table, col)
            else:
                out[col.name] = None
                continue

        if isinstance(val, str):
            if _is_timestamp_type(col):
                out[col.name] = val
            else:
                out[col.name] = _clip(val, col.length)
        else:
            out[col.name] = val
    return out


def _clip(value: str, length: int | None) -> str:
    if length is None or length <= 0:
        return value
    return value[:length]


def _is_timestamp_type(col: ColumnDef) -> bool:
    return map_type(col.data_type, col.length).startswith("TIMESTAMP")


def _is_numeric_type(col: ColumnDef) -> bool:
    pg = map_type(col.data_type, col.length)
    return pg.startswith(("INTEGER", "NUMERIC", "BIGINT", "SMALLINT"))


def _format_value(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def _query_pk_columns(conn: Any, schema: str, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a
              ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE i.indisprimary
              AND n.nspname = %s
              AND c.relname = %s
            ORDER BY array_position(i.indkey, a.attnum)
            """,
            (schema, table),
        )
        return [r[0] for r in cur.fetchall()]


def _query_max_numeric_pk(conn: Any, schema: str, table: str, pk_col: str) -> int:
    if not (
        _IDENT.match(schema) and _IDENT.match(table) and _IDENT.match(pk_col)
    ):
        raise ValueError("Invalid identifier for max PK query")
    sql = (
        f'SELECT COALESCE(MAX(({pk_col})::bigint), 0) '
        f'FROM "{schema}"."{table}" '
        f"WHERE ({pk_col})::text ~ '^[0-9]+$'"
    )
    with conn.cursor() as cur:
        cur.execute(sql)
        row = cur.fetchone()
        return int(row[0] or 0) if row else 0


def _find_matching_paren(text: str, open_idx: int) -> int:
    """Return index of ')' matching '(' at open_idx, respecting quotes."""
    if open_idx < 0 or open_idx >= len(text) or text[open_idx] != "(":
        return -1
    depth = 0
    in_str = False
    i = open_idx
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "'" and i + 1 < len(text) and text[i + 1] == "'":
                i += 2
                continue
            if ch == "'":
                in_str = False
            i += 1
            continue
        if ch == "'":
            in_str = True
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def _split_sql_values(values_inner: str) -> list[str]:
    parts: list[str] = []
    cur: list[str] = []
    in_str = False
    i = 0
    while i < len(values_inner):
        ch = values_inner[i]
        if in_str:
            if ch == "'" and i + 1 < len(values_inner) and values_inner[i + 1] == "'":
                cur.append("''")
                i += 2
                continue
            if ch == "'":
                in_str = False
            cur.append(ch)
            i += 1
            continue
        if ch == "'":
            in_str = True
            cur.append(ch)
            i += 1
            continue
        if ch == ",":
            parts.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    if cur or parts:
        parts.append("".join(cur).strip())
    return parts
