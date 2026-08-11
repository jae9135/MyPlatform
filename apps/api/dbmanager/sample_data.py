"""Generate sample INSERT data for tables."""

from .excel_parser import TableDef


def build_sample_data_sql(tables: list[TableDef]) -> str:
    """Build combined sample INSERT script for all tables."""
    lines = [
        "-- Sample data script",
        "-- Connect to target database before running",
        "",
    ]
    for table in sorted(tables, key=lambda t: t.name):
        rows = _sample_rows_for_table(table)
        if not rows:
            continue
        lines.append(f"-- Sample data: {table.schema}.{table.name}")
        for row in rows:
            cols = ", ".join(row.keys())
            vals = ", ".join(_format_value(v) for v in row.values())
            lines.append(f"INSERT INTO {table.schema}.{table.name} ({cols}) VALUES ({vals});")
        lines.append("")
    return "\n".join(lines)


def _sample_rows_for_table(table: TableDef) -> list[dict]:
    if table.name == "cmt_faq":
        return _faq_samples()
    if table.name == "cmt_site":
        return _site_samples()
    return _generic_samples(table)


def _faq_samples() -> list[dict]:
    base = {
        "pstg_yn": "Y",
        "rgtr_id": "admin",
        "reg_dt": "2026-01-15 09:00:00",
        "mdfr_id": None,
        "mdfcn_dt": None,
        "dltr_id": None,
        "del_dt": None,
        "del_yn": "N",
    }
    return [
        {
            "faq_id": "FAQ001",
            "faq_se": "GENERAL",
            "qstn_cn": "발전사업 인허가란 무엇인가요?",
            "ans_cn": "발전사업 인허가는 발전소 건설 및 운영을 위해 필요한 법적 승인 절차입니다.",
            **base,
        },
        {
            "faq_id": "FAQ002",
            "faq_se": "TECH",
            "qstn_cn": "온라인 신청은 어떻게 하나요?",
            "ans_cn": "통합 포털 회원가입 후 민원신청 메뉴에서 온라인으로 신청할 수 있습니다.",
            **base,
        },
        {
            "faq_id": "FAQ003",
            "faq_se": "POLICY",
            "qstn_cn": "처리 기간은 얼마나 걸리나요?",
            "ans_cn": "사업 유형에 따라 다르며, 일반적으로 30~60일 소요됩니다.",
            **base,
        },
    ]


def _site_samples() -> list[dict]:
    base = {
        "pstg_yn": "Y",
        "rgtr_id": "admin",
        "reg_dt": "2026-01-15 09:00:00",
        "mdfr_id": None,
        "mdfcn_dt": None,
        "dltr_id": None,
        "del_dt": None,
        "del_yn": "N",
    }
    return [
        {
            "gebs_id": "SITE001",
            "gebs_nm": "발전사업 통합인허가 포털",
            "gebs_url": "https://portal.example.go.kr",
            "gebs_expln": "발전사업 인허가 통합관리시스템 메인 포털",
            "sort_seq": 1,
            **base,
        },
        {
            "gebs_id": "SITE002",
            "gebs_nm": "민원신청 안내",
            "gebs_url": "https://portal.example.go.kr/civil",
            "gebs_expln": "민원 신청 및 처리 현황 조회",
            "sort_seq": 2,
            **base,
        },
        {
            "gebs_id": "SITE003",
            "gebs_nm": "정책자료실",
            "gebs_url": "https://portal.example.go.kr/policy",
            "gebs_expln": "발전사업 관련 법령 및 정책 자료",
            "sort_seq": 3,
            **base,
        },
    ]


def _generic_samples(table: TableDef) -> list[dict]:
    if not table.columns:
        return []
    row = {}
    for col in table.columns:
        if col.is_pk:
            row[col.name] = f"{table.name.upper()}_001"
        elif "yn" in col.name:
            row[col.name] = "N"
        elif col.name.endswith("_dt"):
            row[col.name] = "2026-01-15 09:00:00"
        elif col.name.endswith("_id"):
            row[col.name] = "sample"
        elif "seq" in col.name:
            row[col.name] = 1
        else:
            row[col.name] = f"sample_{col.name}"
    return [row]


def _format_value(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"
