"""Canonical diagnostic target registry (web-quality · source-scan · perf-test).

Single source of truth for portal app ids/names/paths and scan globs.
Tool-specific manifests re-export views of this module.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
API_DIR = REPO_ROOT / "apps" / "api"
PORTAL_DIR = REPO_ROOT / "apps" / "portal"

SHARED_LAYOUT = "app/layout.tsx"

ER_MODELER_UI_STATES: list[dict[str, Any]] = [
    {
        "state_id": "main_canvas",
        "label": "기본 캔버스",
        "description": "ER Modeler 메인 화면 — 툴바, 캔버스, 테이블 노드",
        "required": True,
    },
    {
        "state_id": "import_dialog",
        "label": "가져오기 다이얼로그",
        "description": "Excel/SQL 정의서 가져오기 모달",
        "required": True,
    },
    {
        "state_id": "export_dialog",
        "label": "내보내기 다이얼로그",
        "description": "Excel·스크립트·PNG/SVG/PDF 내보내기 모달",
        "required": True,
    },
    {
        "state_id": "import_preview",
        "label": "가져오기 미리보기",
        "description": "가져오기 적용 전 테이블·관계 미리보기",
        "required": False,
    },
    {
        "state_id": "validation_dialog",
        "label": "검증 결과",
        "description": "ER 모델 검증 오류·경고 목록",
        "required": False,
    },
    {
        "state_id": "table_edit",
        "label": "테이블 편집",
        "description": "테이블 ID·한글명 수정 팝오버",
        "required": False,
    },
    {
        "state_id": "column_edit",
        "label": "컬럼 편집",
        "description": "컬럼 속성·타입·PK/FK 수정 팝오버",
        "required": False,
    },
    {
        "state_id": "relation_edit",
        "label": "관계 편집",
        "description": "FK 관계·카디널리티 수정 팝오버",
        "required": False,
    },
]

DEFAULT_UI_STATE: list[dict[str, Any]] = [
    {
        "state_id": "main_page",
        "label": "메인 화면",
        "description": "앱 기본 진입 화면",
        "required": True,
    },
]

LEGACY_SCENARIO_PRESETS: list[dict[str, Any]] = [
    {
        "id": "ipms-online",
        "name": "전기사업정보시스템",
        "scenario_kind": "legacy_preset",
        "tools": ["web_quality", "perf_test"],
        "module": "web_quality.presets.ipms_online",
    },
]


def _rel_api(*parts: str) -> str:
    return str(Path("apps/api").joinpath(*parts)).replace("\\", "/")


def _rel_portal(*parts: str) -> str:
    return str(Path("apps/portal").joinpath(*parts)).replace("\\", "/")


def _shared_source(page: str) -> list[str]:
    return [page, SHARED_LAYOUT]


# Canonical portal apps — fields used by one or more diagnostic tools.
CANONICAL_TARGETS: list[dict[str, Any]] = [
    {
        "id": "portal-home",
        "name": "포털 홈",
        "path": "/",
        "description": "앱 카탈로그 · MyPlatform 메인",
        "ready_selector": "main",
        "tools": ["web_quality", "perf_test"],
        "source_files": _shared_source("app/page.tsx"),
        "python_globs": [],
        "typescript_globs": [_rel_portal("app", "page.tsx"), _rel_portal("app", "layout.tsx")],
    },
    {
        "id": "chk-db-std",
        "name": "DB 표준 점검",
        "path": "/apps/chk-db-std",
        "description": "행안부 공통표준 단어/용어/도메인/코드 점검",
        "ready_selector": "main",
        "tools": ["web_quality", "source_scan", "perf_test"],
        "source_files": _shared_source("app/apps/chk-db-std/page.tsx"),
        "python_globs": [_rel_api("chkdbstd", "**", "*.py")],
        "typescript_globs": [_rel_portal("app", "apps", "chk-db-std", "**", "*")],
    },
    {
        "id": "db-manager",
        "name": "DBManager",
        "path": "/apps/db-manager",
        "description": "테이블정의서 → PostgreSQL DDL / 데이터 관리",
        "ready_selector": "main",
        "tools": ["web_quality", "source_scan", "perf_test"],
        "source_files": _shared_source("app/apps/db-manager/page.tsx"),
        "python_globs": [_rel_api("dbmanager", "**", "*.py")],
        "typescript_globs": [_rel_portal("app", "apps", "db-manager", "**", "*")],
    },
    {
        "id": "er-modeler",
        "name": "ER Modeler",
        "path": "/apps/er-modeler",
        "description": "테이블정의서 → ERD 편집 → 설계서 내보내기",
        "ready_selector": ".er-modeler",
        "tools": ["web_quality", "source_scan", "perf_test"],
        "ui_states": ER_MODELER_UI_STATES,
        "source_files": [
            "app/apps/er-modeler/page.tsx",
            SHARED_LAYOUT,
            "lib/er-modeler/CardinalityPicker.tsx",
            "lib/er-modeler/DraggableModal.tsx",
            "lib/er-modeler/EditDialogs.tsx",
            "lib/er-modeler/ErModelerApp.tsx",
            "lib/er-modeler/ExportDialog.tsx",
            "lib/er-modeler/ImportDialog.tsx",
            "lib/er-modeler/ImportPreviewDialog.tsx",
            "lib/er-modeler/RelationEdge.tsx",
            "lib/er-modeler/TableNode.tsx",
            "lib/er-modeler/ValidationDialog.tsx",
            "lib/er-modeler/selectionContext.tsx",
        ],
        "python_globs": [_rel_api("er_modeler", "**", "*.py")],
        "typescript_globs": [
            _rel_portal("app", "apps", "er-modeler", "**", "*"),
            _rel_portal("lib", "er-modeler", "**", "*"),
        ],
    },
    {
        "id": "deliverable-manager",
        "name": "DeliverableManager",
        "path": "/apps/deliverable-manager",
        "description": "산출물 목록 조회",
        "ready_selector": "main",
        "tools": ["web_quality", "source_scan", "perf_test"],
        "source_files": [
            "app/apps/deliverable-manager/page.tsx",
            SHARED_LAYOUT,
            "lib/deliverable-manager/DeliverableApp.tsx",
        ],
        "python_globs": [],
        "typescript_globs": [
            _rel_portal("app", "apps", "deliverable-manager", "**", "*"),
            _rel_portal("lib", "deliverable-manager", "**", "*"),
        ],
    },
    {
        "id": "my-gantt",
        "name": "MyGantt",
        "path": "/apps/my-gantt",
        "description": "일정/간트 관리",
        "ready_selector": ".app",
        "extractable": True,
        "tools": ["web_quality", "source_scan", "perf_test"],
        "source_files": [
            "app/apps/my-gantt/page.tsx",
            SHARED_LAYOUT,
            "lib/mygantt/GanttApp.tsx",
            "lib/mygantt/components/GanttChart.tsx",
            "lib/mygantt/components/TaskTable.tsx",
            "lib/mygantt/components/ProjectHeader.tsx",
            "lib/mygantt/components/PrintDialog.tsx",
            "lib/mygantt/components/HolidayEditor.tsx",
            "lib/mygantt/components/ShareLinksDialog.tsx",
        ],
        "python_globs": [],
        "typescript_globs": [
            _rel_portal("app", "apps", "my-gantt", "**", "*"),
            _rel_portal("lib", "mygantt", "**", "*"),
        ],
    },
    {
        "id": "receipt-to-pdf",
        "name": "ReceiptToPDF",
        "path": "/apps/receipt-to-pdf",
        "description": "영수증 촬영·갤러리 → A4 PDF",
        "ready_selector": "main",
        "tools": ["web_quality", "source_scan", "perf_test"],
        "source_files": _shared_source("app/apps/receipt-to-pdf/page.tsx"),
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
        "tools": ["source_scan"],
        "python_globs": [_rel_api("main.py")],
        "typescript_globs": [],
    },
    {
        "id": "upload",
        "name": "ZIP 업로드",
        "description": "업로드 ZIP 내 Python/TS/Java 소스",
        "tools": ["source_scan"],
        "python_globs": [],
        "typescript_globs": [],
    },
]

CANONICAL_BY_ID: dict[str, dict[str, Any]] = {t["id"]: t for t in CANONICAL_TARGETS}


def get_canonical(target_id: str) -> dict[str, Any] | None:
    return CANONICAL_BY_ID.get(target_id)


def portal_ids_for_tool(tool: str) -> set[str]:
    out: set[str] = set()
    for t in CANONICAL_TARGETS:
        if tool in (t.get("tools") or []):
            out.add(t["id"])
    return out


def build_web_quality_targets() -> list[dict[str, Any]]:
    targets: list[dict[str, Any]] = []
    for raw in CANONICAL_TARGETS:
        if "web_quality" not in (raw.get("tools") or []):
            continue
        if not raw.get("path"):
            continue
        entry: dict[str, Any] = {
            "id": raw["id"],
            "name": raw["name"],
            "path": raw["path"],
            "description": raw.get("description", ""),
            "mode": "portal",
            "ready_selector": raw.get("ready_selector", "main"),
        }
        if raw.get("ui_states"):
            entry["ui_states"] = raw["ui_states"]
        if raw.get("extractable"):
            entry["extractable"] = True
        targets.append(entry)
    targets.append(
        {
            "id": "external",
            "name": "외부 URL",
            "path": "",
            "description": "임의 웹 URL — 소스 제외, 화면(axe) 진단만",
            "mode": "external",
            "ready_selector": "body",
        }
    )
    return targets


def build_web_quality_source_files() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for raw in CANONICAL_TARGETS:
        if "web_quality" not in (raw.get("tools") or []):
            continue
        files = raw.get("source_files") or []
        if files:
            out[raw["id"]] = list(files)
    return out


def build_source_scan_targets() -> list[dict[str, Any]]:
    targets: list[dict[str, Any]] = []
    for raw in CANONICAL_TARGETS:
        if "source_scan" not in (raw.get("tools") or []):
            continue
        mode = "upload" if raw["id"] == "upload" else "portal"
        targets.append(
            {
                "id": raw["id"],
                "name": raw["name"],
                "description": raw.get("description", ""),
                "mode": mode,
                "python_globs": list(raw.get("python_globs") or []),
                "typescript_globs": list(raw.get("typescript_globs") or []),
            }
        )
    return targets


def validate_target_alignment() -> list[str]:
    """Return human-readable errors; empty list means OK."""
    errors: list[str] = []

    wq_by_id = {t["id"]: t for t in build_web_quality_targets()}
    ss_by_id = {t["id"]: t for t in build_source_scan_targets()}

    for raw in CANONICAL_TARGETS:
        tid = raw["id"]
        tools = set(raw.get("tools") or [])
        if "web_quality" in tools and raw.get("path") and tid not in wq_by_id:
            errors.append(f"{tid}: canonical web_quality 등록 누락")
        if "source_scan" in tools and tid not in ss_by_id:
            errors.append(f"{tid}: canonical source_scan 등록 누락")
        if tid in wq_by_id and tid in ss_by_id:
            if wq_by_id[tid].get("name") != ss_by_id[tid].get("name"):
                errors.append(
                    f"{tid}: name 불일치 WQ={wq_by_id[tid].get('name')!r} "
                    f"SS={ss_by_id[tid].get('name')!r}"
                )

    if "ipms-online" not in {p["id"] for p in LEGACY_SCENARIO_PRESETS}:
        errors.append("ipms-online legacy preset missing")

    return errors
