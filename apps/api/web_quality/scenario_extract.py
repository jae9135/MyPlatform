from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import Any

from web_quality.manifest import (
    get_source_files,
    get_target,
    get_ui_states,
    resolve_source_path,
)

EXTRACTABLE_TARGETS = frozenset({"my-gantt"})

WQ_TARGET_RE = re.compile(r'data-wq-target=["\']([^"\']+)["\']')
WQ_STATE_RE = re.compile(r'data-wq-state=["\']([^"\']+)["\']')
WQ_STATE_JSX_RE = re.compile(r"data-wq-state=\{([^}]+)\}")

MY_GANTT_READY = ".app"


@dataclass
class ScenarioCandidate:
    state_id: str
    label: str
    description: str
    kind: str
    recommended: bool
    selectable: bool
    skip_reason: str = ""
    risk: list[str] = field(default_factory=list)
    confidence: str = "medium"
    source_files: list[str] = field(default_factory=list)
    evidence: str = ""
    ready_selector: str = MY_GANTT_READY
    steps: list[dict[str, Any]] = field(default_factory=list)
    fallback_paths: list[str] = field(default_factory=list)
    access: str = ""  # ipms-online: "public" | "auth"

    def to_dict(self) -> dict[str, Any]:
        d = {
            "state_id": self.state_id,
            "label": self.label,
            "description": self.description,
            "kind": self.kind,
            "source": {"files": self.source_files, "evidence": self.evidence},
            "recommended": self.recommended,
            "selectable": self.selectable,
            "skip_reason": self.skip_reason,
            "risk": self.risk,
            "confidence": self.confidence,
            "open": {
                "ready_selector": self.ready_selector,
                "steps": self.steps,
            },
        }
        if self.fallback_paths:
            d["fallback_paths"] = list(self.fallback_paths)
        if self.access:
            d["access"] = self.access
        return d

    def to_ui_state(self) -> dict[str, Any]:
        return {
            "state_id": self.state_id,
            "label": self.label,
            "description": self.description,
            "required": self.recommended,
        }


def is_extractable(target_id: str) -> bool:
    return target_id in EXTRACTABLE_TARGETS


def parse_state_ids(raw: str | list | None) -> list[str] | None:
    if raw is None:
        return None
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    text = str(raw).strip()
    if not text:
        return []
    if text.startswith("["):
        import json

        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("state_ids JSON must be an array")
        return [str(x).strip() for x in data if str(x).strip()]
    return [part.strip() for part in text.split(",") if part.strip()]


def extract_scenarios(target_id: str) -> dict[str, Any]:
    cfg = get_target(target_id)
    name = (cfg or {}).get("name", target_id)
    if target_id == "my-gantt":
        candidates, warnings = _extract_my_gantt()
        extractable = True
        warnings.append(
            "포털 MyGantt(/apps/*) 시나리오는 로그인·세션 필요(access=auth)로 분류됩니다."
        )
    else:
        candidates, warnings = _from_manifest(target_id), []
        warnings.append(
            "포털 앱(/apps/*) 시나리오는 로그인·세션 필요(access=auth)로 분류됩니다."
        )
        extractable = False

    defaults = [c.state_id for c in candidates if c.recommended and c.selectable]
    return {
        "ok": True,
        "target": target_id,
        "target_name": name,
        "extractable": extractable,
        "candidates": [c.to_dict() for c in candidates],
        "defaults_selected": defaults,
        "warnings": warnings,
    }


def load_candidates(target_id: str) -> tuple[list[ScenarioCandidate], list[str]]:
    if target_id == "my-gantt":
        return _extract_my_gantt()
    return _from_manifest(target_id), []


def extract_portal_wq_scenarios(target_id: str, page_url: str) -> list[ScenarioCandidate]:
    """포털 앱 TSX의 data-wq-target 기반 시나리오 (외부 URL 탐색 보조)."""
    rels = get_source_files(target_id)
    if not rels:
        return []
    contents, _warnings = _read_sources(rels)
    wq_targets, wq_states = _wq_ids(contents)
    if not wq_targets:
        return []

    cfg = get_target(target_id) or {}
    ready = cfg.get("ready_selector", "main")
    entry = (page_url or "").strip()
    name = cfg.get("name", target_id)
    out: list[ScenarioCandidate] = []

    out.append(
        ScenarioCandidate(
            state_id=f"portal_{target_id}_main",
            label=f"{name} — 시작 페이지",
            description=entry,
            kind="page",
            recommended=True,
            selectable=True,
            confidence="high",
            source_files=rels[:3],
            evidence=ready,
            ready_selector=ready,
            steps=[
                {"action": "goto", "url": entry},
                {"action": "wait", "selector": ready, "timeout_ms": 45000},
            ],
        )
    )

    label_map = {
        "import_dialog": "가져오기",
        "export_dialog": "내보내기",
        "validation_dialog": "검증 결과",
        "add_table": "테이블 추가",
        "main_table_pane": "표 보기",
        "gantt_pane": "간트 탭",
        "print_dialog": "인쇄",
        "holiday_dialog": "휴일목록",
        "share_create": "공유 만들기",
        "share_dialog": "공유",
    }

    for tid in sorted(wq_targets):
        wait = _wait_step(tid, wq_states, f'[data-wq-state="{tid}"]')
        out.append(
            ScenarioCandidate(
                state_id=f"wq_{re.sub(r'[^a-zA-Z0-9_-]', '_', tid)[:40]}",
                label=label_map.get(tid, tid.replace("_", " ")),
                description=f"data-wq-target={tid}",
                kind="dialog",
                recommended=True,
                selectable=True,
                confidence=_confidence(tid, wq_targets, wq_states, wait["selector"]),
                source_files=rels[:5],
                evidence=f'[data-wq-target="{tid}"]',
                ready_selector=wait["selector"],
                steps=[
                    {"action": "goto", "url": entry},
                    {"action": "wait", "selector": ready, "timeout_ms": 45000},
                    {"action": "click", "selector": f'[data-wq-target="{tid}"]'},
                    {**wait, "timeout_ms": 15000},
                ],
            )
        )
    return out


def _from_manifest(target_id: str) -> list[ScenarioCandidate]:
    ready = (get_target(target_id) or {}).get("ready_selector", "main")
    out: list[ScenarioCandidate] = []
    for state in get_ui_states(target_id):
        sid = state["state_id"]
        out.append(
            ScenarioCandidate(
                state_id=sid,
                label=state.get("label", sid),
                description=(state.get("description") or "") or "로그인·세션 필요",
                kind="page",
                recommended=bool(state.get("required", True)),
                selectable=True,
                confidence="high",
                ready_selector=ready,
                steps=[{"action": "wait", "selector": ready}],
                access="auth",
            )
        )
    return out


def _read_sources(rels: list[str]) -> tuple[dict[str, str], list[str]]:
    contents: dict[str, str] = {}
    warnings: list[str] = []
    for rel in rels:
        path = resolve_source_path(rel)
        try:
            contents[rel] = path.read_text(encoding="utf-8")
        except OSError:
            warnings.append(f"소스 없음: {rel}")
    return contents, warnings


def _joined(contents: dict[str, str], rels: list[str] | None = None) -> str:
    if rels is None:
        return "\n".join(contents.values())
    return "\n".join(contents[r] for r in rels if r in contents)


def _has_any(text: str, tokens: list[str]) -> bool:
    return any(token in text for token in tokens)


def _wq_ids(contents: dict[str, str]) -> tuple[set[str], set[str]]:
    targets: set[str] = set()
    states: set[str] = set()
    for text in contents.values():
        targets.update(WQ_TARGET_RE.findall(text))
        states.update(WQ_STATE_RE.findall(text))
        for expr in WQ_STATE_JSX_RE.findall(text):
            states.update(re.findall(r"""["']([^"']+)["']""", expr))
    return targets, states


def _click_step(
    state_id: str,
    wq_targets: set[str],
    fallback_selector: str,
    fallback_text: str,
) -> dict[str, Any]:
    if state_id in wq_targets:
        return {"action": "click", "selector": f'[data-wq-target="{state_id}"]'}
    return {
        "action": "click_has_text",
        "selector": fallback_selector,
        "text": fallback_text,
    }


def _wait_step(state_id: str, wq_states: set[str], fallback: str) -> dict[str, Any]:
    if state_id in wq_states:
        return {"action": "wait", "selector": f'[data-wq-state="{state_id}"]'}
    return {"action": "wait", "selector": fallback}


def _confidence(state_id: str, wq_targets: set[str], wq_states: set[str], wait_sel: str) -> str:
    strong_wait = wait_sel.startswith("#") or state_id in wq_states
    strong_click = state_id in wq_targets or state_id == "main_page"
    if strong_wait or strong_click:
        return "high"
    return "medium"


def _extract_my_gantt() -> tuple[list[ScenarioCandidate], list[str]]:
    rels = get_source_files("my-gantt")
    contents, warnings = _read_sources(rels)
    wq_targets, wq_states = _wq_ids(contents)
    all_text = _joined(contents)
    header = _joined(
        contents, ["lib/mygantt/components/ProjectHeader.tsx", "lib/mygantt/GanttApp.tsx"]
    )

    candidates: list[ScenarioCandidate] = []

    def add(c: ScenarioCandidate) -> None:
        if c.selectable and not c.access:
            desc = c.description or ""
            if desc and "로그인" not in desc:
                desc = f"{desc} (로그인·세션 필요)"
            elif not desc:
                desc = "로그인·세션 필요"
            c = replace(c, access="auth", description=desc)
        candidates.append(c)

    if _has_any(all_text, ['className={`app', 'className="app"', "h1.brand", 'className="brand"']):
        add(
            ScenarioCandidate(
                state_id="main_page",
                label="메인 화면",
                description="MyGantt 기본 — 프로젝트 헤더, 표 탭, TaskTable",
                kind="page",
                recommended=True,
                selectable=True,
                confidence="high",
                source_files=["lib/mygantt/GanttApp.tsx"],
                evidence='className={`app…`} / h1.brand',
                steps=[{"action": "wait", "selector": MY_GANTT_READY}],
            )
        )

    if _has_any(all_text, ['role="tablist"', "workspace-tabs"]) and "표" in all_text:
        wait = _wait_step("main_table_pane", wq_states, ".workspace.pane-table")
        steps = [
            _click_step("main_table_pane", wq_targets, ".workspace-tabs button", "표"),
            wait,
        ]
        add(
            ScenarioCandidate(
                state_id="main_table_pane",
                label="표 보기",
                description="TaskTable 중심 — 표 탭 활성화",
                kind="tab",
                recommended=True,
                selectable=True,
                confidence=_confidence(
                    "main_table_pane", wq_targets, wq_states, wait["selector"]
                ),
                source_files=["lib/mygantt/GanttApp.tsx", "lib/mygantt/components/TaskTable.tsx"],
                evidence='role="tablist" + 버튼 「표」',
                steps=steps,
            )
        )

    if _has_any(all_text, ['role="tablist"', "workspace-tabs"]) and "간트" in all_text:
        wait = _wait_step("gantt_pane", wq_states, ".workspace.pane-gantt")
        steps = [
            _click_step("gantt_pane", wq_targets, ".workspace-tabs button", "간트"),
            wait,
        ]
        add(
            ScenarioCandidate(
                state_id="gantt_pane",
                label="간트 탭",
                description="GanttChart 패널 활성화",
                kind="tab",
                recommended=True,
                selectable=True,
                confidence=_confidence("gantt_pane", wq_targets, wq_states, wait["selector"]),
                source_files=["lib/mygantt/GanttApp.tsx", "lib/mygantt/components/GanttChart.tsx"],
                evidence='role="tablist" + 버튼 「간트」',
                steps=steps,
            )
        )

    if "PrintDialog" in all_text or "print-title" in all_text:
        wait = _wait_step("print_dialog", wq_states, "#print-title")
        steps = [
            {"action": "press", "key": "Escape"},
            _click_step("print_dialog", wq_targets, ".header-actions button", "인쇄"),
            wait,
        ]
        add(
            ScenarioCandidate(
                state_id="print_dialog",
                label="인쇄",
                description="인쇄 모달 — 표만 / 표+간트 선택",
                kind="dialog",
                recommended=True,
                selectable=True,
                confidence=_confidence("print_dialog", wq_targets, wq_states, wait["selector"]),
                source_files=[
                    "lib/mygantt/components/PrintDialog.tsx",
                    "lib/mygantt/components/ProjectHeader.tsx",
                ],
                evidence='role="dialog" aria-labelledby="print-title"',
                steps=steps,
            )
        )

    if "HolidayEditor" in all_text or "holiday-title" in all_text:
        wait = _wait_step("holiday_dialog", wq_states, "#holiday-title")
        steps = [
            {"action": "press", "key": "Escape"},
            _click_step("holiday_dialog", wq_targets, ".header-actions button", "휴일목록"),
            wait,
        ]
        add(
            ScenarioCandidate(
                state_id="holiday_dialog",
                label="휴일목록",
                description="휴일 편집 모달",
                kind="dialog",
                recommended=True,
                selectable=True,
                confidence=_confidence(
                    "holiday_dialog", wq_targets, wq_states, wait["selector"]
                ),
                source_files=[
                    "lib/mygantt/components/HolidayEditor.tsx",
                    "lib/mygantt/components/ProjectHeader.tsx",
                ],
                evidence='role="dialog" aria-labelledby="holiday-title"',
                steps=steps,
            )
        )

    if "ShareLinksDialog" in all_text or "share-title" in all_text:
        wait = _wait_step("share_dialog", wq_states, "#share-title")
        click_selectors = [
            '[data-wq-target="share_dialog"]',
            '[data-wq-target="share_create"]',
            '.header-actions button:has-text("보기 링크")',
            '.header-actions button:has-text("공유 링크 만들기")',
        ]
        steps = [
            {"action": "press", "key": "Escape"},
            {"action": "click_any", "selectors": click_selectors},
            wait,
        ]
        add(
            ScenarioCandidate(
                state_id="share_dialog",
                label="공유 링크",
                description="보기/편집 링크 복사 모달 (Supabase 필요)",
                kind="dialog",
                recommended=False,
                selectable=True,
                risk=["external_service"],
                skip_reason="Supabase 미설정 시 다이얼로그가 열리지 않을 수 있음",
                confidence=_confidence("share_dialog", wq_targets, wq_states, wait["selector"]),
                source_files=[
                    "lib/mygantt/components/ShareLinksDialog.tsx",
                    "lib/mygantt/GanttApp.tsx",
                ],
                evidence="ShareLinksDialog + isShareConfigured()",
                steps=steps,
            )
        )

    if _has_any(header, ['type="file"', "가져오기"]):
        add(
            ScenarioCandidate(
                state_id="import_file",
                label="가져오기",
                description="Excel/JSON 파일 업로드",
                kind="skip",
                recommended=False,
                selectable=False,
                risk=["file_input"],
                skip_reason="파일 선택 필요",
                confidence="high",
                source_files=["lib/mygantt/components/ProjectHeader.tsx"],
                evidence='<input type="file"> 「가져오기」',
            )
        )

    if 'confirm("이 프로젝트를 목록에서 삭제할까요?"' in all_text or (
        "onDeleteProject" in header and "삭제" in header
    ):
        add(
            ScenarioCandidate(
                state_id="delete_project",
                label="삭제",
                description="프로젝트 목록에서 삭제 — confirm + 데이터 변경",
                kind="skip",
                recommended=False,
                selectable=False,
                risk=["confirm", "destructive"],
                skip_reason="confirm + 데이터 변경",
                confidence="high",
                source_files=["lib/mygantt/GanttApp.tsx", "lib/mygantt/components/ProjectHeader.tsx"],
                evidence="confirm(삭제) / 버튼 「삭제」",
            )
        )

    if "이 프로젝트를 비울까요?" in all_text or (
        "onReset" in header and "초기화" in header
    ):
        add(
            ScenarioCandidate(
                state_id="reset_project",
                label="초기화",
                description="현재 프로젝트 비우기 — confirm + 데이터 변경",
                kind="skip",
                recommended=False,
                selectable=False,
                risk=["confirm", "destructive"],
                skip_reason="confirm + 데이터 변경",
                confidence="high",
                source_files=["lib/mygantt/GanttApp.tsx", "lib/mygantt/components/ProjectHeader.tsx"],
                evidence="confirm(초기화) / 버튼 「초기화」",
            )
        )

    if "window.print" in all_text:
        add(
            ScenarioCandidate(
                state_id="print_preview",
                label="인쇄 미리보기",
                description="window.print() — headless에서 스킵",
                kind="skip",
                recommended=False,
                selectable=False,
                risk=["window.print"],
                skip_reason="window.print() — headless에서 스킵",
                confidence="high",
                source_files=["lib/mygantt/GanttApp.tsx"],
                evidence="window.print()",
            )
        )

    if not any(c.state_id == "main_page" for c in candidates):
        warnings.append("메인 화면 시그널을 찾지 못해 main_page를 넣지 못했습니다.")

    return candidates, warnings
