"""Parse table definitions from Excel workbook."""

from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

import openpyxl


@dataclass
class ColumnDef:
    name: str
    korean_name: str
    data_type: str
    length: int | None
    not_null: bool
    is_pk: bool
    comment: str | None = None


@dataclass
class TableDef:
    db_name: str
    schema: str
    name: str
    korean_name: str
    columns: list[ColumnDef] = field(default_factory=list)

    @property
    def pk_columns(self) -> list[str]:
        return [col.name for col in self.columns if col.is_pk]


# Column indices in '테이블정의서' sheet (1-based)
COL_DB = 2
COL_SCHEMA = 3
COL_TABLE_KO = 4
COL_TABLE_EN = 5
COL_COLUMN_KO = 6
COL_COLUMN_EN = 7
COL_DATA_TYPE = 8
COL_DATA_LENGTH = 9
COL_NOT_NULL = 10
COL_PK = 11
HEADER_ROW = 3
DATA_START_ROW = 4


def parse_excel(source: Path | BinaryIO, sheet_name: str = "테이블정의서") -> list[TableDef]:
    """Read table/column definitions from Excel and return grouped TableDef list."""
    wb = openpyxl.load_workbook(source, data_only=True)
    if sheet_name not in wb.sheetnames:
        raise ValueError(f"Sheet '{sheet_name}' not found. Available: {wb.sheetnames}")

    ws = wb[sheet_name]
    tables: dict[str, TableDef] = {}

    for row in range(DATA_START_ROW, ws.max_row + 1):
        table_name = _cell(ws, row, COL_TABLE_EN)
        column_name = _cell(ws, row, COL_COLUMN_EN)
        data_type = _cell(ws, row, COL_DATA_TYPE)

        if not table_name or not column_name or data_type == "데이터 타입":
            continue

        table_key = str(table_name).strip()
        if table_key not in tables:
            tables[table_key] = TableDef(
                db_name=_normalize_identifier(_cell(ws, row, COL_DB) or "dbm"),
                schema=_normalize_identifier(_cell(ws, row, COL_SCHEMA) or "db1"),
                name=table_key.lower(),
                korean_name=str(_cell(ws, row, COL_TABLE_KO) or table_key).strip(),
            )

        tables[table_key].columns.append(
            ColumnDef(
                name=str(column_name).strip().lower(),
                korean_name=str(_cell(ws, row, COL_COLUMN_KO) or column_name).strip(),
                data_type=str(data_type).strip(),
                length=_parse_length(_cell(ws, row, COL_DATA_LENGTH)),
                not_null=_is_yes(_cell(ws, row, COL_NOT_NULL)),
                is_pk=_is_yes(_cell(ws, row, COL_PK)),
                comment=_optional_str(_cell(ws, row, 16)),
            )
        )

    wb.close()
    return list(tables.values())


def _cell(ws, row: int, col: int):
    return ws.cell(row, col).value


def _normalize_identifier(value: str) -> str:
    return str(value).strip().lower()


def _parse_length(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _is_yes(value) -> bool:
    return str(value or "").strip().upper() == "Y"


def _optional_str(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None
