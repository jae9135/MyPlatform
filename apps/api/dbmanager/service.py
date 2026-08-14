"""Shared DDL generation for MyPlatform API (no Flask / dotenv)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from .ddl_generator import generate_all_ddl, scripts_by_category
from .excel_parser import DEFAULT_SHEET, parse_excel_with_meta


def validate_design_from_path(
    excel_path: Path | BinaryIO,
    sheet_name: str | None = DEFAULT_SHEET,
) -> dict:
    parsed = parse_excel_with_meta(excel_path, sheet_name)
    tables = parsed.tables
    if not tables:
        raise ValueError("Excel에서 테이블/컬럼 정의를 찾지 못했습니다.")

    total_columns = sum(len(t.columns) for t in tables)
    format_label = "목록형" if parsed.format == "flat" else "블록형"
    table_preview = [
        {
            "name": t.name,
            "korean_name": t.korean_name,
            "columns": len(t.columns),
        }
        for t in tables[:20]
    ]
    more_tables = max(0, len(tables) - len(table_preview))
    message = (
        f"DDL 생성 가능 — 시트 '{parsed.sheet_name}' ({format_label}), "
        f"테이블 {len(tables)}개 · 컬럼 {total_columns}개"
    )
    if more_tables:
        message += f" (외 {more_tables}개 테이블)"

    return {
        "ok": True,
        "can_generate": True,
        "message": message,
        "sheet": parsed.sheet_name,
        "design_format": parsed.format,
        "tables": len(tables),
        "columns": total_columns,
        "table_preview": table_preview,
        "more_tables": more_tables,
    }


def validate_design_from_upload(
    file_bytes: bytes,
    sheet_name: str | None = DEFAULT_SHEET,
) -> dict:
    return validate_design_from_path(BytesIO(file_bytes), sheet_name)


def generate_from_path(
    excel_path: Path | BinaryIO,
    sheet_name: str | None = DEFAULT_SHEET,
    output_dir: Path | None = None,
) -> dict:
    if output_dir is None:
        raise ValueError("output_dir is required")

    parsed = parse_excel_with_meta(excel_path, sheet_name)
    tables = parsed.tables
    if not tables:
        raise ValueError("Excel에서 테이블 정의를 찾지 못했습니다.")

    created = generate_all_ddl(tables, output_dir)
    scripts = [
        {"name": path.name, "content": path.read_text(encoding="utf-8")}
        for path in created
    ]
    grouped = scripts_by_category(scripts)
    return {
        "tables": [
            {
                "name": t.name,
                "korean_name": t.korean_name,
                "schema": t.schema,
                "db_name": t.db_name,
                "columns": len(t.columns),
            }
            for t in tables
        ],
        "scripts": scripts,
        "grouped": grouped,
        "db_name": tables[0].db_name if tables else "dbm",
        "sheet": parsed.sheet_name,
        "design_format": parsed.format,
    }


def generate_from_upload(
    file_bytes: bytes,
    sheet_name: str | None = DEFAULT_SHEET,
    output_dir: Path | None = None,
) -> dict:
    bio = BytesIO(file_bytes)
    return generate_from_path(bio, sheet_name, output_dir)
