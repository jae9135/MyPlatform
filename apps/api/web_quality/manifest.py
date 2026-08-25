from __future__ import annotations

from pathlib import Path
from typing import Any

APP_DIR = Path(__file__).resolve().parent.parent
PORTAL_DIR = APP_DIR.parent / "portal"

SHARED_SOURCE_FILES = ["app/layout.tsx"]

SOURCE_FILES: dict[str, list[str]] = {
    "portal-home": ["app/page.tsx", *SHARED_SOURCE_FILES],
    "chk-db-std": ["app/apps/chk-db-std/page.tsx", *SHARED_SOURCE_FILES],
    "db-manager": ["app/apps/db-manager/page.tsx", *SHARED_SOURCE_FILES],
    "er-modeler": [
        "app/apps/er-modeler/page.tsx",
        *SHARED_SOURCE_FILES,
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
    "deliverable-manager": [
        "app/apps/deliverable-manager/page.tsx",
        *SHARED_SOURCE_FILES,
        "lib/deliverable-manager/DeliverableApp.tsx",
    ],
    "my-gantt": [
        "app/apps/my-gantt/page.tsx",
        *SHARED_SOURCE_FILES,
        "lib/mygantt/GanttApp.tsx",
        "lib/mygantt/components/GanttChart.tsx",
        "lib/mygantt/components/TaskTable.tsx",
        "lib/mygantt/components/ProjectHeader.tsx",
        "lib/mygantt/components/PrintDialog.tsx",
        "lib/mygantt/components/HolidayEditor.tsx",
        "lib/mygantt/components/ShareLinksDialog.tsx",
    ],
    "receipt-to-pdf": [
        "app/apps/receipt-to-pdf/page.tsx",
        *SHARED_SOURCE_FILES,
    ],
}

ER_MODELER_UI_STATES = [
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

DEFAULT_UI_STATE = [
    {
        "state_id": "main_page",
        "label": "메인 화면",
        "description": "앱 기본 진입 화면",
        "required": True,
    },
]

# Portal apps (web-quality excluded — self-diagnosis not useful)
TARGETS: list[dict[str, Any]] = [
    {
        "id": "portal-home",
        "name": "포털 홈",
        "path": "/",
        "description": "앱 카탈로그 · MyPlatform 메인",
        "mode": "portal",
        "ready_selector": "main",
    },
    {
        "id": "chk-db-std",
        "name": "DB 표준 점검",
        "path": "/apps/chk-db-std",
        "description": "행안부 공통표준 단어/용어/도메인/코드 점검",
        "mode": "portal",
        "ready_selector": "main",
    },
    {
        "id": "db-manager",
        "name": "DBManager",
        "path": "/apps/db-manager",
        "description": "테이블정의서 → PostgreSQL DDL / 데이터 관리",
        "mode": "portal",
        "ready_selector": "main",
    },
    {
        "id": "er-modeler",
        "name": "ER Modeler",
        "path": "/apps/er-modeler",
        "description": "테이블정의서 → ERD 편집 → 설계서 내보내기",
        "mode": "portal",
        "ready_selector": ".er-modeler",
        "ui_states": ER_MODELER_UI_STATES,
    },
    {
        "id": "deliverable-manager",
        "name": "DeliverableManager",
        "path": "/apps/deliverable-manager",
        "description": "산출물 목록 조회",
        "mode": "portal",
        "ready_selector": "main",
    },
    {
        "id": "my-gantt",
        "name": "MyGantt",
        "path": "/apps/my-gantt",
        "description": "일정/간트 관리",
        "mode": "portal",
        "ready_selector": ".app",
        "extractable": True,
    },
    {
        "id": "receipt-to-pdf",
        "name": "ReceiptToPDF",
        "path": "/apps/receipt-to-pdf",
        "description": "영수증 촬영·갤러리 → A4 PDF",
        "mode": "portal",
        "ready_selector": "main",
    },
    {
        "id": "external",
        "name": "외부 URL",
        "path": "",
        "description": "임의 웹 URL — 소스 제외, 화면(axe) 진단만",
        "mode": "external",
        "ready_selector": "body",
    },
]

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
