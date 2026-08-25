from __future__ import annotations

import uuid
from typing import Any

from source_scan.catalog import findsecbugs_by_id, pmd_by_id, resolve_analog


def _fid() -> str:
    return uuid.uuid4().hex[:12]


def normalize_finding(
    *,
    location: str,
    message: str,
    scanner: str,
    scanner_rule_id: str,
    severity: str = "medium",
    rule_set: str = "",
    rule_id: str = "",
    category: str = "",
    fix: str = "",
    status: str = "fail",
    language: str = "",
    reference_url: str = "",
) -> dict[str, Any]:
    if rule_set == "analog" or (not rule_set and scanner in ("bandit", "eslint")):
        analog = resolve_analog(scanner, scanner_rule_id)
        ref_set = analog.get("reference_ruleset", "findsecbugs")
        rule_id = analog.get("rule_id", scanner_rule_id)
        category = analog.get("category", category or "security")
        rule_set = "analog"
        meta = findsecbugs_by_id().get(rule_id) or pmd_by_id().get(rule_id)
        if meta and not reference_url:
            reference_url = meta.get("reference_url", "")
    elif rule_set == "pmd":
        meta = pmd_by_id().get(rule_id, {})
        category = category or meta.get("category", "java")
        if not reference_url:
            reference_url = meta.get("reference_url", "")
    elif rule_set == "findsecbugs":
        meta = findsecbugs_by_id().get(rule_id, {})
        category = category or meta.get("category", "security")
        if not reference_url:
            reference_url = meta.get("reference_url", "")

    return {
        "id": _fid(),
        "target": "source",
        "location": location,
        "rule_id": rule_id or scanner_rule_id,
        "rule_set": rule_set or scanner,
        "reference_ruleset": rule_set if rule_set in ("pmd", "findsecbugs") else resolve_analog(scanner, scanner_rule_id).get("reference_ruleset", ""),
        "category": category or "security",
        "status": status,
        "severity": severity,
        "message": message,
        "fix": fix,
        "scanner": scanner,
        "scanner_rule_id": scanner_rule_id,
        "language": language,
        "reference_url": reference_url,
    }


def not_scanned_finding(
    *,
    scanner: str,
    reason: str,
    location: str = "",
) -> dict[str, Any]:
    return {
        "id": _fid(),
        "target": "source",
        "location": location or scanner,
        "rule_id": "SCANNER",
        "rule_set": "system",
        "category": "system",
        "status": "not_scanned",
        "severity": "info",
        "message": f"{scanner} 미실행: {reason}",
        "fix": "도구 설치 및 PATH 설정을 확인하세요.",
        "scanner": scanner,
        "scanner_rule_id": "",
        "language": "",
    }
