"""Generate PostgreSQL DDL from table definitions."""

import re
from collections import defaultdict
from pathlib import Path

from .comments import encode_column_comment
from .excel_parser import TableDef
from .sample_data import build_sample_data_sql
from .type_mapper import format_declared_type, map_type

_CONSTRAINT_LINE = re.compile(r"^(PK|FK|UK|IX)_([^(]+)\(([^)]*)\)$", re.I)


def generate_all_ddl(tables: list[TableDef], output_dir: Path) -> list[Path]:
    """Write table + sample SQL files. Database/schema scripts are omitted."""
    output_dir.mkdir(parents=True, exist_ok=True)

    created: list[Path] = []
    for table in sorted(tables, key=lambda t: t.name):
        table_file = output_dir / f"{table.name.upper()}.sql"
        table_file.write_text(build_table_ddl(table), encoding="utf-8")
        created.append(table_file)

    sample_file = output_dir / "99_sample_data.sql"
    sample_file.write_text(build_sample_data_sql(tables), encoding="utf-8")
    created.append(sample_file)

    return created


def _qualify(schema: str | None, name: str) -> str:
    s = (schema or "").strip() or "db1"
    n = (name or "").strip()
    return f"{s}.{n}" if n else s


def _resolve_schema(table: TableDef, fallback: str | None = None) -> str:
    return (table.schema or fallback or "db1").strip() or "db1"


def build_database_sql(db_names: list[str]) -> str:
    lines = [
        "-- Database creation script",
        "-- Connect to 'postgres' database before running",
        "",
    ]
    for db_name in db_names:
        lines.extend([
            f"-- Database: {db_name}",
            f"CREATE DATABASE {db_name}",
            "    WITH ENCODING 'UTF8'",
            "         TEMPLATE template0;",
            "",
        ])
    return "\n".join(lines)


def build_schema_sql(schemas: list[str], *, db_name: str | None = None) -> str:
    lines = [
        "-- Schema creation script",
    ]
    if db_name:
        lines.append(f"-- Target database: {db_name}")
    lines.extend([
        "-- Connect to target database before running",
        "",
    ])
    for schema in schemas:
        lines.append(f"CREATE SCHEMA IF NOT EXISTS {schema};")
    lines.append("")
    return "\n".join(lines)


def _build_schema_sql(schemas: list[str]) -> str:
    return build_schema_sql(schemas)


def build_table_ddl(
    table: TableDef,
    *,
    declared_types: bool = False,
    schema: str | None = None,
) -> str:
    """Build CREATE TABLE + COMMENT + UK/FK/INDEX with schema-qualified names."""
    schema_name = _resolve_schema(table, schema)
    db_name = (table.db_name or "").strip() or "dbm"
    tname = table.name
    qtable = _qualify(schema_name, tname)
    lines = [
        f"-- Database: {db_name or '(default)'}",
        f"-- Schema: {schema_name}",
        f"-- Table: {tname}",
        f"-- Source: {table.korean_name}",
        "",
        f"CREATE TABLE IF NOT EXISTS {qtable} (",
    ]

    column_lines = []
    for col in table.columns:
        col_type = (
            format_declared_type(col.data_type, col.length)
            if declared_types
            else map_type(col.data_type, col.length)
        )
        nullable = "NOT NULL" if col.not_null or col.is_pk else ""
        default_sql = _default_sql(col.default_value)
        parts = [f"    {col.name}", col_type, nullable, default_sql]
        column_lines.append(" ".join(p for p in parts if p))

    pk_group = _pk_group(table)
    if pk_group:
        pk_name, pk_cols = pk_group
        pk_cols_str = ", ".join(pk_cols)
        column_lines.append(f"    CONSTRAINT {pk_name} PRIMARY KEY ({pk_cols_str})")

    for uk_name, uk_cols in _unique_groups(table).items():
        cols_sql = ", ".join(uk_cols)
        column_lines.append(f"    CONSTRAINT {uk_name} UNIQUE ({cols_sql})")

    lines.append(",\n".join(column_lines))
    lines.append(");")
    lines.append("")

    lines.append(
        f"COMMENT ON TABLE {qtable} "
        f"IS '{_escape(table.korean_name)}';"
    )
    for col in table.columns:
        encoded = encode_column_comment(col.korean_name, col.comment)
        if encoded:
            lines.append(
                f"COMMENT ON COLUMN {qtable}.{col.name} "
                f"IS '{_escape(encoded)}';"
            )

    for idx_name, idx_cols, unique in _index_groups(table):
        kind = "UNIQUE INDEX" if unique else "INDEX"
        cols_sql = ", ".join(idx_cols)
        lines.append(
            f"CREATE {kind} IF NOT EXISTS {idx_name} "
            f"ON {qtable} ({cols_sql});"
        )

    for col in table.columns:
        ref = _parse_fk_ref(col.fk_ref)
        if not ref:
            continue
        ref_table, ref_col = ref
        ref_qtable = _qualify(schema_name, ref_table)
        fk_name = _fk_constraint_name(col, table)
        lines.append(
            f"ALTER TABLE {qtable} "
            f"ADD CONSTRAINT {fk_name} "
            f"FOREIGN KEY ({col.name}) REFERENCES {ref_qtable} ({ref_col});"
        )

    lines.append("")
    return "\n".join(lines)


def _default_sql(value: str | None) -> str:
    if not value:
        return ""
    text = str(value).strip()
    if not text or text.upper() in ("-", "NULL"):
        return ""
    if text.upper() == "NULL":
        return "DEFAULT NULL"
    if (
        text[:1] in ("'", "(")
        or text.upper() in ("TRUE", "FALSE", "CURRENT_TIMESTAMP", "NOW()")
        or text.replace(".", "", 1).isdigit()
        or "(" in text
    ):
        return f"DEFAULT {text}"
    return f"DEFAULT '{_escape(text)}'"


def _parse_index_key_line(line: str) -> tuple[str, str, list[str]] | None:
    match = _CONSTRAINT_LINE.match(line.strip())
    if not match:
        return None
    kind = match.group(1).upper()
    name = match.group(2).strip()
    cols = [c.strip().lower() for c in match.group(3).split(",") if c.strip()]
    return kind, name, cols


def _pk_group(table: TableDef) -> tuple[str, list[str]] | None:
    pk_cols = table.pk_columns
    if not pk_cols:
        return None
    name = f"pk_{table.name}"
    for col in table.columns:
        key = (col.index_key or "").strip()
        if not key:
            continue
        parsed = _parse_index_key_line(key)
        if parsed and parsed[0] == "PK":
            name = _constraint_name(key, name)
            if parsed[2]:
                ordered = [c for c in parsed[2] if c in pk_cols]
                if ordered:
                    pk_cols = ordered
            break
    return name[:63], pk_cols


def _fk_constraint_name(col, table: TableDef) -> str:
    fallback = f"fk_{table.name}_{col.name}"
    key = (col.index_key or "").strip()
    if key:
        parsed = _parse_index_key_line(key)
        if parsed and parsed[0] == "FK":
            return _constraint_name(key, fallback)
        if key.upper().startswith("FK_"):
            return _constraint_name(key, fallback)
    return fallback[:63]


def _unique_groups(table: TableDef) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    for col in table.columns:
        if not col.is_uk:
            continue
        name = _constraint_name(col.index_key, f"uk_{table.name}_{col.name}")
        groups.setdefault(name, [])
        if col.name not in groups[name]:
            groups[name].append(col.name)
    return groups


def _index_groups(table: TableDef) -> list[tuple[str, list[str], bool]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    unique_names: set[str] = set()
    for col in table.columns:
        key = (col.index_key or "").strip()
        if not key:
            continue
        upper = key.upper()
        if upper.startswith("PK_") or upper.startswith("FK_"):
            continue
        name = _constraint_name(key, f"ix_{table.name}_{col.name}")
        if col.is_uk:
            unique_names.add(name)
            continue
        if col.name not in grouped[name]:
            grouped[name].append(col.name)
    return [(n, cols, n in unique_names) for n, cols in grouped.items() if cols]


def _constraint_name(index_key: str | None, fallback: str) -> str:
    text = (index_key or "").strip()
    if not text:
        return fallback[:63]
    name = text.split("(", 1)[0].strip().lower().replace(" ", "_")
    return (name or fallback)[:63]


def _parse_fk_ref(value: str | None) -> tuple[str, str] | None:
    text = (value or "").strip()
    if not text or "(" not in text or not text.endswith(")"):
        return None
    table, rest = text.rsplit("(", 1)
    col = rest[:-1].strip()
    table = table.strip()
    if "." in table:
        table = table.rsplit(".", 1)[-1]
    if not table or not col:
        return None
    return table.lower(), col.lower()


def build_all_tables_ddl(
    tables: list[TableDef],
    *,
    declared_types: bool = False,
    schema: str | None = None,
) -> str:
    schema_name = schema
    if not (schema_name or "").strip() and tables:
        schema_name = _resolve_schema(tables[0])
    parts = [
        build_table_ddl(table, declared_types=declared_types, schema=schema_name)
        for table in sorted(tables, key=lambda t: t.name)
    ]
    return "\n".join(parts)


def scripts_from_tables(
    tables: list[TableDef], *, declared_types: bool = False
) -> list[dict[str, str]]:
    if not tables:
        return []

    db_names = sorted(
        {(t.db_name or "dbm").strip() or "dbm" for t in tables}
    )
    schemas = sorted(
        {(t.schema or "db1").strip() or "db1" for t in tables}
    )
    primary_db = db_names[0] if db_names else "dbm"

    scripts: list[dict[str, str]] = [
        {
            "name": "00_database.sql",
            "content": build_database_sql(db_names),
        },
        {
            "name": "01_schema.sql",
            "content": build_schema_sql(schemas, db_name=primary_db),
        },
        {
            "name": "02_all_tables.sql",
            "content": build_all_tables_ddl(
                tables, declared_types=declared_types, schema=schemas[0]
            ),
        },
    ]
    for table in sorted(tables, key=lambda t: t.name):
        scripts.append(
            {
                "name": f"{table.name.upper()}.sql",
                "content": build_table_ddl(
                    table,
                    declared_types=declared_types,
                    schema=table.schema or schemas[0],
                ),
            }
        )
    return scripts


def scripts_by_category(scripts: list[dict]) -> dict:
    """Group script list into database, schema, table, and sample categories."""
    grouped = {"database": "", "schema": "", "all": "", "tables": [], "sample": ""}
    for script in scripts:
        name = script["name"].lower()
        content = script["content"]
        if name.startswith("00_database"):
            grouped["database"] = content
        elif name.startswith("01_schema"):
            grouped["schema"] = content
        elif name.startswith("99_sample"):
            grouped["sample"] = content
        elif name in ("00_all_tables.sql", "02_all_tables.sql"):
            grouped["all"] = content
        elif not name.startswith("00_") and not name.startswith("01_") and not name.startswith("99_"):
            grouped["tables"].append({"name": script["name"], "content": content})
    return grouped


def _escape(text: str) -> str:
    return text.replace("'", "''")
