"""Write DB schema back to Excel design document."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

import openpyxl

from .excel_parser import (
    HEADER_ROW,
    _cell,
    _find_flat_header,
    _is_block_column_header,
    _is_table_meta_row,
    _map_header_row,
    resolve_sheet,
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


@dataclass
class TemplateLayout:
    format: str  # flat | block
    sheet_name: str
    header_row: int | None
    col_map: dict[str, int]
    has_db: bool
    has_schema: bool
    has_module_row: bool = False


@dataclass
class FlatPrototype:
    preamble_rows: list[dict[int, object]]
    header_values: dict[int, object]
    header_row: int


@dataclass
class BlockIndexKeyFooter:
    label_col: int
    label: str
    value_col: int


@dataclass
class BlockPrototype:
    has_module_row: bool
    module_col1: object | None
    module_col3: object | None
    meta_col1: object | None
    meta_col5: object | None
    header_values: dict[int, object]
    col_map: dict[str, int]
    index_key_footer: BlockIndexKeyFooter | None = None


def write_schema_to_excel_bytes(
    tables: list[DbTableInfo],
    *,
    db_name: str = "dbm",
    schema_name: str = "db1",
    template: Path | BinaryIO | None = None,
    sheet_name: str | None = SHEET_NAME,
) -> bytes:
    """Build a fresh design workbook using DB tables and a template layout."""
    db_label = (db_name or "dbm").strip() or "dbm"
    schema_label = (schema_name or "db1").strip() or "db1"

    flat_proto: FlatPrototype | None = None
    block_proto: BlockPrototype | None = None

    if template is not None:
        layout, flat_proto, block_proto = _read_template_layout(template, sheet_name)
    else:
        wb_default = _new_workbook(sheet_name or SHEET_NAME)
        ws_default = wb_default[wb_default.sheetnames[0]]
        layout = TemplateLayout(
            format="flat",
            sheet_name=ws_default.title,
            header_row=HEADER_ROW,
            col_map=_map_header_row(ws_default, HEADER_ROW),
            has_db=True,
            has_schema=True,
        )
        flat_proto = FlatPrototype(
            preamble_rows=[{1: "테이블정의서"}],
            header_values={
                col: label for col, label in enumerate(HEADER_LABELS, start=1)
            },
            header_row=HEADER_ROW,
        )
        wb_default.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = _safe_sheet_title(layout.sheet_name)

    if layout.format == "block":
        if not block_proto:
            raise ValueError("블록형 양식 구조를 읽지 못했습니다.")
        _write_block_fresh(ws, layout, block_proto, tables, db_label, schema_label)
    else:
        if not flat_proto:
            raise ValueError("목록형 양식 구조를 읽지 못했습니다.")
        _write_flat_fresh(ws, layout, flat_proto, tables, db_label, schema_label)

    buf = BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def default_export_filename(schema: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in schema) or "schema"
    return f"design_{safe}_{stamp}.xlsx"


def _read_template_layout(
    template: Path | BinaryIO,
    sheet_name: str | None,
) -> tuple[TemplateLayout, FlatPrototype | None, BlockPrototype | None]:
    wb = openpyxl.load_workbook(template, data_only=True)
    try:
        layout = _analyze_workbook(wb, sheet_name)
        ws = wb[layout.sheet_name]
        if layout.format == "block":
            return layout, None, _read_block_prototype(ws, layout)
        return layout, _read_flat_prototype(ws, layout), None
    finally:
        wb.close()


def _analyze_workbook(wb, sheet_name: str | None) -> TemplateLayout:
    resolved = resolve_sheet(wb, sheet_name)
    ws = wb[resolved]
    flat = _find_flat_header(ws)
    if flat:
        header_row, col_map = flat
        return TemplateLayout(
            format="flat",
            sheet_name=resolved,
            header_row=header_row,
            col_map=col_map,
            has_db="db" in col_map,
            has_schema="schema" in col_map,
        )

    max_row = ws.max_row or 0
    for row in range(1, max_row + 1):
        if _is_block_column_header(ws, row):
            meta_row = row - 1
            has_module = (
                meta_row > 1
                and str(_cell(ws, meta_row - 1, 1) or "").strip().startswith("모듈")
            )
            col_map = _map_header_row(ws, row)
            return TemplateLayout(
                format="block",
                sheet_name=resolved,
                header_row=row,
                col_map=col_map,
                has_db="db" in col_map,
                has_schema="schema" in col_map,
                has_module_row=has_module,
            )
    raise ValueError(
        f"시트 '{resolved}'에서 테이블정의서 양식 헤더를 찾지 못했습니다."
    )


def _read_flat_prototype(ws, layout: TemplateLayout) -> FlatPrototype:
    header_row = layout.header_row or HEADER_ROW
    preamble_rows: list[dict[int, object]] = []
    for row in range(1, header_row):
        values: dict[int, object] = {}
        for col in range(1, (ws.max_column or 0) + 1):
            val = _cell(ws, row, col)
            if val is not None and str(val).strip():
                values[col] = val
        if values:
            preamble_rows.append(values)

    header_values: dict[int, object] = {}
    for col in range(1, (ws.max_column or 0) + 1):
        val = _cell(ws, header_row, col)
        if val is not None:
            header_values[col] = val

    return FlatPrototype(
        preamble_rows=preamble_rows,
        header_values=header_values,
        header_row=header_row,
    )


def _read_block_prototype(ws, layout: TemplateLayout) -> BlockPrototype:
    header_row = layout.header_row or 1
    meta_row = header_row - 1
    module_row = meta_row - 1 if layout.has_module_row else None

    header_values: dict[int, object] = {}
    for col in range(1, (ws.max_column or 0) + 1):
        val = _cell(ws, header_row, col)
        if val is not None:
            header_values[col] = val

    return BlockPrototype(
        has_module_row=layout.has_module_row,
        module_col1=_cell(ws, module_row, 1) if module_row else None,
        module_col3=_cell(ws, module_row, 3) if module_row else None,
        meta_col1=_cell(ws, meta_row, 1),
        meta_col5=_cell(ws, meta_row, 5),
        header_values=header_values,
        col_map=layout.col_map,
        index_key_footer=_read_block_index_key_footer(ws, header_row),
    )


def _read_block_index_key_footer(ws, header_row: int) -> BlockIndexKeyFooter | None:
    """Block templates may store Index Key in a footer row, not a header column."""
    max_row = ws.max_row or 0
    data_row = header_row + 1
    while data_row <= max_row:
        if _is_table_meta_row(ws, data_row):
            break
        marker = str(_cell(ws, data_row, 1) or "").strip()
        if marker == "Index Key":
            value_col = 3
            for col in range(2, (ws.max_column or 0) + 1):
                if _cell(ws, data_row, col) not in (None, ""):
                    value_col = col
                    break
            return BlockIndexKeyFooter(label_col=1, label=marker, value_col=value_col)
        if marker in ("업무규칙", "테이블 정의서", "테이블정의서"):
            break
        column_name = _cell(ws, data_row, 2)
        data_type = _cell(ws, data_row, 5)
        if column_name and data_type:
            data_row += 1
            continue
        data_row += 1
    return None


def _collect_table_index_keys(table: DbTableInfo) -> list[str]:
    seen: set[str] = set()
    lines: list[str] = []
    for col in table.columns:
        label = (col.index_key or "").strip()
        if not label or label in seen:
            continue
        seen.add(label)
        lines.append(label)
    return lines


def _write_flat_fresh(
    ws,
    layout: TemplateLayout,
    prototype: FlatPrototype,
    tables: list[DbTableInfo],
    db_name: str,
    schema_name: str,
) -> None:
    row = 1
    for preamble in prototype.preamble_rows:
        for col_idx, value in preamble.items():
            ws.cell(row, col_idx).value = value
        row += 1

    for col_idx, value in prototype.header_values.items():
        ws.cell(row, col_idx).value = value
    col_map = layout.col_map
    row += 1

    next_no = 1
    for table in sorted(tables, key=lambda t: t.name):
        for col in table.columns:
            excel_type, length = map_pg_to_excel(col.pg_type, col.max_length)
            if "no" in col_map:
                ws.cell(row, col_map["no"]).value = next_no
                next_no += 1
            _write_column_cells(
                ws,
                row,
                col_map,
                layout,
                table,
                col,
                db_name,
                schema_name,
                excel_type,
                length,
            )
            row += 1


def _write_block_fresh(
    ws,
    layout: TemplateLayout,
    prototype: BlockPrototype,
    tables: list[DbTableInfo],
    db_name: str,
    schema_name: str,
) -> None:
    row = 1
    for table in sorted(tables, key=lambda t: t.name):
        if prototype.has_module_row:
            if prototype.module_col1 is not None:
                ws.cell(row, 1).value = prototype.module_col1
            if prototype.module_col3 is not None:
                ws.cell(row, 3).value = prototype.module_col3
            row += 1

        if prototype.meta_col1 is not None:
            ws.cell(row, 1).value = prototype.meta_col1
        if prototype.meta_col5 is not None:
            ws.cell(row, 5).value = prototype.meta_col5
        ws.cell(row, 3).value = table.korean_name
        ws.cell(row, 6).value = table.name.upper()
        row += 1

        for col_idx, value in prototype.header_values.items():
            ws.cell(row, col_idx).value = value
        col_map = prototype.col_map
        row += 1

        row_no = 1
        for col in table.columns:
            excel_type, length = map_pg_to_excel(col.pg_type, col.max_length)
            if "no" in col_map:
                ws.cell(row, col_map["no"]).value = row_no
                row_no += 1
            _write_column_cells(
                ws,
                row,
                col_map,
                layout,
                table,
                col,
                db_name,
                schema_name,
                excel_type,
                length,
            )
            row += 1

        if prototype.index_key_footer:
            for index_label in _collect_table_index_keys(table):
                footer = prototype.index_key_footer
                ws.cell(row, footer.label_col).value = footer.label
                ws.cell(row, footer.value_col).value = index_label
                row += 1


def _write_column_cells(
    ws,
    row: int,
    col_map: dict[str, int],
    layout: TemplateLayout,
    table: DbTableInfo,
    col,
    db_name: str,
    schema_name: str,
    excel_type: str,
    length,
) -> None:
    if layout.has_db and "db" in col_map:
        ws.cell(row, col_map["db"]).value = db_name.upper()
    if layout.has_schema and "schema" in col_map:
        ws.cell(row, col_map["schema"]).value = schema_name

    if "table_ko" in col_map:
        ws.cell(row, col_map["table_ko"]).value = table.korean_name
    if "table_en" in col_map:
        ws.cell(row, col_map["table_en"]).value = table.name.upper()
    if "column_ko" in col_map:
        ws.cell(row, col_map["column_ko"]).value = col.korean_name or col.column_name
    if "column_en" in col_map:
        ws.cell(row, col_map["column_en"]).value = col.column_name.upper()
    if "data_type" in col_map:
        ws.cell(row, col_map["data_type"]).value = excel_type
    if "data_length" in col_map:
        ws.cell(row, col_map["data_length"]).value = length

    if "nullable" in col_map:
        ws.cell(row, col_map["nullable"]).value = "Y" if col.is_nullable else "N"
    elif "not_null" in col_map:
        ws.cell(row, col_map["not_null"]).value = "N" if col.is_nullable else "Y"

    if "pk" in col_map:
        ws.cell(row, col_map["pk"]).value = "Y" if col.is_pk else "N"
    if "key" in col_map:
        if col.is_pk:
            ws.cell(row, col_map["key"]).value = "PK"
        elif col.is_fk:
            ws.cell(row, col_map["key"]).value = "FK"

    if "fk" in col_map:
        ws.cell(row, col_map["fk"]).value = col.fk_ref or ("Y" if col.is_fk else "-")

    if "index" in col_map:
        if col.index_key:
            ws.cell(row, col_map["index"]).value = col.index_key
        else:
            ws.cell(row, col_map["index"]).value = "-"

    if "comment" in col_map:
        ws.cell(row, col_map["comment"]).value = col.extra_comment or None


def _new_workbook(sheet_name: str):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = _safe_sheet_title(sheet_name)
    ws.cell(1, 1).value = "테이블정의서"
    for col, label in enumerate(HEADER_LABELS, start=1):
        ws.cell(HEADER_ROW, col).value = label
    return wb


def _safe_sheet_title(name: str) -> str:
    text = (name or SHEET_NAME).strip() or SHEET_NAME
    return text[:31]


def inspect_template_layout(
    template: Path | BinaryIO,
    sheet_name: str | None = None,
) -> dict:
    """Return detected template format/columns for UI hints."""
    layout, _, _ = _read_template_layout(template, sheet_name)
    return {
        "format": layout.format,
        "sheet": layout.sheet_name,
        "has_db": layout.has_db,
        "has_schema": layout.has_schema,
    }
