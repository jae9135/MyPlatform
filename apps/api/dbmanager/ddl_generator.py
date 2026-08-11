"""Generate PostgreSQL DDL from table definitions."""

from pathlib import Path

from .excel_parser import TableDef
from .sample_data import build_sample_data_sql
from .type_mapper import map_type


def generate_all_ddl(tables: list[TableDef], output_dir: Path) -> list[Path]:
    """Write database, schema, and table SQL files. Returns created file paths."""
    output_dir.mkdir(parents=True, exist_ok=True)

    db_names = sorted({table.db_name for table in tables})
    schemas = sorted({table.schema for table in tables})

    db_file = output_dir / "00_database.sql"
    db_file.write_text(build_database_sql(db_names), encoding="utf-8")

    schema_file = output_dir / "01_schema.sql"
    schema_file.write_text(_build_schema_sql(schemas), encoding="utf-8")

    created = [db_file, schema_file]
    for table in sorted(tables, key=lambda t: t.name):
        table_file = output_dir / f"{table.name.upper()}.sql"
        table_file.write_text(build_table_ddl(table), encoding="utf-8")
        created.append(table_file)

    sample_file = output_dir / "99_sample_data.sql"
    sample_file.write_text(build_sample_data_sql(tables), encoding="utf-8")
    created.append(sample_file)

    return created


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


def _build_schema_sql(schemas: list[str]) -> str:
    lines = [
        "-- Schema creation script",
        "-- Connect to target database before running",
        "",
    ]
    for schema in schemas:
        lines.append(f"CREATE SCHEMA IF NOT EXISTS {schema};")
    lines.append("")
    return "\n".join(lines)


def build_table_ddl(table: TableDef) -> str:
    """Build CREATE TABLE + COMMENT statements for a single table."""
    lines = [
        f"-- Table: {table.schema}.{table.name}",
        f"-- Source: {table.korean_name}",
        "",
        f"CREATE TABLE IF NOT EXISTS {table.schema}.{table.name} (",
    ]

    column_lines = []
    for col in table.columns:
        pg_type = map_type(col.data_type, col.length)
        nullable = "NOT NULL" if col.not_null or col.is_pk else ""
        parts = [f"    {col.name}", pg_type, nullable]
        column_lines.append(" ".join(p for p in parts if p))

    pk_cols = table.pk_columns
    if pk_cols:
        pk_name = f"pk_{table.name}"
        pk_cols_str = ", ".join(pk_cols)
        column_lines.append(f"    CONSTRAINT {pk_name} PRIMARY KEY ({pk_cols_str})")

    lines.append(",\n".join(column_lines))
    lines.append(");")
    lines.append("")

    lines.append(f"COMMENT ON TABLE {table.schema}.{table.name} IS '{_escape(table.korean_name)}';")
    for col in table.columns:
        if col.korean_name:
            lines.append(
                f"COMMENT ON COLUMN {table.schema}.{table.name}.{col.name} "
                f"IS '{_escape(col.korean_name)}';"
            )

    lines.append("")
    return "\n".join(lines)


def scripts_by_category(scripts: list[dict]) -> dict:
    """Group script list into database, schema, table, and sample categories."""
    grouped = {"database": "", "schema": "", "tables": [], "sample": ""}
    for script in scripts:
        name = script["name"].lower()
        content = script["content"]
        if name.startswith("00_database"):
            grouped["database"] = content
        elif name.startswith("01_schema"):
            grouped["schema"] = content
        elif name.startswith("99_sample"):
            grouped["sample"] = content
        elif not name.startswith("00_") and not name.startswith("01_") and not name.startswith("99_"):
            grouped["tables"].append({"name": script["name"], "content": content})
    return grouped


def _escape(text: str) -> str:
    return text.replace("'", "''")
