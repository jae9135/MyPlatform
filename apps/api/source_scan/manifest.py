from __future__ import annotations

from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
API_DIR = REPO_ROOT / "apps" / "api"
PORTAL_DIR = REPO_ROOT / "apps" / "portal"


def _rel_api(*parts: str) -> str:
    return str(Path("apps/api").joinpath(*parts)).replace("\\", "/")


def _rel_portal(*parts: str) -> str:
    return str(Path("apps/portal").joinpath(*parts)).replace("\\", "/")


TARGETS: list[dict[str, Any]] = [
    {
        "id": "chk-db-std",
        "name": "DB 표준 점검",
        "description": "행안부 공통표준 단어/용어/도메인/코드 점검 API·UI",
        "mode": "portal",
        "python_globs": [_rel_api("chkdbstd", "**", "*.py")],
        "typescript_globs": [_rel_portal("app", "apps", "chk-db-std", "**", "*")],
    },
    {
        "id": "db-manager",
        "name": "DBManager",
        "description": "PostgreSQL DDL / 데이터 관리",
        "mode": "portal",
        "python_globs": [_rel_api("dbmanager", "**", "*.py")],
        "typescript_globs": [_rel_portal("app", "apps", "db-manager", "**", "*")],
    },
    {
        "id": "er-modeler",
        "name": "ER Modeler",
        "description": "ERD 편집·설계서 내보내기",
        "mode": "portal",
        "python_globs": [_rel_api("er_modeler", "**", "*.py")],
        "typescript_globs": [
            _rel_portal("app", "apps", "er-modeler", "**", "*"),
            _rel_portal("lib", "er-modeler", "**", "*"),
        ],
    },
    {
        "id": "my-gantt",
        "name": "MyGantt",
        "description": "일정/간트 관리",
        "mode": "portal",
        "python_globs": [],
        "typescript_globs": [
            _rel_portal("app", "apps", "my-gantt", "**", "*"),
            _rel_portal("lib", "mygantt", "**", "*"),
        ],
    },
    {
        "id": "deliverable-manager",
        "name": "DeliverableManager",
        "description": "산출물 목록",
        "mode": "portal",
        "python_globs": [],
        "typescript_globs": [
            _rel_portal("app", "apps", "deliverable-manager", "**", "*"),
            _rel_portal("lib", "deliverable-manager", "**", "*"),
        ],
    },
    {
        "id": "receipt-to-pdf",
        "name": "ReceiptToPDF",
        "description": "영수증 PDF",
        "mode": "portal",
        "python_globs": [],
        "typescript_globs": [
            _rel_portal("app", "apps", "receipt-to-pdf", "**", "*"),
            _rel_portal("public", "receipt-to-pdf", "js", "**", "*.js"),
        ],
    },
    {
        "id": "portal-api-core",
        "name": "Portal API (공통)",
        "description": "FastAPI main 및 공통 API",
        "mode": "portal",
        "python_globs": [_rel_api("main.py")],
        "typescript_globs": [],
    },
    {
        "id": "upload",
        "name": "ZIP 업로드",
        "description": "업로드 ZIP 내 Python/TS/Java 소스",
        "mode": "upload",
        "python_globs": [],
        "typescript_globs": [],
    },
]

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
