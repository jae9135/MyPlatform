from __future__ import annotations

import re
from pathlib import Path

from web_quality.java_scenario_extract import VIEW_SUFFIXES, _is_skipped, _rel, discover_view_files
from web_quality.static_scanner import Finding, StaticScanResult, _add, _fid, _line_no, _scan_layout_lang


def _scan_html_like(rel: str, content: str, findings: list[Finding]) -> None:
    if "<html" in content.lower():
        _scan_layout_lang(content, rel, findings)

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

    for m in re.finditer(r"<input\b[^>]*>", content, re.I):
        tag = m.group(0)
        if re.search(r'\btype\s*=\s*["\'](?:hidden|submit|button|image)["\']', tag, re.I):
            continue
        has_aria = re.search(r'\b(aria-label|aria-labelledby|title)\s*=', tag, re.I)
        id_m = re.search(r'\bid\s*=\s*["\']([^"\']+)["\']', tag, re.I)
        has_label = False
        if id_m:
            iid = id_m.group(1)
            has_label = bool(
                re.search(rf'<label[^>]+for\s*=\s*["\']{re.escape(iid)}["\']', content, re.I)
            )
        if not has_aria and not has_label:
            ln = _line_no(content, m.start())
            _add(
                findings,
                location=f"{rel}:{ln}",
                rule_id="7.3.1",
                category="a11y",
                severity="warning",
                message="input에 label 또는 aria-label이 보이지 않습니다.",
            )

    for m in re.finditer(r"<a\b[^>]*>[\s\S]*?</a>", content, re.I):
        tag = m.group(0)
        inner = re.sub(r"<[^>]+>", "", tag).strip()
        has_aria = re.search(r'\b(aria-label|aria-labelledby|title)\s*=', tag, re.I)
        if not inner and not has_aria:
            ln = _line_no(content, m.start())
            _add(
                findings,
                location=f"{rel}:{ln}",
                rule_id="6.4.3",
                category="a11y",
                severity="warning",
                message="링크 텍스트가 비어 있습니다.",
            )

    if 'role="dialog"' not in content and "role='dialog'" not in content:
        if re.search(r'class\s*=\s*["\'][^"\']*modal[^"\']*["\']', content, re.I):
            _add(
                findings,
                location=f"{rel}:modal",
                rule_id="8.2.1",
                category="a11y",
                severity="info",
                message="modal 클래스 — role=\"dialog\" 및 레이블 확인 필요",
                status="review",
            )


def scan_java_upload_sources(root: Path) -> StaticScanResult:
    findings: list[Finding] = []
    scanned: set[str] = set()
    for vp in discover_view_files(root):
        rel = _rel(root, vp)
        if _is_skipped(rel):
            continue
        try:
            content = vp.read_text(encoding="utf-8", errors="replace")
        except OSError:
            _add(
                findings,
                location=rel,
                rule_id="WS-1.1",
                category="standard",
                severity="error",
                message=f"뷰 파일 읽기 실패: {rel}",
                status="not_scanned",
            )
            continue
        scanned.add(rel)
        _scan_html_like(rel, content, findings)
    return StaticScanResult(findings=findings, scanned_files=scanned)
