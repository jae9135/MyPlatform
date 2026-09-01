#!/usr/bin/env python3
"""Validate cross-tool diagnostic target registry alignment.

Usage (from repo root):
  python apps/api/scripts/validate_diagnostic_targets.py
"""
from __future__ import annotations

import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from shared.targets import (  # noqa: E402
    LEGACY_SCENARIO_PRESETS,
    build_source_scan_targets,
    build_web_quality_targets,
    portal_ids_for_tool,
    validate_target_alignment,
)
from web_quality.manifest import PORTAL_TARGET_IDS as WQ_PORTAL_IDS  # noqa: E402
from source_scan.manifest import PORTAL_TARGET_IDS as SS_PORTAL_IDS  # noqa: E402


def main() -> int:
    errors = validate_target_alignment()
    if errors:
        print("FAIL - target alignment errors:")
        for e in errors:
            print(f"  - {e}")
        return 1

    wq = build_web_quality_targets()
    ss = build_source_scan_targets()
    perf = portal_ids_for_tool("perf_test")

    print("OK - diagnostic targets aligned")
    print(f"  web_quality targets: {len(wq)} (portal {len(WQ_PORTAL_IDS)})")
    print(f"  source_scan targets: {len(ss)} (portal {len(SS_PORTAL_IDS)})")
    print(f"  perf_test portal ids: {len(perf)}")
    print(f"  legacy presets: {[p['id'] for p in LEGACY_SCENARIO_PRESETS]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
