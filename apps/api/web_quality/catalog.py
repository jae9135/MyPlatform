from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from web_quality.ref_links import (
    GUIDELINE_UIUX_2025_URL,
    krds_rule_ref_url,
    kwcag_ref_url,
    resolve_finding_ref_url,
)

RULES_DIR = Path(__file__).resolve().parent / "rules"


def _load_json(name: str) -> list[dict[str, Any]]:
    path = RULES_DIR / name
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_kwcag_rules() -> list[dict[str, Any]]:
    return _load_json("kwcag22.json")


def load_egov_rules() -> list[dict[str, Any]]:
    return _load_json("egov_web.json")


def load_krds_uiux_rules() -> list[dict[str, Any]]:
    return _load_json("krds_uiux.json")


def krds_catalog_meta() -> dict[str, Any]:
    rules = load_krds_uiux_rules()
    version = rules[0].get("guideline_version", "2025.08") if rules else "2025.08"
    return {
        "guideline": "디지털 정부서비스 UIUX 가이드라인",
        "guideline_version": version,
        "krds_url": "https://www.krds.go.kr/",
        "rule_count": len(rules),
    }


def rules_by_runtime_check() -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for rule in load_krds_uiux_rules():
        for key in rule.get("runtime_checks") or []:
            out.setdefault(key, []).append(rule)
    return out


def rules_by_static_check() -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for rule in load_krds_uiux_rules():
        for key in rule.get("static_checks") or []:
            out.setdefault(key, []).append(rule)
    return out


def rule_by_id(rule_id: str) -> dict[str, Any] | None:
    for rule in load_kwcag_rules():
        if rule["id"] == rule_id:
            return rule
    for rule in load_egov_rules():
        if rule["id"] == rule_id:
            return rule
    for rule in load_krds_uiux_rules():
        if rule["id"] == rule_id:
            return rule
    return None


def axe_rule_to_kwcag(axe_rule_id: str) -> str | None:
    for rule in load_kwcag_rules():
        if axe_rule_id in rule.get("axe_rules", []):
            return rule["id"]
    return None


def axe_rule_to_egov(axe_rule_id: str) -> str | None:
    kwcag_id = axe_rule_to_kwcag(axe_rule_id)
    if not kwcag_id:
        return None
    for rule in load_egov_rules():
        if kwcag_id in rule.get("kwcag_map", []):
            return rule["id"]
    return None
