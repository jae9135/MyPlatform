from __future__ import annotations

from typing import Any

from source_scan.catalog import load_analog_map


def dedupe_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for f in findings:
        key = (
            f.get("location", ""),
            f.get("rule_id", ""),
            f.get("rule_set", ""),
            f.get("scanner", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    return out


def finding_key(f: dict[str, Any]) -> tuple[str, str, str]:
    return (f.get("location", ""), f.get("rule_id", ""), f.get("rule_set", ""))


def compute_diff(
    current: list[dict[str, Any]],
    previous: list[dict[str, Any]],
) -> dict[str, Any]:
    prev_fail = {finding_key(f) for f in previous if f.get("status") == "fail"}
    curr_fail = {finding_key(f) for f in current if f.get("status") == "fail"}
    new_keys = curr_fail - prev_fail
    resolved_keys = prev_fail - curr_fail
    unchanged_keys = curr_fail & prev_fail

    def _rows(keys: set[tuple[str, str, str]], source: list[dict[str, Any]]) -> list[dict[str, Any]]:
        lookup = {finding_key(f): f for f in source if f.get("status") == "fail"}
        return [lookup[k] for k in sorted(keys) if k in lookup]

    return {
        "new_count": len(new_keys),
        "resolved_count": len(resolved_keys),
        "unchanged_count": len(unchanged_keys),
        "new": _rows(new_keys, current),
        "resolved": _rows(resolved_keys, previous),
        "unchanged": _rows(unchanged_keys, current),
    }


def compute_analog_coverage(findings: list[dict[str, Any]]) -> dict[str, Any]:
    analog_map = load_analog_map()
    mapped_keys = set(analog_map.keys())
    seen_scanner_rules: set[str] = set()
    unmapped: list[dict[str, str]] = []

    for f in findings:
        if f.get("rule_set") != "analog":
            continue
        scanner = f.get("scanner", "")
        sr = f.get("scanner_rule_id", "")
        key = f"{scanner}:{sr}"
        seen_scanner_rules.add(key)
        if key not in mapped_keys and not any(k.endswith(f":{sr}") for k in mapped_keys):
            unmapped.append({"scanner": scanner, "scanner_rule_id": sr, "location": f.get("location", "")})

    return {
        "mapped_rules_in_catalog": len(mapped_keys),
        "seen_analog_rules": len(seen_scanner_rules),
        "unmapped_count": len(unmapped),
        "unmapped_sample": unmapped[:50],
    }
