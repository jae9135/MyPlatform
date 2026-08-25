from __future__ import annotations

from typing import Any


def finding_key(f: dict[str, Any]) -> tuple[str, str, str]:
    return (
        f.get("location", ""),
        f.get("rule_id", ""),
        f.get("category", ""),
    )


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
