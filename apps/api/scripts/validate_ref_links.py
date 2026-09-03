#!/usr/bin/env python3
"""Validate 관련근거 ref URLs (HTTP status + optional anchor presence)."""
from __future__ import annotations

import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from web_quality.ref_links import (  # noqa: E402
    kwcag_anchors,
    ref_config_public,
    resolve_rule_ref_urls,
)


def _fetch(url: str, timeout: int = 20) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "MyPlatform-WQ-RefLinkValidator/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return e.code, body


def _check_anchor(html: str, anchor: str) -> bool:
    aid = anchor.lstrip("#")
    if not aid:
        return True
    return bool(re.search(rf'id=["\']{re.escape(aid)}["\']', html))


def main() -> int:
    cfg = ref_config_public()
    errors: list[str] = []
    warnings: list[str] = []
    checked: set[str] = set()

    def check_url(label: str, url: str, anchor: str = "") -> None:
        if not url or url in checked:
            return
        checked.add(url)
        base = url.split("#")[0]
        fragment = ""
        if "#" in url:
            fragment = url.split("#", 1)[1]
        status, html = _fetch(base)
        if status >= 400:
            errors.append(f"{label}: HTTP {status} - {base}")
            return
        aid = anchor or (fragment if fragment and not fragment.startswith(":~:text=") else "")
        if aid and not _check_anchor(html, aid):
            warnings.append(f"{label}: anchor #{aid.lstrip('#')} not found - {base}")

    # KWCAG anchors
    base = cfg["kwcag_base_url"].rstrip("/")
    status, html = _fetch(base)
    if status >= 400:
        errors.append(f"KWCAG base: HTTP {status} — {base}")
    else:
        for kid, anchor in kwcag_anchors().items():
            if not _check_anchor(html, anchor):
                warnings.append(f"KWCAG {kid}: anchor #{anchor} not found")

    # KRDS rules
    for rule in cfg.get("krds_rules") or []:
        rid = rule.get("id", "")
        resolved = resolve_rule_ref_urls(rule, category="uiux")
        primary = resolved.get("primary", "")
        fallback = resolved.get("fallback", "")
        anchor = rule.get("ref_anchor", "")
        check_url(f"{rid} primary", primary, anchor)
        if fallback and fallback.split("#")[0] != primary.split("#")[0]:
            check_url(f"{rid} fallback", fallback)

    # Global fallbacks
    for key, url in (cfg.get("krds_fallbacks") or {}).items():
        check_url(f"krds_fallback.{key}", url)

    print(f"Checked {len(checked)} URL(s)")
    for w in warnings:
        print(f"WARN: {w}")
    for e in errors:
        print(f"ERROR: {e}")

    if errors:
        print(f"\nFAILED - {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"\nOK - {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
