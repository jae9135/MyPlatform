"""Oracle-style and PostgreSQL type mapping."""

import logging

logger = logging.getLogger(__name__)


def map_type(data_type: str, length) -> str:
    """Convert Excel data type to PostgreSQL type."""
    if not data_type or data_type == "데이터 타입":
        return "TEXT"

    dtype = str(data_type).strip().upper()
    length_val = _parse_length(length)

    if dtype == "VARCHAR2":
        return f"VARCHAR({length_val})" if length_val else "VARCHAR(255)"
    if dtype == "CHAR":
        return f"CHAR({length_val})" if length_val else "CHAR(1)"
    if dtype == "DATE":
        return "TIMESTAMP"
    if dtype == "NUMBER":
        if length_val and length_val <= 10:
            return "INTEGER"
        if length_val:
            return f"NUMERIC({length_val})"
        return "NUMERIC"
    if dtype in ("CLOB", "NCLOB"):
        return "TEXT"
    if dtype == "BLOB":
        return "BYTEA"

    logger.warning("Unknown data type '%s', falling back to TEXT", data_type)
    return "TEXT"


def map_pg_to_excel(pg_type: str, max_length: int | None) -> tuple[str, int | None]:
    """Return (excel_type, length) from PostgreSQL type info."""
    dtype = (pg_type or "").lower()

    if dtype in ("character varying", "varchar"):
        return "VARCHAR2", max_length or 255
    if dtype in ("character", "char"):
        return "CHAR", max_length or 1
    if dtype.startswith("timestamp") or dtype == "date":
        return "DATE", None
    if dtype in ("integer", "bigint", "smallint"):
        return "NUMBER", 10
    if dtype == "numeric":
        return "NUMBER", max_length
    if dtype == "text":
        return "VARCHAR2", 4000
    if dtype == "boolean":
        return "CHAR", 1
    return dtype.upper(), max_length


def _parse_length(length) -> int | None:
    if length is None:
        return None
    try:
        return int(length)
    except (TypeError, ValueError):
        return None
