from __future__ import annotations

from pathlib import Path
from typing import Any

from shared.targets import (  # noqa: F401
    REPO_ROOT,
    build_source_scan_targets,
    get_canonical,
    validate_target_alignment,
)

API_DIR = REPO_ROOT / "apps" / "api"
PORTAL_DIR = REPO_ROOT / "apps" / "portal"

TARGETS: list[dict[str, Any]] = build_source_scan_targets()
TARGET_BY_ID = {t["id"]: t for t in TARGETS}
PORTAL_TARGET_IDS = {t["id"] for t in TARGETS if t.get("mode") == "portal"}


def get_target(target_id: str) -> dict[str, Any] | None:
    return TARGET_BY_ID.get(target_id)


def repo_root() -> Path:
    return REPO_ROOT


def resolve_globs(globs: list[str], *, root: Path | None = None) -> list[Path]:
    base = root or REPO_ROOT
    out: list[Path] = []
    seen: set[str] = set()
    for pattern in globs:
        norm = pattern.replace("\\", "/")
        for p in base.glob(norm):
            if not p.is_file():
                continue
            key = str(p.resolve())
            if key in seen:
                continue
            seen.add(key)
            out.append(p)
    return sorted(out)
