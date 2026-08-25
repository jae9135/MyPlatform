from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RULES_DIR = Path(__file__).resolve().parent / "rules"


def _load_json(name: str) -> list[dict[str, Any]]:
    path = RULES_DIR / name
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_kwcag_rules() -> list[dict[str, Any]]:
    return _load_json("kwcag22.json")


def load_egov_rules() -> list[dict[str, Any]]:
    return _load_json("egov_web.json")


def rule_by_id(rule_id: str) -> dict[str, Any] | None:
    for rule in load_kwcag_rules():
        if rule["id"] == rule_id:
            return rule
    for rule in load_egov_rules():
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
