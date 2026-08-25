"""소스·보안 진단 한국어 조치방안."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

RULES_DIR = Path(__file__).resolve().parent / "rules"
_URL_RE = re.compile(r"^https?://", re.I)


@lru_cache(maxsize=1)
def _fsb_fix_ko() -> dict[str, dict[str, str]]:
    path = RULES_DIR / "fsb_fix_ko.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _pmd_fix_ko() -> dict[str, dict[str, str]]:
    path = RULES_DIR / "pmd_fix_ko.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _bandit_fix_ko() -> dict[str, dict[str, str]]:
    path = RULES_DIR / "bandit_fix_ko.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def get_all_fix_guides() -> dict[str, dict[str, dict[str, str]]]:
    return {
        "findsecbugs": _fsb_fix_ko(),
        "pmd": _pmd_fix_ko(),
        "bandit": _bandit_fix_ko(),
    }


def _lookup_guide(
    rule_id: str,
    rule_set: str,
    reference_ruleset: str,
    scanner: str,
    scanner_rule_id: str,
) -> dict[str, str] | None:
    rid = (rule_id or "").strip()
    ref = (reference_ruleset or "").strip()
    rs = (rule_set or "").strip().lower()
    sc = (scanner or "").strip().lower()
    sid = (scanner_rule_id or "").strip()

    if rs == "findsecbugs" or ref == "findsecbugs":
        g = _fsb_fix_ko().get(rid)
        if g:
            return g
    if rs == "pmd" or ref == "pmd":
        g = _pmd_fix_ko().get(rid)
        if g:
            return g
    if sc == "bandit":
        bid = sid.replace("bandit:", "") if sid.startswith("bandit:") else sid
        if bid.startswith("B"):
            g = _bandit_fix_ko().get(bid)
            if g:
                return g
    if rs == "analog" and rid:
        g = _fsb_fix_ko().get(rid) or _pmd_fix_ko().get(rid)
        if g:
            return g
    return None


def _default_fix(rule_set: str, rule_id: str, scanner: str) -> str:
    rs = (rule_set or "").lower()
    if rs == "findsecbugs" or rs == "analog":
        return "FindSecBugs·OWASP 가이드를 참고해 취약 패턴을 제거하세요."
    if rs == "pmd":
        return "PMD 규칙 설명에 맞게 코드 품질·안전성을 개선하세요."
    if (scanner or "").lower() == "bandit":
        return "Bandit/CWE 가이드를 참고해 Python 보안 취약점을 수정하세요."
    if (scanner or "").lower() == "eslint":
        return "ESLint 보안 규칙에 맞게 입력 검증·안전 API 사용을 검토하세요."
    return ""


def resolve_finding_fix(
    *,
    rule_id: str = "",
    rule_set: str = "",
    reference_ruleset: str = "",
    scanner: str = "",
    scanner_rule_id: str = "",
    existing_fix: str = "",
    reference_url: str = "",
) -> tuple[str, str]:
    """Returns (fix_text, reference_url)."""
    fix_url = (reference_url or "").strip()
    fix_text = (existing_fix or "").strip()

    if fix_text and _URL_RE.match(fix_text):
        if not fix_url:
            fix_url = fix_text
        fix_text = ""

    guide = _lookup_guide(rule_id, rule_set, reference_ruleset, scanner, scanner_rule_id)
    if guide:
        parts = [guide.get("fix", "").strip()]
        ex = guide.get("example", "").strip()
        if ex:
            parts.append(f"예: {ex}")
        text = " ".join(p for p in parts if p)
        return text, fix_url

    if fix_text:
        return fix_text, fix_url

    if fix_url:
        return "공식 참조 문서를 확인해 수정하세요.", fix_url

    default = _default_fix(rule_set, rule_id, scanner)
    return default, fix_url


def enrich_finding(finding: dict[str, Any]) -> dict[str, Any]:
    out = dict(finding)
    if out.get("status") not in ("fail", "review"):
        return out
    fix_text, ref_url = resolve_finding_fix(
        rule_id=str(out.get("rule_id") or ""),
        rule_set=str(out.get("rule_set") or ""),
        reference_ruleset=str(out.get("reference_ruleset") or ""),
        scanner=str(out.get("scanner") or ""),
        scanner_rule_id=str(out.get("scanner_rule_id") or ""),
        existing_fix=str(out.get("fix") or ""),
        reference_url=str(out.get("reference_url") or out.get("fix_url") or ""),
    )
    if fix_text:
        out["fix"] = fix_text
    if ref_url:
        out["reference_url"] = ref_url
        out["fix_url"] = ref_url
    return out
