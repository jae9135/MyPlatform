from __future__ import annotations

from pathlib import Path
from typing import Any

from shared.targets import (  # noqa: F401
    CANONICAL_BY_ID,
    CANONICAL_TARGETS,
    DEFAULT_UI_STATE,
    ER_MODELER_UI_STATES,
    LEGACY_SCENARIO_PRESETS,
    PORTAL_DIR,
    REPO_ROOT,
    build_web_quality_source_files,
    build_web_quality_targets,
    get_canonical,
    portal_ids_for_tool,
    validate_target_alignment,
)

APP_DIR = Path(__file__).resolve().parent.parent

SHARED_SOURCE_FILES = ["app/layout.tsx"]
SOURCE_FILES: dict[str, list[str]] = build_web_quality_source_files()
TARGETS: list[dict[str, Any]] = build_web_quality_targets()
TARGET_BY_ID = {t["id"]: t for t in TARGETS}
PORTAL_TARGET_IDS = {t["id"] for t in TARGETS if t.get("mode") == "portal"}


def get_target(target_id: str) -> dict[str, Any] | None:
    return TARGET_BY_ID.get(target_id)


def match_portal_target_from_url(page_url: str) -> dict[str, Any] | None:
    """localhost 포털 앱 URL → manifest target (가장 긴 path prefix 매칭)."""
    from urllib.parse import urlparse

    p = urlparse((page_url or "").strip())
    host = (p.hostname or "").lower()
    if host not in ("127.0.0.1", "localhost", "::1"):
        return None
    path = (p.path or "/").rstrip("/") or "/"
    best: dict[str, Any] | None = None
    best_len = -1
    for t in TARGETS:
        if t.get("mode") != "portal":
            continue
        tpath = (t.get("path") or "/").rstrip("/") or "/"
        if path == tpath or (tpath != "/" and path.startswith(tpath + "/")):
            if len(tpath) > best_len:
                best = t
                best_len = len(tpath)
    return best


def get_source_files(target_id: str) -> list[str]:
    if target_id == "external":
        return []
    return SOURCE_FILES.get(target_id, [])


def get_ui_states(target_id: str) -> list[dict[str, Any]]:
    cfg = get_target(target_id)
    if not cfg:
        return DEFAULT_UI_STATE
    return cfg.get("ui_states") or DEFAULT_UI_STATE


def portal_root() -> Path:
    return PORTAL_DIR


def resolve_source_path(relative: str) -> Path:
    return PORTAL_DIR / relative.replace("\\", "/")


# Backward compatibility
ER_MODELER_SOURCE_FILES = SOURCE_FILES["er-modeler"]
UI_STATES = ER_MODELER_UI_STATES
