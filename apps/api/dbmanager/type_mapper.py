"""Oracle-style and PostgreSQL type mapping."""

import logging
import re

logger = logging.getLogger(__name__)

_PACKED_TYPE = re.compile(
    r"^([A-Za-z][A-Za-z0-9_]*(?:\s+[A-Za-z][A-Za-z0-9_]*)*)\s*\(\s*([^)]+)\s*\)\s*$"
)
_LENGTH_SPEC = re.compile(r"^\d+(?:\s*,\s*\d+)?$")
_TYPES_WITHOUT_LENGTH = {
    "DATE",
    "DATETIME",
    "CLOB",
    "NCLOB",
    "BLOB",
    "TEXT",
    "BYTEA",
    "INTEGER",
    "INT",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
    "BOOLEAN",
    "BOOL",
    "JSON",
    "JSONB",
    "UUID",
    "SERIAL",
    "BIGSERIAL",
    "SMALLSERIAL",
    "REAL",
    "DOUBLE",
    "DOUBLE PRECISION",
    "MONEY",
    "XML",
    "LONG",
}


def format_declared_type(data_type: str, length) -> str:
    """Keep the modeled type (and length) as written, without PG remapping."""
    raw = str(data_type or "").strip()
    if not raw or raw == "데이터 타입":
        spec = _format_length_spec(length)
        return f"VARCHAR2({spec})" if spec else "VARCHAR2"

    packed = _PACKED_TYPE.match(raw)
    if packed:
        name = re.sub(r"\s+", " ", packed.group(1)).upper()
        return f"{name}({packed.group(2).strip()})"

    name = re.sub(r"\s+", " ", raw).upper()
    spec = _format_length_spec(length)
    if not spec or name in _TYPES_WITHOUT_LENGTH:
        return name
    return f"{name}({spec})"


def map_type(data_type: str, length) -> str:
    """Convert Excel data type to PostgreSQL type."""
    if not data_type or data_type == "데이터 타입":
        return "TEXT"

    dtype = str(data_type).strip().upper()
    packed = _PACKED_TYPE.match(dtype)
    if packed:
        dtype = packed.group(1).upper()
        if length in (None, ""):
            length = packed.group(2)
    length_val = _parse_length(length)
    length_spec = _format_length_spec(length)

    if dtype in ("VARCHAR2", "VARCHAR", "NVARCHAR2", "NVARCHAR", "CHARACTER VARYING"):
        return f"VARCHAR({length_spec})" if length_spec else "VARCHAR(255)"
    if dtype in ("CHAR", "NCHAR", "CHARACTER"):
        return f"CHAR({length_spec})" if length_spec else "CHAR(1)"
    if dtype == "DATE":
        return "TIMESTAMP"
    if dtype in ("NUMBER", "NUMERIC", "DECIMAL", "DEC"):
        if length_val and length_val <= 10 and (not length_spec or "," not in length_spec):
            return "INTEGER"
        if length_spec:
            return f"NUMERIC({length_spec})"
        return "NUMERIC"
    if dtype in ("INTEGER", "INT", "BIGINT", "SMALLINT"):
        return dtype if dtype != "INT" else "INTEGER"
    if dtype in ("CLOB", "NCLOB", "TEXT"):
        return "TEXT"
    if dtype == "BLOB":
        return "BYTEA"
    if dtype in ("TIMESTAMP", "TIMESTAMPTZ", "BOOLEAN", "BOOL", "UUID", "JSONB", "JSON"):
        return dtype

    logger.warning("Unknown data type '%s', falling back to TEXT", data_type)
    return "TEXT"


def map_pg_to_excel(pg_type: str, max_length: int | None) -> tuple[str, int | None]:
    """Return (excel_type, length) from PostgreSQL or Excel type info."""
    raw = (pg_type or "").strip()
    packed = re.match(r"^([A-Za-z][A-Za-z0-9_]+)\s*\(\s*(\d+)\s*\)\s*$", raw)
    if packed:
        name = packed.group(1).upper()
        length = int(packed.group(2))
        if name in ("VARCHAR", "CHARACTERVARYING"):
            name = "VARCHAR2"
        if name in ("NUMERIC", "INTEGER", "BIGINT", "SMALLINT"):
            name = "NUMBER"
        return name, length

    dtype = raw.lower()
    if dtype in ("character varying", "varchar", "varchar2"):
        return "VARCHAR2", max_length
    if dtype in ("character", "char"):
        return "CHAR", max_length
    if dtype.startswith("timestamp") or dtype == "date":
        return "DATE", None
    if dtype in ("integer", "bigint", "smallint"):
        return "NUMBER", max_length
    if dtype in ("numeric", "number"):
        return "NUMBER", max_length
    if dtype == "text":
        return "VARCHAR2", max_length
    if dtype == "boolean":
        return "CHAR", 1
    if raw:
        return raw.upper(), max_length
    return "VARCHAR2", max_length


def _format_length_spec(length) -> str | None:
    if length is None or length == "":
        return None
    text = str(length).strip()
    if not text:
        return None
    if _LENGTH_SPEC.match(text):
        return re.sub(r"\s+", "", text)
    parsed = _parse_length(length)
    return str(parsed) if parsed is not None else None


def _parse_length(length) -> int | None:
    if length is None:
        return None
    try:
        return int(float(str(length).strip().split(",", 1)[0]))
    except (TypeError, ValueError):
        return None
