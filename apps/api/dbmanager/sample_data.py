"""Generate sample INSERT data matching table design column lengths."""

from __future__ import annotations

from .excel_parser import ColumnDef, TableDef
from .type_mapper import map_type


def build_sample_data_sql(tables: list[TableDef]) -> str:
    """Build combined sample INSERT script for all tables."""
    lines = [
        "-- Sample data script (aligned to table definition lengths)",
        "-- Connect to target database before running",
        "",
    ]
    for table in sorted(tables, key=lambda t: t.name):
        rows = _sample_rows_for_table(table)
        if not rows:
            continue
        lines.append(f"-- Sample data: {table.schema}.{table.name}")
        col_names = [c.name for c in table.columns]
        for row in rows:
            ordered = {c: row.get(c) for c in col_names if c in row}
            cols = ", ".join(ordered.keys())
            vals = ", ".join(_format_value(v) for v in ordered.values())
            lines.append(
                f"INSERT INTO {table.schema}.{table.name} ({cols}) VALUES ({vals});"
            )
        lines.append("")
    return "\n".join(lines)


def _sample_rows_for_table(table: TableDef) -> list[dict]:
    raw_rows: list[dict]
    if table.name == "cmt_faq":
        raw_rows = _faq_seed_rows()
    elif table.name == "cmt_site":
        raw_rows = _site_seed_rows()
    else:
        raw_rows = [_generic_seed_row(table)]

    return [_fit_row_to_design(table, row) for row in raw_rows]


def _faq_seed_rows() -> list[dict]:
    """Seed values for cmt_faq — kept short enough for VARCHAR(30) ids."""
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
            "faq_id": "FAQ001",
            "faq_se": "GENERAL",
            "qstn_cn": "발전사업 인허가란 무엇인가요?",
            "ans_cn": "발전소 건설·운영에 필요한 법적 승인 절차입니다.",
            **base,
        },
        {
            "faq_id": "FAQ002",
            "faq_se": "TECH",
            "qstn_cn": "온라인 신청은 어떻게 하나요?",
            "ans_cn": "포털 가입 후 민원신청 메뉴에서 신청합니다.",
            **base,
        },
        {
            "faq_id": "FAQ003",
            "faq_se": "POLICY",
            "qstn_cn": "처리 기간은 얼마나 걸리나요?",
            "ans_cn": "사업 유형에 따라 보통 30~60일 소요됩니다.",
            **base,
        },
    ]


def _site_seed_rows() -> list[dict]:
    """Seed values for cmt_site — URLs kept within common VARCHAR limits."""
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
            "gebs_id": "SITE001",
            "gebs_nm": "발전사업 통합인허가 포털",
            "gebs_url": "https://ex.go.kr",
            "gebs_expln": "인허가 통합관리 메인 포털",
            "sort_seq": 1,
            **base,
        },
        {
            "gebs_id": "SITE002",
            "gebs_nm": "민원신청 안내",
            "gebs_url": "https://ex.go.kr/c",
            "gebs_expln": "민원 신청 및 처리 현황",
            "sort_seq": 2,
            **base,
        },
        {
            "gebs_id": "SITE003",
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
        return _clip(f"{table.name[:20].upper()}_1", col.length)
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
