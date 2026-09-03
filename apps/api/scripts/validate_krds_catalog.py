#!/usr/bin/env python3
"""Validate krds_uiux.json against krds_uiux.schema.json (structural checks)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
RULES = API_DIR / "web_quality" / "rules"
CATALOG = RULES / "krds_uiux.json"
SCHEMA = RULES / "krds_uiux.schema.json"

RULE_ID_RE = re.compile(r"^UX-KRDS-[0-9]+\.[0-9]+$")
AUTOMATABLE = {"auto", "semi", "manual", "na"}
SECTIONS = {
    "공공 브랜딩",
    "KRDS 컴포넌트",
    "디자인 토큰",
    "UX 패턴",
    "서비스 패턴",
    "포용·설정",
}


def main() -> int:
    rules = json.loads(CATALOG.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    errors: list[str] = []
    ids: set[str] = set()

    if not isinstance(rules, list):
        print("krds_uiux.json must be a JSON array", file=sys.stderr)
        return 1

    for i, rule in enumerate(rules):
        prefix = f"rules[{i}]"
        if not isinstance(rule, dict):
            errors.append(f"{prefix}: not an object")
            continue
        rid = rule.get("id")
        if not rid or not RULE_ID_RE.match(str(rid)):
            errors.append(f"{prefix}: invalid id {rid!r}")
        elif rid in ids:
            errors.append(f"{prefix}: duplicate id {rid}")
        else:
            ids.add(str(rid))
        if rule.get("category") != "uiux":
            errors.append(f"{prefix}: category must be 'uiux'")
        if rule.get("section") not in SECTIONS:
            errors.append(f"{prefix}: invalid section {rule.get('section')!r}")
        if rule.get("automatable") not in AUTOMATABLE:
            errors.append(f"{prefix}: invalid automatable {rule.get('automatable')!r}")
        for key in schema.get("required", []):
            if key not in rule:
                errors.append(f"{prefix}: missing required field {key}")

    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        return 1

    print(f"OK - {len(rules)} KRDS/UI-UX rules validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
