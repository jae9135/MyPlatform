"""Parse table definitions from Excel workbook (multiple template variants)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

import openpyxl

# Legacy fixed layout (excel_writer still uses these indices)
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
COL_FK = 12
COL_INDEX = 14
COL_COMMENT = 16
HEADER_ROW = 3
DATA_START_ROW = 4

DEFAULT_SHEET = "테이블정의서"
SHEET_HINTS = (
    "테이블정의서",
    "테이블 정의서",
    "테이블명세서",
    "테이블 목록",
)

INSTRUCTION_MARKERS = ("[작성", "작성 방법", "작성 사례", "입력 (*", "입력\n", "아래의")

LABEL_TO_FIELD: dict[str, str] = {
    "no": "no",
    "번호": "no",
    "db명": "db",
    "스키마명": "schema",
    "한글테이블명": "table_ko",
    "영문테이블명": "table_en",
    "한글컬럼명": "column_ko",
    "영문컬럼명": "column_en",
    "필드id": "column_en",
    "필드명": "column_ko",
    "데이터타입": "data_type",
    "type": "data_type",
    "데이터길이": "data_length",
    "길이": "data_length",
    "notnull여부": "not_null",
    "null여부": "nullable",
    "pk여부": "pk",
    "key": "key",
    "fk여부": "fk",
    "indexkey": "index",
    "코멘트": "comment",
    "비고": "comment",
    "디폴트값": "default",
    "기본값": "default",
}


@dataclass
class ColumnDef:
    name: str
    korean_name: str
    data_type: str
    length: int | None
    not_null: bool
    is_pk: bool
    comment: str | None = None
    is_fk: bool = False
    fk_ref: str | None = None
    index_key: str | None = None
    is_uk: bool = False
    default_value: str | None = None


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


@dataclass
class ParseMeta:
    sheet_name: str
    format: str  # flat | block
    tables: list[TableDef]


def parse_excel(
    source: Path | BinaryIO, sheet_name: str | None = DEFAULT_SHEET
) -> list[TableDef]:
    """Read table/column definitions from Excel and return grouped TableDef list."""
    return parse_excel_with_meta(source, sheet_name).tables


def parse_excel_with_meta(
    source: Path | BinaryIO, sheet_name: str | None = DEFAULT_SHEET
) -> ParseMeta:
    wb = openpyxl.load_workbook(source, data_only=True)
    resolved = resolve_sheet(wb, sheet_name)
    ws = wb[resolved]
    tables, fmt = _parse_worksheet(ws)
    wb.close()
    if not tables:
        raise ValueError(
            f"시트 '{resolved}'에서 테이블/컬럼 정의를 찾지 못했습니다. "
            "지원 양식: 목록형(테이블정의서) 또는 블록형(테이블 정의서/테이블명세서)."
        )
    return ParseMeta(sheet_name=resolved, format=fmt, tables=tables)


def resolve_sheet(wb, sheet_name: str | None) -> str:
    if sheet_name and str(sheet_name).strip():
        requested = str(sheet_name).strip()
        if requested in wb.sheetnames:
            return requested
        req_norm = normalize_label(requested)
        for name in wb.sheetnames:
            if normalize_label(name) == req_norm:
                return name

    best_name = ""
    best_score = 0
    for name in wb.sheetnames:
        score = _score_design_sheet(wb[name])
        if score > best_score:
            best_score = score
            best_name = name

    if best_score >= 4 and best_name:
        return best_name

    available = ", ".join(wb.sheetnames)
    if sheet_name and str(sheet_name).strip():
        raise ValueError(
            f"Sheet '{sheet_name}' not found. Available: {available}"
        )
    raise ValueError(
        f"테이블정의서 시트를 찾지 못했습니다. Available: {available}"
    )


def table_defs_to_dataframe_rows(tables: list[TableDef]) -> list[dict]:
    rows: list[dict] = []
    no = 1
    for table in tables:
        for col in table.columns:
            rows.append(
                {
                    "No": no,
                    "DB명": table.db_name.upper(),
                    "스키마명": table.schema,
                    "한글 테이블명": table.korean_name,
                    "영문 테이블명": table.name.upper(),
                    "한글 컬럼명": col.korean_name,
                    "영문 컬럼명": col.name.upper(),
                    "데이터 타입": col.data_type,
                    "데이터 길이": col.length,
                    "Not Null 여부": "Y" if col.not_null else "N",
                    "PK 여부": "Y" if col.is_pk else "N",
                }
            )
            no += 1
    return rows


def _parse_worksheet(ws) -> tuple[list[TableDef], str]:
    flat = _find_flat_header(ws)
    if flat:
        header_row, col_map = flat
        tables = _parse_flat(ws, header_row, col_map)
        if tables:
            return tables, "flat"

    tables = _parse_block(ws)
    if tables:
        return tables, "block"
    return [], "unknown"


def _find_flat_header(ws) -> tuple[int, dict[str, int]] | None:
    max_scan = min(25, ws.max_row or 0)
    for row in range(1, max_scan + 1):
        col_map = _map_header_row(ws, row)
        if {"table_en", "column_en"}.issubset(col_map.keys()):
            return row, col_map
    return None


def _parse_flat(ws, header_row: int, col_map: dict[str, int]) -> list[TableDef]:
    tables: dict[str, TableDef] = {}
    default_col = col_map.get("default")

    for row in range(header_row + 1, (ws.max_row or 0) + 1):
        table_name = _cell(ws, row, col_map.get("table_en", COL_TABLE_EN))
        column_name = _cell(ws, row, col_map.get("column_en", COL_COLUMN_EN))
        data_type = _cell(ws, row, col_map.get("data_type", COL_DATA_TYPE))

        if not table_name or not column_name:
            continue
        if _is_instruction_text(table_name) or _is_instruction_text(column_name):
            continue
        if normalize_label(data_type) in ("데이터타입", "type"):
            continue

        table_key = str(table_name).strip()
        if table_key not in tables:
            tables[table_key] = TableDef(
                db_name="dbm",
                schema="db1",
                name=table_key.lower(),
                korean_name=str(
                    _cell(ws, row, col_map.get("table_ko", COL_TABLE_KO)) or table_key
                ).strip(),
            )

        not_null_col = col_map.get("not_null")
        nullable_col = col_map.get("nullable")
        pk_col = col_map.get("pk")
        key_col = col_map.get("key")
        fk_col = col_map.get("fk")
        index_col = col_map.get("index", COL_INDEX)
        comment_col = col_map.get("comment", COL_COMMENT)

        not_null = False
        if nullable_col:
            not_null = _parse_not_null("nullable", _cell(ws, row, nullable_col))
        elif not_null_col:
            not_null = _parse_not_null("not_null", _cell(ws, row, not_null_col))

        pk_val = _cell(ws, row, pk_col) if pk_col else None
        key_val = _cell(ws, row, key_col) if key_col else None
        fk_val = _cell(ws, row, fk_col) if fk_col else None

        tables[table_key].columns.append(
            ColumnDef(
                name=str(column_name).strip().lower(),
                korean_name=str(
                    _cell(ws, row, col_map.get("column_ko", COL_COLUMN_KO)) or column_name
                ).strip(),
                data_type=str(data_type or "").strip(),
                length=_parse_length(
                    _cell(ws, row, col_map.get("data_length", COL_DATA_LENGTH))
                ),
                not_null=not_null or _parse_pk(key_val, pk_val),
                is_pk=_parse_pk(key_val, pk_val),
                comment=_optional_str(_cell(ws, row, comment_col)),
                is_fk=_is_fk(fk_val) or str(key_val or "").strip().upper() == "FK",
                fk_ref=_fk_ref(fk_val),
                index_key=_index_key(_cell(ws, row, index_col)),
                is_uk=_is_uk(_cell(ws, row, index_col)),
                default_value=_optional_str(_cell(ws, row, default_col))
                if default_col
                else None,
            )
        )

    return list(tables.values())


def _parse_block(ws) -> list[TableDef]:
    tables: dict[str, TableDef] = {}
    row = 1
    max_row = ws.max_row or 0

    while row <= max_row:
        if not _is_table_meta_row(ws, row):
            row += 1
            continue

        table_ko = _cell(ws, row, 3)
        table_en = _cell(ws, row, 6)
        if _is_instruction_text(table_ko) or _is_instruction_text(table_en):
            row += 1
            continue

        _read_module_name(ws, row)
        header_row = row + 1
        if header_row > max_row or not _is_block_column_header(ws, header_row):
            row += 1
            continue

        col_map = _map_header_row(ws, header_row)
        data_row = header_row + 1
        table_key = str(table_en).strip()
        if table_key not in tables:
            tables[table_key] = TableDef(
                db_name="dbm",
                schema="db1",
                name=table_key.lower(),
                korean_name=str(table_ko or table_key).strip(),
            )

        while data_row <= max_row:
            marker = str(_cell(ws, data_row, 1) or "").strip()
            if _is_table_meta_row(ws, data_row):
                break
            if marker in ("Index Key", "업무규칙", "테이블 정의서", "테이블정의서"):
                data_row += 1
                continue

            column_name = _cell(ws, data_row, col_map.get("column_en", 2))
            if not column_name or _is_instruction_text(column_name):
                data_row += 1
                continue

            column_ko = _cell(ws, data_row, col_map.get("column_ko", 4))
            data_type = _cell(ws, data_row, col_map.get("data_type", 5))
            if not data_type or _is_instruction_text(data_type):
                data_row += 1
                continue

            nullable_col = col_map.get("nullable")
            not_null_col = col_map.get("not_null")
            key_col = col_map.get("key")
            pk_col = col_map.get("pk")
            fk_col = col_map.get("fk")
            comment_col = col_map.get("comment")
            default_col = col_map.get("default")

            key_val = _cell(ws, data_row, key_col) if key_col else None
            pk_val = _cell(ws, data_row, pk_col) if pk_col else None
            fk_val = _cell(ws, data_row, fk_col) if fk_col else None

            not_null = False
            if nullable_col:
                not_null = _parse_not_null("nullable", _cell(ws, data_row, nullable_col))
            elif not_null_col:
                not_null = _parse_not_null(
                    "not_null", _cell(ws, data_row, not_null_col)
                )

            tables[table_key].columns.append(
                ColumnDef(
                    name=str(column_name).strip().lower(),
                    korean_name=str(column_ko or column_name).strip(),
                    data_type=str(data_type).strip(),
                    length=_parse_length(
                        _cell(ws, data_row, col_map.get("data_length", 6))
                    ),
                    not_null=not_null or _parse_pk(key_val, pk_val),
                    is_pk=_parse_pk(key_val, pk_val),
                    comment=_optional_str(
                        _cell(ws, data_row, comment_col) if comment_col else None
                    ),
                    is_fk=_is_fk(fk_val) or str(key_val or "").strip().upper() == "FK",
                    fk_ref=_fk_ref(fk_val),
                    index_key=None,
                    is_uk=False,
                    default_value=_optional_str(
                        _cell(ws, data_row, default_col) if default_col else None
                    ),
                )
            )
            data_row += 1

        row = data_row

    return list(tables.values())


def _score_design_sheet(ws) -> int:
    score = 0
    max_scan = min(30, ws.max_row or 0)
    for row in range(1, max_scan + 1):
        col_map = _map_header_row(ws, row)
        if {"table_en", "column_en"}.issubset(col_map.keys()):
            score += 6
        if "column_ko" in col_map and "data_type" in col_map:
            score += 2
        if _is_block_column_header(ws, row):
            score += 5
        if _is_table_meta_row(ws, row):
            score += 1
    name = normalize_label(ws.title)
    if "테이블정의서" in name or name in ("테이블정의서", "테이블명세서"):
        score += 3
    return score


def _map_header_row(ws, row: int) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for col in range(1, (ws.max_column or 0) + 1):
        label = normalize_label(ws.cell(row, col).value)
        if not label:
            continue
        field = LABEL_TO_FIELD.get(label)
        if field:
            mapping[field] = col
    return mapping


def _is_table_meta_row(ws, row: int) -> bool:
    c1 = normalize_label(_cell(ws, row, 1))
    c5 = normalize_label(_cell(ws, row, 5))
    return c1 == "테이블명" and c5 == "테이블id"


def _is_block_column_header(ws, row: int) -> bool:
    col_map = _map_header_row(ws, row)
    return "column_en" in col_map and "column_ko" in col_map and "data_type" in col_map


def _read_module_name(ws, table_meta_row: int) -> str | None:
    module_row = table_meta_row - 1
    if module_row < 1:
        return None
    if normalize_label(_cell(ws, module_row, 1)) != "모듈시스템명":
        return None
    value = _cell(ws, module_row, 3)
    if _is_instruction_text(value):
        return None
    return str(value).strip()


def normalize_label(value) -> str:
    text = str(value or "").replace("\n", " ").strip().lower()
    text = re.sub(r"\s+", "", text)
    text = text.replace("(", "").replace(")", "")
    return text


def _is_instruction_text(value) -> bool:
    text = str(value or "").strip()
    if not text:
        return True
    if len(text) > 100:
        return True
    return any(marker in text for marker in INSTRUCTION_MARKERS)


def _cell(ws, row: int, col: int | None):
    if not col:
        return None
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


def _parse_not_null(kind: str, value) -> bool:
    text = str(value or "").strip().upper()
    if not text or text in ("-", "NONE", "NULL"):
        return False
    if kind == "nullable":
        return text in ("N", "NO")
    return text == "Y"


def _parse_pk(key_val, pk_val) -> bool:
    if str(key_val or "").strip().upper() == "PK":
        return True
    return _is_yes(pk_val)


def _is_yes(value) -> bool:
    return str(value or "").strip().upper() == "Y"


def _optional_str(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _blankish(value) -> bool:
    text = str(value or "").strip().upper()
    return text in ("", "-", "N", "NONE", "NULL")


def _is_fk(value) -> bool:
    return not _blankish(value)


def _fk_ref(value) -> str | None:
    if _blankish(value):
        return None
    text = str(value).strip()
    if text.upper() in ("Y", "YES", "FK"):
        return None
    return text


def _index_key(value) -> str | None:
    if _blankish(value):
        return None
    text = str(value).strip()
    if text.upper().startswith("PK_"):
        return text
    return text


def _is_uk(value) -> bool:
    text = str(value or "").strip().upper()
    return text.startswith("UK") or "UNIQUE" in text


def _find_header_col(ws, names: tuple[str, ...]) -> int | None:
    lowered = tuple(n.lower() for n in names)
    for col in range(1, 24):
        label = str(ws.cell(HEADER_ROW, col).value or "").strip()
        if not label:
            continue
        if any(n in label.lower() for n in lowered):
            return col
    return None
