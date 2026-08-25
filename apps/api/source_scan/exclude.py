from __future__ import annotations

import fnmatch
from pathlib import Path

DEFAULT_EXCLUDE_GLOBS = [
    "**/test/**",
    "**/tests/**",
    "**/target/**",
    "**/node_modules/**",
    "**/build/**",
    "**/.git/**",
    "**/dist/**",
    "**/vendor/**",
]


def parse_exclude_globs(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return list(DEFAULT_EXCLUDE_GLOBS)
    parts = [p.strip() for p in raw.replace("\n", ",").split(",") if p.strip()]
    return parts or list(DEFAULT_EXCLUDE_GLOBS)


def path_matches_glob(rel_posix: str, pattern: str) -> bool:
    rel = rel_posix.replace("\\", "/").lstrip("/")
    pat = pattern.replace("\\", "/").lstrip("/")
    if pat.endswith("/**"):
        base = pat[:-3].lstrip("*/")
        if base and (f"/{base}/" in f"/{rel}/" or rel.startswith(f"{base}/") or rel == base):
            return True
    return fnmatch.fnmatch(rel, pat) or fnmatch.fnmatchcase(rel, pat)


def is_excluded_path(path: Path, root: Path, globs: list[str] | None = None) -> bool:
    try:
        rel = str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return False
    patterns = globs or DEFAULT_EXCLUDE_GLOBS
    return any(path_matches_glob(rel, g) for g in patterns)


def filter_file_list(files: list[Path], root: Path, globs: list[str] | None = None) -> list[Path]:
    return [p for p in files if not is_excluded_path(p, root, globs)]
