"""Convert between ER model JSON and dbmanager TableDef / DbTableInfo."""

from __future__ import annotations

import re
from typing import Any

from dbmanager.ddl_generator import _parse_fk_ref
from dbmanager.excel_parser import ColumnDef, TableDef
from dbmanager.schema_reader import DbColumnInfo, DbTableInfo

_PACKED_TYPE = re.compile(r"^([A-Za-z][A-Za-z0-9_]+)\s*\(\s*(\d+)\s*\)\s*$")


def column_def_to_dict(col: ColumnDef) -> dict[str, Any]:
    return {
        "name": col.name,
        "koreanName": col.korean_name,
        "dataType": col.data_type,
        "length": col.length,
        "notNull": col.not_null,
        "isPk": col.is_pk,
        "isFk": col.is_fk,
        "fkRef": col.fk_ref,
        "comment": col.comment,
        "indexKey": col.index_key,
        "isUk": col.is_uk,
        "defaultValue": col.default_value,
    }


def table_def_to_dict(table: TableDef) -> dict[str, Any]:
    return {
        "id": table.name,
        "name": table.name,
        "koreanName": table.korean_name,
        "columns": [column_def_to_dict(c) for c in table.columns],
    }


def extract_relations(tables: list[TableDef]) -> list[dict[str, str]]:
    relations: list[dict[str, str]] = []
    seen: set[str] = set()
    for table in tables:
        for col in table.columns:
            if not col.is_fk:
                continue
            ref = _parse_fk_ref(col.fk_ref)
            if not ref:
                continue
            ref_table, ref_col = ref
            rel_id = f"{table.name}:{col.name}->{ref_table}:{ref_col}"
            if rel_id in seen:
                continue
            seen.add(rel_id)
            relations.append(
                {
                    "id": rel_id,
                    "fromTable": table.name,
                    "fromColumn": col.name,
                    "toTable": ref_table,
                    "toColumn": ref_col,
                    "cardinality": "1:0..N" if not col.not_null else "1:N",
                    "isIdentifying": col.is_pk and col.is_fk,
                }
            )
    return relations


def _split_type_length(data_type: str, length: Any) -> tuple[str, int | None]:
    raw = (data_type or "VARCHAR2").strip()
    packed = _PACKED_TYPE.match(raw)
    length_val: int | None
    try:
        if length is None or length == "":
            length_val = None
        else:
            length_val = int(float(length))
    except (TypeError, ValueError):
        length_val = None
    if packed:
        raw = packed.group(1)
        if length_val is None:
            length_val = int(packed.group(2))
    return raw, length_val


def table_defs_from_model(model: dict[str, Any]) -> list[TableDef]:
    db_name = (model.get("dbName") or "dbm").strip() or "dbm"
    schema = (model.get("schema") or "db1").strip() or "db1"
    tables: list[TableDef] = []

    for raw in model.get("tables") or []:
        columns: list[ColumnDef] = []
        for c in raw.get("columns") or []:
            data_type, length = _split_type_length(
                str(c.get("dataType") or "VARCHAR2"), c.get("length")
            )
            columns.append(
                ColumnDef(
                    name=(c.get("name") or "").strip().lower(),
                    korean_name=(c.get("koreanName") or "").strip(),
                    data_type=data_type,
                    length=length,
                    not_null=bool(c.get("notNull")),
                    is_pk=bool(c.get("isPk")),
                    comment=c.get("comment"),
                    is_fk=bool(c.get("isFk")),
                    fk_ref=c.get("fkRef"),
                    index_key=c.get("indexKey"),
                    is_uk=bool(c.get("isUk")),
                    default_value=c.get("defaultValue"),
                )
            )
        name = (raw.get("name") or raw.get("id") or "").strip().lower()
        if not name:
            continue
        tables.append(
            TableDef(
                db_name=db_name,
                schema=schema,
                name=name,
                korean_name=(raw.get("koreanName") or "").strip(),
                columns=columns,
            )
        )

    by_table = {t.name: t for t in tables}
    for raw in model.get("tables") or []:
        tid = (raw.get("id") or "").strip().lower()
        tname = (raw.get("name") or tid).strip().lower()
        if tid and tname and tid != tname and tname in by_table:
            by_table[tid] = by_table[tname]
    for rel in model.get("relations") or []:
        from_table = (rel.get("fromTable") or "").strip().lower()
        from_col = (rel.get("fromColumn") or "").strip().lower()
        to_table = (rel.get("toTable") or "").strip().lower()
        to_col = (rel.get("toColumn") or "").strip().lower()
        if not all([from_table, from_col, to_table, to_col]):
            continue
        table = by_table.get(from_table)
        if not table:
            continue
        fk_ref = f"{to_table}({to_col})"
        for col in table.columns:
            if col.name == from_col:
                col.is_fk = True
                col.fk_ref = fk_ref
                break

    return tables


def table_defs_to_db_tables(table_defs: list[TableDef]) -> list[DbTableInfo]:
    result: list[DbTableInfo] = []
    for table in table_defs:
        cols: list[DbColumnInfo] = []
        for i, col in enumerate(table.columns):
            pg_type, max_length = _split_type_length(col.data_type, col.length)
            cols.append(
                DbColumnInfo(
                    schema=table.schema,
                    table_name=table.name,
                    table_comment=table.korean_name,
                    column_name=col.name,
                    column_comment=col.comment or "",
                    pg_type=pg_type,
                    max_length=max_length,
                    is_nullable=not col.not_null and not col.is_pk,
                    is_pk=col.is_pk,
                    ordinal=i + 1,
                    korean_name=col.korean_name,
                    extra_comment="",
                    column_default=col.default_value,
                    is_fk=col.is_fk,
                    fk_ref=col.fk_ref,
                    index_key=col.index_key,
                    is_uk=col.is_uk,
                )
            )
        result.append(
            DbTableInfo(
                schema=table.schema,
                name=table.name,
                korean_name=table.korean_name,
                columns=cols,
            )
        )
    return result
