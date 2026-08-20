"""ER Modeler import/export service."""

from __future__ import annotations

import json
from io import BytesIO
from typing import Any, BinaryIO

from dbmanager.excel_parser import parse_excel_with_meta
from dbmanager.excel_writer import default_export_filename, write_schema_to_excel_bytes

from dbmanager.ddl_generator import scripts_by_category, scripts_from_tables

from .convert import (
    extract_relations,
    table_def_to_dict,
    table_defs_from_model,
    table_defs_to_db_tables,
)
from .sql_parser import parse_sql_script


def import_design_from_upload(
    file_bytes: bytes,
    sheet_name: str | None = None,
) -> dict[str, Any]:
    parsed = parse_excel_with_meta(BytesIO(file_bytes), sheet_name)
    tables = parsed.tables
    if not tables:
        raise ValueError("Excel에서 테이블/컬럼 정의를 찾지 못했습니다.")

    db_name = tables[0].db_name if tables else "dbm"
    schema = tables[0].schema if tables else "db1"
    table_dicts = [table_def_to_dict(t) for t in tables]
    relations = extract_relations(tables)

    return {
        "ok": True,
        "meta": {
            "sheet": parsed.sheet_name,
            "designFormat": parsed.format,
            "dbName": db_name,
            "schema": schema,
            "tables": len(tables),
            "columns": sum(len(t.columns) for t in tables),
            "relations": len(relations),
            "systemName": parsed.system_name or "",
            "createdDate": parsed.created_date or "",
            "author": parsed.author or "",
        },
        "tables": table_dicts,
        "relations": relations,
    }


def import_design_from_sql(
    sql: str,
    *,
    db_name: str | None = None,
    schema: str | None = None,
) -> dict[str, Any]:
    parsed = parse_sql_script(
        sql,
        db_name=(db_name or "dbm").strip() or "dbm",
        schema=(schema or "db1").strip() or "db1",
    )
    tables = parsed.tables
    table_dicts = [table_def_to_dict(t) for t in tables]
    relations = extract_relations(tables)

    return {
        "ok": True,
        "meta": {
            "sheet": "",
            "designFormat": "sql",
            "dbName": parsed.db_name,
            "schema": parsed.schema,
            "tables": len(tables),
            "columns": sum(len(t.columns) for t in tables),
            "relations": len(relations),
            "warnings": parsed.warnings,
        },
        "tables": table_dicts,
        "relations": relations,
    }


def export_model_to_excel_bytes(
    model: dict[str, Any],
    template_bytes: bytes,
    *,
    sheet_name: str | None = None,
) -> tuple[bytes, str]:
    if not template_bytes:
        raise ValueError("설계서 양식 Excel 파일(design)이 필요합니다.")

    table_defs = table_defs_from_model(model)
    if not table_defs:
        raise ValueError("내보낼 테이블이 없습니다.")

    db_name = (model.get("dbName") or "dbm").strip() or "dbm"
    schema = (model.get("schema") or "db1").strip() or "db1"
    system_name = (model.get("systemName") or "").strip()
    created_date = (model.get("createdDate") or "").strip()
    author = (model.get("author") or "").strip()
    db_tables = table_defs_to_db_tables(table_defs)

    data = write_schema_to_excel_bytes(
        db_tables,
        db_name=db_name,
        schema_name=schema,
        template=BytesIO(template_bytes),
        sheet_name=sheet_name or model.get("sheet"),
        system_name=system_name,
        created_date=created_date,
        author=author,
    )
    fname = default_export_filename(schema)
    return data, fname


def parse_model_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("model JSON is required")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid model JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("model must be a JSON object")
    return data


def generate_scripts_from_model(model: dict[str, Any]) -> dict[str, Any]:
    table_defs = table_defs_from_model(model)
    if not table_defs:
        raise ValueError("생성할 테이블이 없습니다.")

    scripts = scripts_from_tables(table_defs, declared_types=True)
    grouped = scripts_by_category(scripts)
    db_name = (model.get("dbName") or table_defs[0].db_name or "dbm").strip() or "dbm"
    schema = (model.get("schema") or table_defs[0].schema or "db1").strip() or "db1"

    return {
        "ok": True,
        "db_name": db_name,
        "schema": schema,
        "tables": [
            {
                "name": t.name,
                "korean_name": t.korean_name,
                "columns": len(t.columns),
            }
            for t in table_defs
        ],
        "scripts": scripts,
        "grouped": grouped,
    }
