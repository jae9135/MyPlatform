"""Rewrite generated DDL/sample SQL to a user-selected schema."""

from __future__ import annotations

import re

from .schema_reader import assert_user_schema


def normalize_schema_list(schemas: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in schemas or []:
        name = (raw or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def normalize_table_names(names: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in names or []:
        name = (raw or "").strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def rewrite_sql_schema(
    sql: str,
    *,
    target_schema: str,
    source_schemas: list[str] | None = None,
    table_names: list[str] | None = None,
) -> str:
    """Qualify unqualified table refs and rewrite legacy schema prefixes."""
    text = (sql or "").strip()
    if not text:
        return text

    target = assert_user_schema(target_schema)
    tables = normalize_table_names(table_names)

    sources = normalize_schema_list(source_schemas)
    if not sources and tables:
        sources = _schemas_from_sql(text, tables)

    out = text
    for src in sorted(sources, key=len, reverse=True):
        if src.lower() == target.lower():
            continue
        out = out.replace(f"{src}.", f"{target}.")

    for table in sorted(tables, key=len, reverse=True):
        out = _replace_qualified_table(out, table, target)
        out = _qualify_unqualified_table(out, table, target)

    return out


def _schemas_from_sql(sql: str, table_names: list[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for table in table_names:
        pattern = re.compile(rf"(\S+)\.{re.escape(table)}\b", re.IGNORECASE)
        for match in pattern.finditer(sql):
            name = match.group(1)
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            found.append(name)
    return found


def _replace_qualified_table(sql: str, table: str, target: str) -> str:
    pattern = re.compile(rf"(\S+)\.{re.escape(table)}\b", re.IGNORECASE)

    def repl(match: re.Match[str]) -> str:
        src = match.group(1)
        if src.lower() == target.lower():
            return match.group(0)
        return f"{target}.{table}"

    return pattern.sub(repl, sql)


def _qualify_unqualified_table(sql: str, table: str, target: str) -> str:
    t = re.escape(table)
    patterns = [
        (rf"(CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS)\s+{t}\b", rf"\1 {target}.{table}"),
        (rf"(COMMENT\s+ON\s+TABLE)\s+{t}\b", rf"\1 {target}.{table}"),
        (
            rf"(COMMENT\s+ON\s+COLUMN)\s+{t}\.(\w+)\b",
            rf"\1 {target}.{table}.\2",
        ),
        (
            rf"(CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+\S+\s+ON)\s+{t}\b",
            rf"\1 {target}.{table}",
        ),
        (rf"(ALTER\s+TABLE)\s+{t}\b", rf"\1 {target}.{table}"),
        (rf"(INSERT\s+INTO)\s+{t}\b", rf"\1 {target}.{table}"),
        (rf"(REFERENCES)\s+{t}\b", rf"\1 {target}.{table}"),
    ]
    out = sql
    for pattern, repl in patterns:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    return out
