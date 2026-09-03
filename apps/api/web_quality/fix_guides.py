"""미흡 항목 한국어 개선안."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

RULES_DIR = Path(__file__).resolve().parent / "rules"
_URL_RE = re.compile(r"^https?://", re.I)


@lru_cache(maxsize=1)
def _axe_fix_ko() -> dict[str, dict[str, str]]:
    path = RULES_DIR / "axe_fix_ko.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_finding_fix(
    *,
    axe_id: str = "",
    rule_id: str = "",
    existing_fix: str = "",
) -> tuple[str, str]:
    """Returns (fix_text, fix_url). fix_url is set when existing_fix is a reference URL."""
    fix_url = ""
    if existing_fix and _URL_RE.match(existing_fix.strip()):
        fix_url = existing_fix.strip()

    guides = _axe_fix_ko()
    entry: dict[str, str] | None = None
    if axe_id and axe_id in guides:
        entry = guides[axe_id]
    elif rule_id:
        for _aid, g in guides.items():
            if g.get("rule_id") == rule_id:
                entry = g
                break

    if entry:
        parts = [entry.get("fix", "").strip()]
        ex = entry.get("example", "").strip()
        if ex:
            parts.append(f"예: {ex}")
        text = " ".join(p for p in parts if p)
        return text, fix_url

    if existing_fix and not fix_url:
        return existing_fix.strip(), ""

    if fix_url:
        return "axe-core 공식 가이드를 참고해 수정하세요.", fix_url

    return _default_fix(rule_id), ""


def _default_fix(rule_id: str) -> str:
    rid = (rule_id or "").strip()
    if rid.startswith("WA-") or rid.startswith("5.") or rid.startswith("6.") or rid.startswith("7."):
        return "KWCAG·전자정부 웹접근성 항목을 확인하고, 해당 UI 요소의 마크업·ARIA·키보드 접근성을 수정하세요."
    if rid.startswith("WS-"):
        return "HTML/CSS 표준에 맞게 마크업·속성을 수정하세요."
    if rid.startswith("WC-"):
        return "브라우저·모바일 호환성을 확인하고, viewport·스크립트 오류를 수정하세요."
    return ""


def get_axe_fix_guides() -> dict[str, dict[str, str]]:
    return _axe_fix_ko()


def extract_axe_id_from_url(url: str) -> str:
    m = re.search(r"/rules/axe/[\d.]+/([^/?#]+)", url or "")
    return m.group(1) if m else ""


def enrich_finding(finding: dict[str, Any]) -> dict[str, Any]:
    """Attach Korean fix text, ref_url, and metadata to a finding dict (in-place copy)."""
    from web_quality.catalog import rule_by_id
    from web_quality.ref_links import GUIDELINE_UIUX_2025_URL, resolve_finding_ref_urls

    out = dict(finding)
    axe_id = str(out.get("axe_id") or "")
    if not axe_id:
        raw = str(out.get("fix") or "")
        if _URL_RE.match(raw.strip()):
            axe_id = extract_axe_id_from_url(raw)
    rule_id = str(out.get("rule_id") or "")
    kwcag_id = str(out.get("kwcag_id") or "")
    existing = str(out.get("fix") or "")
    fix_text, fix_url = resolve_finding_fix(
        axe_id=axe_id,
        rule_id=rule_id or kwcag_id,
        existing_fix=existing,
    )
    if fix_text:
        out["fix"] = fix_text
    if fix_url:
        out["fix_url"] = fix_url

    catalog_rule = rule_by_id(rule_id) if rule_id else None
    if catalog_rule:
        if not kwcag_id:
            km = catalog_rule.get("kwcag_map") or []
            if km:
                kwcag_id = str(km[0])
                out["kwcag_id"] = kwcag_id
        if catalog_rule.get("category") == "uiux":
            out["guideline_url"] = GUIDELINE_UIUX_2025_URL
            if not out.get("krds_ref"):
                out["krds_ref"] = catalog_rule.get("krds_ref", "")
            if not out.get("rule_title"):
                out["rule_title"] = catalog_rule.get("title", "")
            if catalog_rule.get("ref_anchor") and not out.get("ref_anchor"):
                out["ref_anchor"] = catalog_rule.get("ref_anchor", "")

    refs = resolve_finding_ref_urls(
        rule_id=rule_id,
        kwcag_id=kwcag_id,
        category=str(out.get("category") or (catalog_rule or {}).get("category", "")),
        rule_ref_url=str((catalog_rule or {}).get("ref_url") or ""),
        rule_ref_anchor=str(
            out.get("ref_anchor") or (catalog_rule or {}).get("ref_anchor") or ""
        ),
        rule_ref_text=str(out.get("ref_text") or (catalog_rule or {}).get("ref_text") or ""),
        rule_ref_fallback=str((catalog_rule or {}).get("ref_fallback_url") or ""),
    )
    if refs.get("primary"):
        out["ref_url"] = refs["primary"]
    if refs.get("fallback"):
        out["ref_fallback_url"] = refs["fallback"]

    return out
