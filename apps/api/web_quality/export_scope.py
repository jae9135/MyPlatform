"""Apply export scope filters to web-quality scan payloads."""

from __future__ import annotations

import copy
from typing import Any


def _recompute_stats(findings: list[dict[str, Any]]) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "total": len(findings),
        "pass": 0,
        "fail": 0,
        "review": 0,
        "manual": 0,
        "not_scanned": 0,
        "na": 0,
    }
    by_cat: dict[str, dict[str, int]] = {}
    for f in findings:
        st = f.get("status", "fail")
        if st in stats and isinstance(stats[st], int):
            stats[st] += 1
        cat = f.get("category", "a11y")
        by_cat.setdefault(cat, {"fail": 0, "pass": 0, "not_scanned": 0})
        if st in by_cat[cat]:
            by_cat[cat][st] += 1
        elif st == "fail":
            by_cat[cat]["fail"] += 1
    stats["by_category"] = by_cat
    return stats


def _finding_matches_query(f: dict[str, Any], raw_query: str) -> bool:
    q = (raw_query or "").strip().lower()
    if not q:
        return True
    status_labels = {
        "fail": "미흡",
        "review": "검토",
        "pass": "통과",
        "manual": "수동",
        "not_scanned": "미실행",
        "na": "해당없음",
    }
    st = str(f.get("status", ""))
    if q in status_labels.get(st, "").lower() or q in st.lower():
        return True
    haystack = " ".join(
        str(f.get(k, "") or "")
        for k in (
            "target",
            "location",
            "rule_id",
            "message",
            "detail",
            "category",
            "status",
            "state_id",
            "rule_title",
            "krds_ref",
        )
    ).lower()
    return q in haystack


def apply_export_scope(payload: dict[str, Any], scope: dict[str, Any] | None) -> dict[str, Any]:
    if not scope or scope.get("mode", "all") == "all":
        return payload

    out = copy.deepcopy(payload)
    findings = list(out.get("findings") or [])

    if scope.get("diff_only"):
        diff = out.get("diff") or {}
        new_items = diff.get("new") or []
        if isinstance(new_items, list) and new_items:
            new_ids = {f.get("id") for f in new_items if f.get("id")}
            findings = (
                [f for f in findings if f.get("id") in new_ids]
                if new_ids
                else list(new_items)
            )

    category = (scope.get("category") or "").strip()
    if category and category not in ("all", "captures", "diff", "not_scanned", "manual"):
        findings = [f for f in findings if f.get("category") == category]

    statuses = scope.get("statuses") or []
    if isinstance(statuses, list) and statuses:
        allowed = {str(s) for s in statuses}
        findings = [f for f in findings if f.get("status") in allowed]

    if scope.get("issues_only"):
        findings = [f for f in findings if f.get("status") in ("fail", "review")]

    query = str(scope.get("query") or "").strip()
    if query:
        findings = [f for f in findings if _finding_matches_query(f, query)]
    finding_ids = {f.get("id") for f in findings if f.get("id")}
    state_ids: set[str] = set()
    for f in findings:
        if f.get("state_id"):
            state_ids.add(str(f["state_id"]))
        if f.get("target") == "screen" and f.get("location"):
            state_ids.add(str(f["location"]))
        for rid in f.get("review_state_ids") or []:
            state_ids.add(str(rid))

    screenshots = out.get("screenshots") or []
    if state_ids or finding_ids:
        filtered_shots = []
        for s in screenshots:
            if s.get("kind") == "state" and s.get("state_id") in state_ids:
                filtered_shots.append(s)
            elif s.get("kind") == "element" and s.get("finding_id") in finding_ids:
                filtered_shots.append(s)
        out["screenshots"] = filtered_shots

    out["findings"] = findings
    out["stats"] = _recompute_stats(findings)
    out["export_scope"] = scope
    label = category or scope.get("tab") or "전체"
    if scope.get("issues_only"):
        label = f"{label}(미흡·검토)"
    if query:
        label = f"{label}(검색)"
    out["export_scope_label"] = label
    return out
