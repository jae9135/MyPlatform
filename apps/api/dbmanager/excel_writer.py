"""Write DB schema back to Excel design document."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

import openpyxl

from .excel_parser import (
    COL_COLUMN_EN,
    COL_COLUMN_KO,
    COL_DATA_LENGTH,
    COL_DATA_TYPE,
    COL_DB,
    COL_NOT_NULL,
    COL_PK,
    COL_SCHEMA,
    COL_TABLE_EN,
    COL_TABLE_KO,
    DATA_START_ROW,
    HEADER_ROW,
)
from .schema_reader import DbTableInfo
from .type_mapper import map_pg_to_excel

SHEET_NAME = "테이블정의서"

HEADER_LABELS = [
    "No",
    "DB명",
    "스키마명",
    "한글 테이블명",
    "영문 테이블명",
    "한글 컬럼명",
    "영문 컬럼명",
    "데이터 타입",
    "데이터 길이",
    "Not Null 여부",
    "PK 여부",
    "FK 여부",
    "암호화여부",
    "Index Key",
    "개인정보",
    "코멘트",
]


def write_schema_to_excel_bytes(
    tables: list[DbTableInfo],
    *,
    db_name: str = "dbm",
    template: Path | BinaryIO | None = None,
    sheet_name: str = SHEET_NAME,
) -> bytes:
    """Build design workbook bytes from DB tables (optionally merge into template)."""
    if template is not None:
        wb = openpyxl.load_workbook(template)
    else:
        wb = _new_workbook(sheet_name)

    if sheet_name not in wb.sheetnames:
        raise ValueError(f"Sheet '{sheet_name}' not found. Available: {wb.sheetnames}")

    ws = wb[sheet_name]
    existing = _index_existing_rows(ws)
    next_no = _max_no(ws) + 1
    write_row = _find_append_row(ws)

    for table in sorted(tables, key=lambda t: t.name):
        for col in table.columns:
            key = (table.name.upper(), col.column_name.lower())
            excel_type, length = map_pg_to_excel(col.pg_type, col.max_length)

            if key in existing:
                row = existing[key]
            else:
                row = write_row
                write_row += 1
                existing[key] = row
                ws.cell(row, 1).value = next_no
                next_no += 1

            ws.cell(row, COL_DB).value = db_name.upper()
            ws.cell(row, COL_SCHEMA).value = table.schema.upper()
            ws.cell(row, COL_TABLE_KO).value = table.korean_name
            ws.cell(row, COL_TABLE_EN).value = table.name.upper()
            ws.cell(row, COL_COLUMN_KO).value = col.korean_name or col.column_name
            ws.cell(row, COL_COLUMN_EN).value = col.column_name.upper()
            ws.cell(row, COL_DATA_TYPE).value = excel_type
            ws.cell(row, COL_DATA_LENGTH).value = length
            ws.cell(row, COL_NOT_NULL).value = "N" if col.is_nullable else "Y"
            ws.cell(row, COL_PK).value = "Y" if col.is_pk else "N"
            ws.cell(row, 12).value = col.fk_ref or ("Y" if col.is_fk else "-")
            ws.cell(row, 13).value = "-"
            if col.is_pk:
                ws.cell(row, 14).value = (
                    f"PK_{table.name.upper()}({col.column_name.upper()})"
                )
            elif col.index_key:
                ws.cell(row, 14).value = col.index_key
            elif ws.cell(row, 14).value is None:
                ws.cell(row, 14).value = "-"
            ws.cell(row, 16).value = col.extra_comment or None

    buf = BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def default_export_filename(schema: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in schema) or "schema"
    return f"design_{safe}_{stamp}.xlsx"


def _new_workbook(sheet_name: str):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.cell(1, 1).value = "테이블정의서"
    for col, label in enumerate(HEADER_LABELS, start=1):
        ws.cell(HEADER_ROW, col).value = label
    return wb


def _index_existing_rows(ws) -> dict[tuple[str, str], int]:
    index: dict[tuple[str, str], int] = {}
    for row in range(DATA_START_ROW, ws.max_row + 1):
        table_name = ws.cell(row, COL_TABLE_EN).value
        column_name = ws.cell(row, COL_COLUMN_EN).value
        if table_name and column_name:
            index[
                (str(table_name).strip().upper(), str(column_name).strip().lower())
            ] = row
    return index


def _max_no(ws) -> int:
    max_no = 0
    for row in range(DATA_START_ROW, ws.max_row + 1):
        val = ws.cell(row, 1).value
        try:
            max_no = max(max_no, int(val))
        except (TypeError, ValueError):
            pass
    return max_no


def _find_append_row(ws) -> int:
    last = HEADER_ROW
    for row in range(DATA_START_ROW, ws.max_row + 2):
        if ws.cell(row, COL_TABLE_EN).value or ws.cell(row, COL_COLUMN_EN).value:
            last = row
    return last + 1
