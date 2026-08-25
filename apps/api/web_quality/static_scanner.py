from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from web_quality.catalog import load_egov_rules
from web_quality.manifest import get_source_files, get_target, resolve_source_path


@dataclass
class Finding:
    id: str
    target: str
    location: str
    rule_id: str
    category: str
    status: str
    severity: str
    message: str
    fix: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "target": self.target,
            "location": self.location,
            "rule_id": self.rule_id,
            "category": self.category,
            "status": self.status,
            "severity": self.severity,
            "message": self.message,
            "fix": self.fix,
        }


@dataclass
class StaticScanResult:
    findings: list[Finding] = field(default_factory=list)
    scanned_files: set[str] = field(default_factory=set)


def _fid() -> str:
    return uuid.uuid4().hex[:12]


def _line_no(text: str, index: int) -> int:
    return text[:index].count("\n") + 1


def _add(
    out: list[Finding],
    *,
    location: str,
    rule_id: str,
    category: str,
    severity: str,
    message: str,
    fix: str = "",
    status: str = "fail",
) -> None:
    out.append(
        Finding(
            id=_fid(),
            target="source",
            location=location,
            rule_id=rule_id,
            category=category,
            status=status,
            severity=severity,
            message=message,
            fix=fix,
        )
    )


def _scan_layout_lang(content: str, rel: str, findings: list[Finding]) -> None:
    if "<html" in content and 'lang="ko"' not in content and "lang='ko'" not in content:
        _add(
            findings,
            location=f"{rel}:1",
            rule_id="7.1.1",
            category="a11y",
            severity="error",
            message="html 요소에 lang=\"ko\" 속성이 없습니다.",
            fix="app/layout.tsx의 <html lang=\"ko\">를 확인하세요.",
        )
    elif 'lang="ko"' in content or "lang='ko'" in content:
        _add(
            findings,
            location=f"{rel}:layout",
            rule_id="7.1.1",
            category="a11y",
            severity="info",
            message="기본 언어(ko)가 설정되어 있습니다.",
            status="pass",
        )


def _scan_tsx_file(rel: str, content: str, findings: list[Finding]) -> None:
    lines = content.splitlines()

    for m in re.finditer(r"<img\b[^>]*>", content, re.I):
        tag = m.group(0)
        if re.search(r"\balt\s*=", tag, re.I):
            if re.search(r'\balt\s*=\s*["\']\s*["\']', tag, re.I):
                ln = _line_no(content, m.start())
                _add(
                    findings,
                    location=f"{rel}:{ln}",
                    rule_id="5.1.1",
                    category="a11y",
                    severity="warning",
                    message="img 요소의 alt가 비어 있습니다.",
                    fix="장식 이미지는 alt=\"\"(공백), 의미 있는 이미지는 설명 alt를 제공하세요.",
                )
        else:
            ln = _line_no(content, m.start())
            _add(
                findings,
                location=f"{rel}:{ln}",
                rule_id="5.1.1",
                category="a11y",
                severity="error",
                message="img 요소에 alt 속성이 없습니다.",
                fix="alt 속성을 추가하세요.",
            )

    for m in re.finditer(r"<button\b[^>]*>[\s\S]*?</button>", content, re.I):
        tag = m.group(0)
        inner = re.sub(r"<[^>]+>", "", tag).strip()
        has_aria = re.search(r'\b(aria-label|aria-labelledby)\s*=', tag, re.I)
        has_title = re.search(r"\btitle\s*=", tag, re.I)
        if not inner and not has_aria and not has_title:
            if "aria-hidden" in tag:
                continue
            ln = _line_no(content, m.start())
            _add(
                findings,
                location=f"{rel}:{ln}",
                rule_id="5.1.1",
                category="a11y",
                severity="error",
                message="버튼에 접근 가능한 이름(텍스트/aria-label)이 없습니다.",
                fix="버튼 텍스트 또는 aria-label을 추가하세요.",
            )

    for m in re.finditer(
        r"<(?:div|span)\b[^>]*\bonClick\s*=[^>]*>",
        content,
        re.I,
    ):
        tag = m.group(0)
        if re.search(r'\brole\s*=\s*["\'](?:button|link|menuitem|tab)["\']', tag, re.I):
            continue
        if re.search(r"\btabIndex\s*=", tag, re.I):
            continue
        ln = _line_no(content, m.start())
        _add(
            findings,
            location=f"{rel}:{ln}",
            rule_id="6.1.1",
            category="a11y",
            severity="warning",
            message="div/span에 onClick만 있고 role/tabIndex가 없습니다.",
            fix="button 요소 사용 또는 role=\"button\" tabIndex={0} 및 키보드 핸들러를 추가하세요.",
        )

    for m in re.finditer(r"\btabIndex\s*=\s*\{?\s*(\d+)\s*\}?", content):
        val = int(m.group(1))
        if val > 0:
            ln = _line_no(content, m.start())
            _add(
                findings,
                location=f"{rel}:{ln}",
                rule_id="6.1.2",
                category="a11y",
                severity="warning",
                message=f"양수 tabIndex({val})는 초점 순서를 왜곡할 수 있습니다.",
                fix="tabIndex={0} 또는 DOM 순서로 초점을 관리하세요.",
            )

    for m in re.finditer(r"<input\b[^>]*>", content, re.I):
        tag = m.group(0)
        if re.search(r'\btype\s*=\s*["\'](?:hidden|submit|button|image)["\']', tag, re.I):
            continue
        has_label = re.search(r"\bid\s*=", tag, re.I) and "htmlFor" in content
        has_aria = re.search(r'\b(aria-label|aria-labelledby)\s*=', tag, re.I)
        if not has_label and not has_aria:
            ln = _line_no(content, m.start())
            _add(
                findings,
                location=f"{rel}:{ln}",
                rule_id="7.3.1",
                category="a11y",
                severity="warning",
                message="input에 연결된 label 또는 aria-label이 보이지 않습니다.",
                fix="<label htmlFor=...> 또는 aria-label을 추가하세요.",
            )

    for m in re.finditer(r"<a\b[^>]*>[\s\S]*?</a>", content, re.I):
        tag = m.group(0)
        inner = re.sub(r"<[^>]+>", "", tag).strip()
        has_aria = re.search(r'\b(aria-label|aria-labelledby)\s*=', tag, re.I)
        if not inner and not has_aria:
            ln = _line_no(content, m.start())
            _add(
                findings,
                location=f"{rel}:{ln}",
                rule_id="6.4.3",
                category="a11y",
                severity="warning",
                message="링크 텍스트가 비어 있습니다.",
                fix="링크 용도를 설명하는 텍스트 또는 aria-label을 제공하세요.",
            )

    if "DraggableModal" in content or "role=\"dialog\"" in content:
        if 'role="dialog"' not in content and "role='dialog'" not in content:
            if "DraggableModal" in rel or "Dialog" in rel:
                _add(
                    findings,
                    location=f"{rel}:dialog",
                    rule_id="8.2.1",
                    category="a11y",
                    severity="info",
                    message="DraggableModal 컴포넌트가 dialog 역할을 위임하는지 확인하세요.",
                    status="review",
                )

    if "object" in content.lower() or "embed" in content.lower():
        for pat in (r"<object\b", r"<embed\b"):
            if re.search(pat, content, re.I):
                _add(
                    findings,
                    location=f"{rel}:plugin",
                    rule_id="WS-1.5",
                    category="standard",
                    severity="warning",
                    message="object/embed 태그 사용 — 비표준 플러그인 여부 확인",
                    status="review",
                )

    if rel.endswith("ErModelerApp.tsx"):
        if "<h1" not in content:
            _add(
                findings,
                location=f"{rel}:header",
                rule_id="6.4.2",
                category="a11y",
                severity="warning",
                message="페이지/앱 영역 h1 제목이 없습니다.",
                fix="앱 헤더에 h1을 유지하세요.",
            )


def scan_target_sources(target_id: str) -> StaticScanResult:
    if target_id == "external":
        return StaticScanResult()

    files = get_source_files(target_id)
    if not files:
        return StaticScanResult()

    findings: list[Finding] = []
    scanned: set[str] = set()
    location_prefix = target_id

    for rel in files:
        path = resolve_source_path(rel)
        if not path.is_file():
            _add(
                findings,
                location=rel,
                rule_id="WS-1.1",
                category="standard",
                severity="error",
                message=f"소스 파일을 찾을 수 없습니다: {rel}",
                status="not_scanned",
            )
            continue
        content = path.read_text(encoding="utf-8")
        scanned.add(rel)
        if rel == "app/layout.tsx":
            _scan_layout_lang(content, rel, findings)
        _scan_tsx_file(rel, content, findings)

    for rule in load_egov_rules():
        if rule.get("automatable") == "na":
            _add(
                findings,
                location=location_prefix,
                rule_id=rule["id"],
                category=rule["category"],
                severity="info",
                message=f"{rule['title']} — SPA/해당 앱에 해당 없음",
                status="na",
            )

    return StaticScanResult(findings=findings, scanned_files=scanned)


def scan_er_modeler_sources() -> StaticScanResult:
    return scan_target_sources("er-modeler")
