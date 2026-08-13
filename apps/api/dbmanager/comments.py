"""Encode/decode Korean name vs extra comment in PostgreSQL COMMENT."""

from __future__ import annotations

SEP = " | "


def encode_column_comment(korean_name: str | None, comment: str | None) -> str:
    korean = (korean_name or "").strip()
    extra = (comment or "").strip()
    if extra and extra != korean:
        return f"{korean}{SEP}{extra}" if korean else extra
    return korean


def decode_column_comment(raw: str | None) -> tuple[str, str]:
    text = (raw or "").strip()
    if SEP in text:
        korean, extra = text.split(SEP, 1)
        return korean.strip(), extra.strip()
    return text, ""
