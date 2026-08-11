"""Shared DDL generation for MyPlatform API (no Flask / dotenv)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from .ddl_generator import generate_all_ddl, scripts_by_category
from .excel_parser import parse_excel

DEFAULT_SHEET = "테이블정의서"


def generate_from_path(
    excel_path: Path | BinaryIO,
    sheet_name: str = DEFAULT_SHEET,
    output_dir: Path | None = None,
) -> dict:
    if output_dir is None:
        raise ValueError("output_dir is required")

    tables = parse_excel(excel_path, sheet_name)
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
    }


def generate_from_upload(
    file_bytes: bytes,
    sheet_name: str = DEFAULT_SHEET,
    output_dir: Path | None = None,
) -> dict:
    bio = BytesIO(file_bytes)
    return generate_from_path(bio, sheet_name, output_dir)
