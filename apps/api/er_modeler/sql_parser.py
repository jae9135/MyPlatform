"""Parse CREATE TABLE / ALTER / COMMENT / INDEX SQL into TableDef objects."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from dbmanager.comments import decode_column_comment
from dbmanager.excel_parser import ColumnDef, TableDef

_IDENT = r'(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)'
_IDENT_RE = re.compile(_IDENT)
_WS_RE = re.compile(r"\s+")

_TABLE_CONSTRAINT_START = (
    "CONSTRAINT",
    "PRIMARY",
    "UNIQUE",
    "FOREIGN",
    "CHECK",
    "INDEX",
    "KEY",
    "EXCLUDE",
)

_TYPE_STOP = {
    "NOT",
    "NULL",
    "DEFAULT",
    "PRIMARY",
    "UNIQUE",
    "REFERENCES",
    "CONSTRAINT",
    "CHECK",
    "COLLATE",
    "GENERATED",
    "IDENTITY",
    "AUTO_INCREMENT",
    "COMMENT",
    "ON",
    "UNSIGNED",
    "ZEROFILL",
}

_TYPE_MULTI = {
    ("CHARACTER", "VARYING"),
    ("CHARACTER", "SET"),
    ("DOUBLE", "PRECISION"),
    ("TIMESTAMP", "WITH"),
    ("TIMESTAMP", "WITHOUT"),
    ("TIME", "WITH"),
    ("TIME", "WITHOUT"),
    ("WITH", "TIME"),
    ("WITHOUT", "TIME"),
    ("TIME", "ZONE"),
    ("LONG", "RAW"),
    ("INTERVAL", "DAY"),
    ("INTERVAL", "YEAR"),
}


@dataclass
class ParsedSql:
    tables: list[TableDef]
    db_name: str
    schema: str
    warnings: list[str] = field(default_factory=list)


def parse_sql_script(
    sql: str,
    *,
    db_name: str = "dbm",
    schema: str = "db1",
) -> ParsedSql:
    text = (sql or "").strip()
    if not text:
        raise ValueError("SQL 스크립트가 비어 있습니다.")

    statements = split_sql_statements(text)
    tables: dict[str, TableDef] = {}
    pending_fk: list[tuple[str, list[str], str, list[str], str | None]] = []
    warnings: list[str] = []
    found_db = db_name.strip() or "dbm"
    found_schema = schema.strip() or "db1"
    header_korean: dict[str, str] = {}

    header_korean.update(_header_korean_names(text))

    for stmt in statements:
        kind = _statement_kind(stmt)
        if kind == "database":
            name = _parse_create_database(stmt)
            if name:
                found_db = name
        elif kind == "schema":
            name = _parse_create_schema(stmt)
            if name:
                found_schema = name
        elif kind == "create_table":
            table = _parse_create_table(stmt, found_db, found_schema)
            if table:
                if table.name in header_korean and not table.korean_name:
                    table.korean_name = header_korean[table.name]
                if table.name in tables:
                    _merge_table(tables[table.name], table)
                else:
                    tables[table.name] = table
                pending_fk.extend(table._pending_fk)  # type: ignore[attr-defined]
                del table._pending_fk  # type: ignore[attr-defined]
        elif kind == "alter":
            pending_fk.extend(
                _parse_alter_table(stmt, tables, found_db, found_schema)
            )
        elif kind == "comment":
            _parse_comment(stmt, tables)
        elif kind == "index":
            _parse_create_index(stmt, tables)

    for child, cols, parent, parent_cols, cname in pending_fk:
        table = tables.get(child)
        if not table:
            warnings.append(f"FK 대상 테이블을 찾지 못함: {child}")
            continue
        _apply_fk(table, cols, parent, parent_cols, cname)

    result = list(tables.values())
    if not result:
        raise ValueError("SQL에서 CREATE TABLE을 찾지 못했습니다.")

    for table in result:
        table.db_name = found_db
        table.schema = found_schema

    return ParsedSql(
        tables=result,
        db_name=found_db,
        schema=found_schema,
        warnings=warnings,
    )


def split_sql_statements(sql: str) -> list[str]:
    """Split SQL on ';' outside strings, comments, and dollar quotes."""
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""

        if ch == "-" and nxt == "-":
            i = sql.find("\n", i)
            if i < 0:
                break
            buf.append("\n")
            i += 1
            continue
        if ch == "/" and nxt == "*":
            end = sql.find("*/", i + 2)
            i = n if end < 0 else end + 2
            buf.append(" ")
            continue
        if ch == "'":
            chunk, i = _read_quote(sql, i, "'")
            buf.append(chunk)
            continue
        if ch == '"':
            chunk, i = _read_quote(sql, i, '"')
            buf.append(chunk)
            continue
        if ch == "`":
            chunk, i = _read_quote(sql, i, "`")
            buf.append(chunk)
            continue
        if ch == "$":
            dollar = _read_dollar(sql, i)
            if dollar:
                chunk, i = dollar
                buf.append(chunk)
                continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def _read_quote(sql: str, start: int, quote: str) -> tuple[str, int]:
    i = start + 1
    n = len(sql)
    out = [quote]
    while i < n:
        ch = sql[i]
        out.append(ch)
        if ch == quote:
            if quote == "'" and i + 1 < n and sql[i + 1] == "'":
                out.append(sql[i + 1])
                i += 2
                continue
            return "".join(out), i + 1
        if ch == "\\" and quote == "'":
            if i + 1 < n:
                out.append(sql[i + 1])
                i += 2
                continue
        i += 1
    return "".join(out), n


def _read_dollar(sql: str, start: int) -> tuple[str, int] | None:
    m = re.match(r"\$[A-Za-z_]*\$", sql[start:])
    if not m:
        return None
    tag = m.group(0)
    end = sql.find(tag, start + len(tag))
    if end < 0:
        return sql[start:], len(sql)
    stop = end + len(tag)
    return sql[start:stop], stop


def _statement_kind(stmt: str) -> str | None:
    head = _ws_collapse(stmt).upper()
    if head.startswith("CREATE DATABASE") or head.startswith("CREATE USER"):
        return "database"
    if head.startswith("CREATE SCHEMA"):
        return "schema"
    if head.startswith("CREATE TABLE"):
        return "create_table"
    if head.startswith("ALTER TABLE"):
        return "alter"
    if head.startswith("COMMENT ON"):
        return "comment"
    if head.startswith("CREATE UNIQUE INDEX") or head.startswith("CREATE INDEX"):
        return "index"
    return None


def _ws_collapse(text: str) -> str:
    return _WS_RE.sub(" ", text.strip())


def _parse_create_database(stmt: str) -> str | None:
    m = re.search(rf"CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?({_IDENT})", stmt, re.I)
    return _unquote_ident(m.group(1)) if m else None


def _parse_create_schema(stmt: str) -> str | None:
    m = re.search(rf"CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?({_IDENT})", stmt, re.I)
    return _unquote_ident(m.group(1)) if m else None


def _header_korean_names(sql: str) -> dict[str, str]:
    """Read `-- Table: name` / `-- Source: 한글` pairs from generator output."""
    names: dict[str, str] = {}
    current: str | None = None
    for line in sql.splitlines():
        stripped = line.strip()
        m_table = re.match(r"--\s*Table:\s*(\S+)", stripped, re.I)
        if m_table:
            current = _unquote_ident(m_table.group(1))
            continue
        m_src = re.match(r"--\s*Source:\s*(.+)$", stripped, re.I)
        if m_src and current:
            names[current] = m_src.group(1).strip()
            current = None
    return names


def _parse_create_table(stmt: str, db_name: str, schema: str) -> TableDef | None:
    m = re.search(
        rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?({_IDENT}(?:\s*\.\s*{_IDENT})?)\s*\(",
        stmt,
        re.I,
    )
    if not m:
        return None
    name = _unquote_ident(m.group(1))
    body, _ = _extract_paren_block(stmt, m.end() - 1)
    if body is None:
        return None

    table = TableDef(
        db_name=db_name,
        schema=schema,
        name=name,
        korean_name="",
        columns=[],
    )
    table._pending_fk = []  # type: ignore[attr-defined]

    for item in split_top_level(body):
        _parse_table_item(table, item)
    return table


def _parse_table_item(table: TableDef, item: str) -> None:
    raw = item.strip().rstrip(",")
    if not raw:
        return
    upper = raw.upper()
    if upper.startswith(_TABLE_CONSTRAINT_START):
        _parse_table_constraint(table, raw)
        return
    _parse_column_def(table, raw)


def _parse_column_def(table: TableDef, raw: str) -> None:
    ident, rest = _take_ident(raw)
    if not ident:
        return
    data_type, length, rest = _take_type(rest)
    col = ColumnDef(
        name=ident,
        korean_name="",
        data_type=data_type,
        length=length,
        not_null=False,
        is_pk=False,
    )
    while rest.strip():
        token, after = _take_word(rest)
        word = token.upper()
        if not word:
            break
        if word == "NOT":
            nxt, after2 = _take_word(after)
            if nxt.upper() == "NULL":
                col.not_null = True
                rest = after2
                continue
            rest = after
            continue
        if word == "NULL":
            rest = after
            continue
        if word == "DEFAULT":
            default_sql, rest = _take_default(after)
            col.default_value = default_sql
            continue
        if word == "PRIMARY":
            nxt, after2 = _take_word(after)
            if nxt.upper() == "KEY":
                col.is_pk = True
                col.not_null = True
                rest = after2
                continue
            rest = after
            continue
        if word == "UNIQUE":
            col.is_uk = True
            rest = after
            continue
        if word == "REFERENCES":
            ref_table, ref_cols, rest = _take_references(after)
            if ref_table:
                table._pending_fk.append(  # type: ignore[attr-defined]
                    (table.name, [col.name], ref_table, ref_cols or [col.name], None)
                )
            continue
        if word == "CONSTRAINT":
            _cname, after = _take_ident(after)
            rest = after
            continue
        if word == "COMMENT":
            comment_src = after
            nxt, after2 = _take_word(after)
            if nxt.upper() == "IS":
                comment_src = after2
            comment, rest = _take_string(comment_src)
            korean, extra = decode_column_comment(comment)
            col.korean_name = korean
            col.comment = extra or None
            continue
        if word in ("AUTO_INCREMENT", "UNSIGNED", "ZEROFILL"):
            rest = after
            continue
        if word in ("ON", "GENERATED", "IDENTITY", "CHECK", "COLLATE"):
            rest = _skip_to_next_flag(after if word != "ON" else rest)
            continue
        rest = after

    table.columns.append(col)


def _parse_table_constraint(table: TableDef, raw: str) -> None:
    rest = raw
    cname: str | None = None
    token, after = _take_word(rest)
    if token.upper() == "CONSTRAINT":
        cname, rest = _take_ident(after)
    else:
        rest = raw

    token, after = _take_word(rest)
    word = token.upper()
    if word == "PRIMARY":
        _, after = _take_word(after)  # KEY
        cols = _paren_idents(after)
        _apply_pk(table, cols, cname)
        return
    if word == "UNIQUE":
        nxt, after2 = _take_word(after)
        if nxt.upper() == "KEY":
            after = after2
        # UNIQUE [KEY] [name] (cols)  or UNIQUE (cols)
        maybe_name, after3 = _take_ident(after)
        if after3.lstrip().startswith("("):
            if maybe_name and not cname:
                cname = maybe_name
            after = after3
        cols = _paren_idents(after)
        _apply_unique(table, cols, cname)
        return
    if word == "FOREIGN":
        _, after = _take_word(after)  # KEY
        cols = _paren_idents(after)
        rest_after_cols = _after_first_paren(after)
        token2, after2 = _take_word(rest_after_cols)
        if token2.upper() == "REFERENCES":
            ref_table, ref_cols, _ = _take_references(after2)
            if ref_table:
                table._pending_fk.append(  # type: ignore[attr-defined]
                    (table.name, cols, ref_table, ref_cols or cols, cname)
                )
        return
    if word in ("KEY", "INDEX"):
        # MySQL KEY name (cols)
        iname, after = _take_ident(after)
        cols = _paren_idents(after)
        _apply_index(table, cols, iname or cname, unique=False)
        return


def _parse_alter_table(
    stmt: str,
    tables: dict[str, TableDef],
    db_name: str,
    schema: str,
) -> list[tuple[str, list[str], str, list[str], str | None]]:
    m = re.search(
        rf"ALTER\s+TABLE\s+(?:ONLY\s+)?({_IDENT}(?:\s*\.\s*{_IDENT})?)\s+(.*)$",
        stmt,
        re.I | re.S,
    )
    if not m:
        return []
    table_name = _unquote_ident(m.group(1))
    rest = m.group(2).strip()
    pending: list[tuple[str, list[str], str, list[str], str | None]] = []

    table = tables.get(table_name)
    if table is None:
        table = TableDef(
            db_name=db_name, schema=schema, name=table_name, korean_name="", columns=[]
        )
        tables[table_name] = table

    # Support multiple ADD clauses split at top-level commas only when they start ADD
    actions = _split_alter_actions(rest)
    for action in actions:
        pending.extend(_parse_alter_action(table, action))
    return pending


def _split_alter_actions(rest: str) -> list[str]:
    text = rest.strip()
    if text.upper().startswith("ADD"):
        # ALTER TABLE t ADD CONSTRAINT ... ;  (single action typically)
        return [text]
    return [text]


def _parse_alter_action(
    table: TableDef, action: str
) -> list[tuple[str, list[str], str, list[str], str | None]]:
    pending: list[tuple[str, list[str], str, list[str], str | None]] = []
    text = action.strip()
    if text.upper().startswith("ADD"):
        text = text[3:].strip()
        if text.startswith("(") and text.endswith(")"):
            text = text[1:-1].strip()
        if text.upper().startswith("COLUMN"):
            text = text[6:].strip()
            if text:
                _parse_column_def(table, text)
            return pending
        # ADD CONSTRAINT ... or ADD PRIMARY KEY ... or ADD FOREIGN KEY
        fake = TableDef(
            db_name=table.db_name,
            schema=table.schema,
            name=table.name,
            korean_name="",
            columns=table.columns,
        )
        fake._pending_fk = []  # type: ignore[attr-defined]
        if text.upper().startswith(_TABLE_CONSTRAINT_START) or text.upper().startswith(
            "CONSTRAINT"
        ):
            _parse_table_constraint(fake, text)
        else:
            # ADD col def (MySQL/Oracle)
            _parse_column_def(table, text)
            return pending
        pending.extend(fake._pending_fk)  # type: ignore[attr-defined]
        return pending
    return pending


def _parse_comment(stmt: str, tables: dict[str, TableDef]) -> None:
    m_table = re.search(
        rf"COMMENT\s+ON\s+TABLE\s+({_IDENT}(?:\s*\.\s*{_IDENT})?)\s+IS\s+",
        stmt,
        re.I,
    )
    if m_table:
        name = _unquote_ident(m_table.group(1))
        comment, _ = _take_string(stmt[m_table.end() :])
        table = tables.get(name)
        if table is not None:
            table.korean_name = comment
        return

    m_col = re.search(
        rf"COMMENT\s+ON\s+COLUMN\s+({_IDENT}(?:\s*\.\s*{_IDENT})?)\s*\.\s*({_IDENT})\s+IS\s+",
        stmt,
        re.I,
    )
    if not m_col:
        return
    table_name = _unquote_ident(m_col.group(1))
    col_name = _unquote_ident(m_col.group(2))
    comment, _ = _take_string(stmt[m_col.end() :])
    table = tables.get(table_name)
    if not table:
        return
    korean, extra = decode_column_comment(comment)
    for col in table.columns:
        if col.name == col_name:
            col.korean_name = korean
            col.comment = extra or None
            break


def _parse_create_index(stmt: str, tables: dict[str, TableDef]) -> None:
    unique = bool(re.match(r"CREATE\s+UNIQUE\s+INDEX", stmt, re.I))
    m = re.search(
        rf"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?({_IDENT})\s+ON\s+({_IDENT}(?:\s*\.\s*{_IDENT})?)\s*\(",
        stmt,
        re.I,
    )
    if not m:
        return
    iname = _unquote_ident(m.group(1))
    table_name = _unquote_ident(m.group(2))
    body, _ = _extract_paren_block(stmt, m.end() - 1)
    cols = [_unquote_ident(p) for p in split_top_level(body or "") if _unquote_ident(p)]
    table = tables.get(table_name)
    if table:
        _apply_index(table, cols, iname, unique=unique)


def _apply_pk(table: TableDef, cols: list[str], cname: str | None) -> None:
    names = set(cols)
    for col in table.columns:
        if col.name in names:
            col.is_pk = True
            col.not_null = True
    if cols:
        key = f"PK_{cname or f'pk_{table.name}'}({', '.join(cols)})"
        _set_index_key(table, cols[0], key)


def _apply_unique(table: TableDef, cols: list[str], cname: str | None) -> None:
    names = set(cols)
    for col in table.columns:
        if col.name in names:
            col.is_uk = True
    if cols:
        key = f"UK_{cname or f'uk_{table.name}_{cols[0]}'}({', '.join(cols)})"
        _set_index_key(table, cols[0], key)


def _apply_index(
    table: TableDef, cols: list[str], cname: str | None, *, unique: bool
) -> None:
    if unique:
        _apply_unique(table, cols, cname)
        return
    if cols:
        key = f"IX_{cname or f'ix_{table.name}_{cols[0]}'}({', '.join(cols)})"
        _set_index_key(table, cols[0], key)


def _apply_fk(
    table: TableDef,
    cols: list[str],
    parent: str,
    parent_cols: list[str],
    cname: str | None,
) -> None:
    if not cols:
        return
    parent_cols = parent_cols or cols
    for i, col_name in enumerate(cols):
        ref_col = parent_cols[i] if i < len(parent_cols) else parent_cols[-1]
        for col in table.columns:
            if col.name != col_name:
                continue
            col.is_fk = True
            col.fk_ref = f"{parent}({ref_col})"
            key = f"FK_{cname or f'fk_{table.name}_{col_name}'}({col_name})"
            if not col.index_key:
                col.index_key = key
            break
        else:
            # FK column missing from CREATE TABLE (shouldn't happen often)
            table.columns.append(
                ColumnDef(
                    name=col_name,
                    korean_name="",
                    data_type="NUMBER",
                    length=10,
                    not_null=False,
                    is_pk=False,
                    is_fk=True,
                    fk_ref=f"{parent}({ref_col})",
                    index_key=f"FK_{cname or f'fk_{table.name}_{col_name}'}({col_name})",
                )
            )


def _set_index_key(table: TableDef, col_name: str, key: str) -> None:
    for col in table.columns:
        if col.name == col_name:
            if not col.index_key:
                col.index_key = key
            return


def _merge_table(dest: TableDef, src: TableDef) -> None:
    have = {c.name for c in dest.columns}
    for col in src.columns:
        if col.name not in have:
            dest.columns.append(col)
            have.add(col.name)
    if src.korean_name and not dest.korean_name:
        dest.korean_name = src.korean_name


def _unquote_ident(token: str) -> str:
    text = (token or "").strip()
    if "." in text and not (
        (text.startswith('"') and text.endswith('"'))
        or (text.startswith("`") and text.endswith("`"))
        or (text.startswith("[") and text.endswith("]"))
    ):
        text = text.rsplit(".", 1)[-1].strip()
    if len(text) >= 2 and (
        (text[0] == '"' and text[-1] == '"')
        or (text[0] == "`" and text[-1] == "`")
        or (text[0] == "[" and text[-1] == "]")
    ):
        inner = text[1:-1]
        if text[0] == '"':
            inner = inner.replace('""', '"')
        text = inner
    return text.strip().lower()


def _take_ident(text: str) -> tuple[str | None, str]:
    s = text.lstrip()
    m = _IDENT_RE.match(s)
    if not m:
        return None, text
    raw = m.group(0)
    rest = s[m.end() :]
    if rest.lstrip().startswith("."):
        rest2 = rest.lstrip()[1:]
        ident2, rest3 = _take_ident(rest2)
        if ident2:
            return _unquote_ident(raw + "." + ident2), rest3
    return _unquote_ident(raw), rest


def _take_word(text: str) -> tuple[str, str]:
    s = text.lstrip()
    m = re.match(r"[A-Za-z_][\w$]*", s)
    if not m:
        return "", text
    return m.group(0), s[m.end() :]


def _take_type(text: str) -> tuple[str, int | None, str]:
    s = text.lstrip()
    parts: list[str] = []
    rest = s
    while True:
        word, after = _take_word(rest)
        if not word:
            break
        upper = word.upper()
        if parts:
            prev = parts[-1].upper()
            if (prev, upper) not in _TYPE_MULTI:
                if upper in _TYPE_STOP and not (
                    prev in ("TIMESTAMP", "TIME") and upper in ("WITH", "WITHOUT")
                ):
                    break
                if upper in _TYPE_STOP:
                    break
        if not parts and upper in _TYPE_STOP:
            break
        parts.append(word)
        rest = after
        rest_stripped = rest.lstrip()
        if rest_stripped.startswith("("):
            block, end_idx = _extract_paren_block(rest_stripped, 0)
            parts.append(f"({block})")
            rest = rest_stripped[end_idx:]
            continue
        # continue multi-word types
        nxt, _ = _take_word(rest)
        if parts and (parts[-1].upper(), nxt.upper()) in _TYPE_MULTI:
            continue
        if len(parts) >= 2 and (parts[-2].upper(), parts[-1].upper()) in _TYPE_MULTI:
            if (parts[-1].upper(), nxt.upper()) in _TYPE_MULTI:
                continue
        break

    type_sql = " ".join(parts).strip()
    excel_type, length = sql_type_to_excel(type_sql)
    return excel_type, length, rest


def sql_type_to_excel(type_sql: str) -> tuple[str, int | None]:
    raw = _WS_RE.sub(" ", (type_sql or "").strip())
    if not raw:
        return "VARCHAR2", 255
    m = re.match(r"^([A-Za-z][A-Za-z0-9 ]*?)(?:\s*\(([^)]*)\))?$", raw, re.I)
    base = raw.upper()
    args = None
    if m:
        base = _WS_RE.sub(" ", m.group(1).strip().upper())
        args = m.group(2)
    length: int | None = None
    scale_skip = False
    if args:
        first = args.split(",")[0].strip()
        try:
            length = int(first)
        except ValueError:
            scale_skip = True
            length = None
        _ = scale_skip

    if base in ("CHARACTER VARYING", "VARCHAR", "NVARCHAR", "NVARCHAR2", "VARCHAR2"):
        return "VARCHAR2", length or 255
    if base in ("CHARACTER", "CHAR", "NCHAR", "BPCHAR"):
        return "CHAR", length or 1
    if base in ("INTEGER", "INT", "INT4", "BIGINT", "INT8", "SMALLINT", "INT2", "SERIAL", "BIGSERIAL"):
        return "NUMBER", 10
    if base in ("NUMERIC", "DECIMAL", "NUMBER"):
        return "NUMBER", length
    if base.startswith("TIMESTAMP") or base in ("DATE", "TIME", "TIMESTAMPTZ"):
        return "DATE", None
    if base in ("TEXT", "CLOB", "NCLOB"):
        return "VARCHAR2", 4000
    if base in ("BYTEA", "BLOB", "LONG RAW", "RAW"):
        return "BLOB", length
    if base in ("BOOLEAN", "BOOL"):
        return "CHAR", 1
    if base in ("UUID",):
        return "VARCHAR2", 36
    if base in ("JSON", "JSONB"):
        return "VARCHAR2", 4000
    if base in ("DOUBLE PRECISION", "FLOAT", "REAL", "FLOAT8", "FLOAT4"):
        return "NUMBER", length
    return base, length


def _take_default(text: str) -> tuple[str | None, str]:
    s = text.lstrip()
    if not s:
        return None, text
    if s[0] in ("'", '"'):
        chunk, i = _read_quote(s, 0, s[0])
        return chunk, s[i:]
    if s[0] == "$":
        dollar = _read_dollar(s, 0)
        if dollar:
            chunk, i = dollar
            return chunk, s[i:]
    if s[0] == "(":
        block, end = _extract_paren_block(s, 0)
        return f"({block})", s[end:]
    # token plus optional (args), e.g. CURRENT_TIMESTAMP, nextval('seq')
    m = re.match(r"[A-Za-z_][\w$]*(?:\s*\.[A-Za-z_][\w$]*)?", s)
    if not m:
        return None, text
    token = m.group(0)
    rest = s[m.end() :]
    if rest.lstrip().startswith("("):
        block, end = _extract_paren_block(rest.lstrip(), 0)
        ws = rest[: len(rest) - len(rest.lstrip())]
        return f"{token}{ws}({block})", rest.lstrip()[end:]
    return token, rest


def _take_string(text: str) -> tuple[str, str]:
    s = text.lstrip()
    if s.startswith("E'") or s.startswith("e'"):
        s = s[1:]
    if not s.startswith("'"):
        return "", text
    chunk, i = _read_quote(s, 0, "'")
    inner = chunk[1:-1].replace("''", "'")
    return inner, s[i:]


def _take_references(text: str) -> tuple[str | None, list[str], str]:
    table, rest = _take_ident(text)
    if not table:
        return None, [], text
    cols: list[str] = []
    stripped = rest.lstrip()
    if stripped.startswith("("):
        cols = _paren_idents(stripped)
        rest = _after_first_paren(stripped)
    # skip ON DELETE / ON UPDATE / MATCH
    while True:
        word, after = _take_word(rest)
        if word.upper() in ("ON", "MATCH", "DEFERRABLE", "NOT", "INITIALLY"):
            rest = _skip_ref_option(rest)
            continue
        break
    return table, cols, rest


def _skip_ref_option(text: str) -> str:
    word, after = _take_word(text)
    upper = word.upper()
    if upper == "ON":
        _, after = _take_word(after)  # DELETE/UPDATE
        nxt, after2 = _take_word(after)
        if nxt.upper() in ("NO", "SET"):
            _, after3 = _take_word(after2)
            return after3
        return after2
    if upper == "NOT":
        _, after = _take_word(after)  # DEFERRABLE
        return after
    if upper in ("DEFERRABLE", "INITIALLY", "MATCH"):
        _, after = _take_word(after)
        return after
    return after


def _skip_to_next_flag(text: str) -> str:
    s = text.lstrip()
    if s.startswith("("):
        _, end = _extract_paren_block(s, 0)
        return s[end:]
    _, rest = _take_word(s)
    return rest


def _paren_idents(text: str) -> list[str]:
    s = text.lstrip()
    if not s.startswith("("):
        return []
    body, _ = _extract_paren_block(s, 0)
    return [_unquote_ident(p) for p in split_top_level(body or "") if _unquote_ident(p)]


def _after_first_paren(text: str) -> str:
    s = text.lstrip()
    if not s.startswith("("):
        return text
    _, end = _extract_paren_block(s, 0)
    return s[end:]


def _extract_paren_block(text: str, open_idx: int) -> tuple[str | None, int]:
    if open_idx >= len(text) or text[open_idx] != "(":
        return None, open_idx
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "'":
            _, i = _read_quote(text, i, "'")
            continue
        if ch == '"':
            _, i = _read_quote(text, i, '"')
            continue
        if ch == "`":
            _, i = _read_quote(text, i, "`")
            continue
        if ch == "(":
            depth += 1
            i += 1
            continue
        if ch == ")":
            depth -= 1
            i += 1
            if depth == 0:
                return text[open_idx + 1 : i - 1], i
            continue
        i += 1
    return text[open_idx + 1 :], n


def split_top_level(text: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "'":
            chunk, i = _read_quote(text, i, "'")
            buf.append(chunk)
            continue
        if ch == '"':
            chunk, i = _read_quote(text, i, '"')
            buf.append(chunk)
            continue
        if ch == "`":
            chunk, i = _read_quote(text, i, "`")
            buf.append(chunk)
            continue
        if ch == "(":
            depth += 1
            buf.append(ch)
            i += 1
            continue
        if ch == ")":
            depth = max(0, depth - 1)
            buf.append(ch)
            i += 1
            continue
        if ch == "," and depth == 0:
            part = "".join(buf).strip()
            if part:
                parts.append(part)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    part = "".join(buf).strip()
    if part:
        parts.append(part)
    return parts
