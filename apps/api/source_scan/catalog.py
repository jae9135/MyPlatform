from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

RULES_DIR = Path(__file__).resolve().parent / "rules"


@lru_cache(maxsize=1)
def load_pmd_rules() -> list[dict[str, Any]]:
    path = RULES_DIR / "pmd_java.json"
    if not path.is_file():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_findsecbugs_rules() -> list[dict[str, Any]]:
    path = RULES_DIR / "findsecbugs.json"
    if not path.is_file():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_analog_map() -> dict[str, dict[str, str]]:
    path = RULES_DIR / "analog_map.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def pmd_by_id() -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in load_pmd_rules() if r.get("id")}


def findsecbugs_by_id() -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in load_findsecbugs_rules() if r.get("id")}


def resolve_analog(scanner: str, scanner_rule_id: str) -> dict[str, str]:
    key = f"{scanner}:{scanner_rule_id}"
    m = load_analog_map()
    if key in m:
        return m[key]
    prefix = scanner_rule_id.split(":")[0] if ":" in scanner_rule_id else scanner_rule_id
    for k, v in m.items():
        if k.endswith(f":{scanner_rule_id}") or k == f"{scanner}:{prefix}":
            return v
    return {
        "reference_ruleset": "findsecbugs",
        "rule_id": scanner_rule_id,
        "category": "security",
    }
