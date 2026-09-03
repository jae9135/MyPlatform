"""KRDS / 디지털 정부 UI·UX 가이드라인(2025.08) 자동·반자동 검사."""

from __future__ import annotations

import re
import uuid
from typing import Any, Callable

from web_quality.catalog import load_krds_uiux_rules, rules_by_static_check
from web_quality.static_scanner import Finding


def _static_fid() -> str:
    return uuid.uuid4().hex[:12]

RUNTIME_CHECK_SCRIPT = """
() => {
  const bodyText = (document.body && document.body.innerText) || '';
  const html = document.documentElement.outerHTML.slice(0, 120000);
  const hasKrdsClass = /\\bkrds[-_]/i.test(html) || /class="[^"]*krds/i.test(html);
  const skipSel = 'a[href="#main"], a[href="#contents"], a[href="#content"], a[href="#skip"], .skip, .skip-nav a, #skip a';
  const skipLinks = Array.from(document.querySelectorAll(skipSel));
  const skipVisible = skipLinks.some(el => {
    const t = (el.textContent || '').trim();
    return t.includes('본문') || t.includes('바로가기') || t.toLowerCase().includes('skip');
  });
  const govBanner = /공식\\s*전자정부|대한민국\\s*공식|\\.go\\.kr/i.test(bodyText);
  const header = document.querySelector('header, [role="banner"], .krds-header, #header');
  const nav = document.querySelector('nav, [role="navigation"], .krds-gnb, .gnb');
  const footer = document.querySelector('footer, [role="contentinfo"], .krds-footer');
  const footerText = footer ? (footer.innerText || '') : '';
  const footerOk = footer && (/©|copyright|저작권|문의|연락/i.test(footerText));
  const h1 = document.querySelector('h1');
  const breadcrumb = document.querySelector('[aria-label*="breadcrumb" i], .breadcrumb, .krds-breadcrumb, nav.breadcrumb');
  const krdsTokens = Array.from(document.styleSheets).some(ss => {
    try {
      return Array.from(ss.cssRules || []).some(r => /--krds-/i.test(r.cssText || ''));
    } catch (e) { return false; }
  }) || /--krds-[a-z0-9-]+/i.test(html);
  const krdsComponents = document.querySelector('[class*="krds-btn"], [class*="krds-button"], [class*="krds-input"], [class*="krds-modal"], .krds') !== null;
  const displaySettings = /글자.*화면|화면.*설정|display.*setting|font.*size/i.test(bodyText)
    || document.querySelector('[class*="display-setting"], [class*="font-size"], .krds-display') !== null;
  const viewport = document.querySelector('meta[name="viewport"]');
  const viewportOk = viewport && /width=device-width/i.test(viewport.getAttribute('content') || '');
  return {
    govBanner,
    skipVisible,
    header: !!header,
    nav: !!nav,
    footerOk,
    h1: !!h1,
    breadcrumb: !!breadcrumb,
    krdsTokens: krdsTokens || hasKrdsClass,
    krdsComponents: krdsComponents || hasKrdsClass,
    displaySettings,
    viewportOk: !!viewportOk,
    hasKrdsClass,
  };
}
"""


def _runtime_checks() -> dict[str, Callable[[dict[str, Any]], tuple[str, str] | None]]:
    """Return check_key -> (status, message) if failing; None if pass."""

    def fail(status: str, msg: str) -> tuple[str, str]:
        return status, msg

    return {
        "gov_official_banner": lambda d: (
            None
            if d.get("govBanner")
            else fail("review", "공식 전자정부 누리집 안내 문구가 보이지 않습니다.")
        ),
        "skip_link": lambda d: (
            None
            if d.get("skipVisible")
            else fail("fail", "본문 바로가기(건너뛰기) 링크를 찾을 수 없습니다.")
        ),
        "header_gnb_structure": lambda d: (
            None
            if d.get("header") and d.get("nav")
            else fail(
                "review",
                "header/banner 또는 nav/GNB landmark가 부족합니다."
                if not d.get("header")
                else "전역 내비게이션(nav)이 보이지 않습니다.",
            )
        ),
        "footer_structure": lambda d: (
            None if d.get("footerOk") else fail("review", "footer(contentinfo) 또는 연락처·저작권 영역이 부족합니다.")
        ),
        "page_title_breadcrumb": lambda d: (
            None
            if d.get("h1") or d.get("breadcrumb")
            else fail("review", "h1 페이지 제목 또는 breadcrumb이 없습니다.")
        ),
        "krds_design_tokens": lambda d: (
            None
            if d.get("krdsTokens")
            else fail("review", "KRDS design token(--krds-*) 또는 krds 클래스 사용 흔적이 없습니다.")
        ),
        "krds_component_classes": lambda d: (
            None
            if d.get("krdsComponents") or d.get("hasKrdsClass")
            else fail("review", "KRDS 컴포넌트 클래스(krds-*)가 감지되지 않습니다.")
        ),
        "text_display_settings": lambda d: (
            None
            if d.get("displaySettings")
            else fail("review", "글자·화면 표시 설정 UI가 감지되지 않습니다.")
        ),
        "viewport_meta": lambda d: (
            None if d.get("viewportOk") else fail("fail", "viewport meta(width=device-width)가 없거나 올바르지 않습니다.")
        ),
    }


def _evaluate_runtime(page) -> dict[str, Any]:
    return page.evaluate(RUNTIME_CHECK_SCRIPT)


def attach_krds_runtime_findings(
    page,
    *,
    state_id: str,
    state_label: str,
    state_description: str,
    findings: list[dict[str, Any]],
    include_krds: bool = True,
) -> None:
    if not include_krds:
        return
    try:
        data = _evaluate_runtime(page)
    except Exception as e:
        findings.append(
            {
                "id": uuid.uuid4().hex[:12],
                "target": "screen",
                "location": state_id,
                "rule_id": "UX-KRDS-2.1",
                "category": "uiux",
                "status": "not_scanned",
                "severity": "info",
                "message": f"KRDS/UI·UX 런타임 검사 실패: {e}",
                "state_id": state_id,
                "state_label": state_label,
                "state_description": state_description,
            }
        )
        return

    checks = _runtime_checks()
    seen_rules: set[str] = set()
    for rule in load_krds_uiux_rules():
        if rule.get("automatable") not in ("auto", "semi"):
            continue
        rid = rule["id"]
        if rid in seen_rules:
            continue
        for check_key in rule.get("runtime_checks") or []:
            fn = checks.get(check_key)
            if not fn:
                continue
            result = fn(data)
            seen_rules.add(rid)
            if result is None:
                findings.append(
                    {
                        "id": uuid.uuid4().hex[:12],
                        "target": "screen",
                        "location": state_id,
                        "rule_id": rid,
                        "category": "uiux",
                        "status": "pass",
                        "severity": "info",
                        "message": f"[{state_label}] {rule['title']} — 자동 검사 통과",
                        "fix": rule.get("fix_hint", ""),
                        "krds_ref": rule.get("krds_ref", ""),
                        "state_id": state_id,
                        "state_label": state_label,
                        "state_description": state_description,
                    }
                )
            else:
                status, msg = result
                sev = rule.get("severity_default", "warning")
                findings.append(
                    {
                        "id": uuid.uuid4().hex[:12],
                        "target": "screen",
                        "location": state_id,
                        "rule_id": rid,
                        "category": "uiux",
                        "status": status,
                        "severity": sev,
                        "message": f"[{state_label}] {msg}",
                        "fix": rule.get("fix_hint", ""),
                        "krds_ref": rule.get("krds_ref", ""),
                        "state_id": state_id,
                        "state_label": state_label,
                        "state_description": state_description,
                    }
                )
            break


def scan_krds_static_files(scanned_files: dict[str, str]) -> list[Finding]:
    """scanned_files: rel path -> file content."""
    findings: list[Finding] = []
    check_map = rules_by_static_check()
    layout_content = scanned_files.get("app/layout.tsx", "")

    def add(rule_id: str, location: str, status: str, severity: str, message: str, fix: str) -> None:
        rule = next((r for r in load_krds_uiux_rules() if r["id"] == rule_id), None)
        findings.append(
            Finding(
                id=_static_fid(),
                target="source",
                location=location,
                rule_id=rule_id,
                category="uiux",
                status=status,
                severity=severity,
                message=message,
                fix=fix or (rule.get("fix_hint", "") if rule else ""),
            )
        )

    if "skip_link_markup" in check_map:
        rid = check_map["skip_link_markup"][0]["id"]
        combined = "\n".join(scanned_files.values())
        if re.search(r'href="#(main|contents|content)"', combined) or "본문" in combined and "바로가기" in combined:
            add(rid, "source", "pass", "info", "소스에 본문 바로가기 링크 흔적이 있습니다.", "")
        else:
            add(
                rid,
                "app/layout.tsx",
                "review",
                "warning",
                "소스에서 본문 바로가기(skip) 링크를 찾지 못했습니다.",
                check_map["skip_link_markup"][0].get("fix_hint", ""),
            )

    if "krds_header_markup" in check_map:
        rid = check_map["krds_header_markup"][0]["id"]
        combined = "\n".join(scanned_files.values())
        if re.search(r"<header|role=[\"']banner|krds-header", combined, re.I):
            add(rid, "source", "pass", "info", "소스에 header/banner 마크업이 있습니다.", "")
        else:
            add(
                rid,
                "app/layout.tsx",
                "review",
                "warning",
                "소스에서 header/banner 또는 krds-header를 찾지 못했습니다.",
                check_map["krds_header_markup"][0].get("fix_hint", ""),
            )

    if "krds_token_import" in check_map:
        rid = check_map["krds_token_import"][0]["id"]
        if re.search(r"krds|--krds-", layout_content, re.I) or re.search(
            r"krds", "\n".join(scanned_files.values()), re.I
        ):
            add(rid, "source", "pass", "info", "소스에 KRDS/token 참조가 있습니다.", "")
        else:
            add(
                rid,
                "app/layout.tsx",
                "review",
                "info",
                "소스에서 KRDS CSS/token import를 찾지 못했습니다.",
                check_map["krds_token_import"][0].get("fix_hint", ""),
            )

    if "krds_class_in_source" in check_map:
        rid = check_map["krds_class_in_source"][0]["id"]
        combined = "\n".join(scanned_files.values())
        if re.search(r"krds[-_]", combined, re.I):
            add(rid, "source", "pass", "info", "소스에 krds- 클래스/식별자가 있습니다.", "")
        else:
            add(
                rid,
                "source",
                "review",
                "info",
                "소스에서 krds- 컴포넌트 클래스를 찾지 못했습니다.",
                check_map["krds_class_in_source"][0].get("fix_hint", ""),
            )

    if "viewport_meta_tag" in check_map:
        rid = check_map["viewport_meta_tag"][0]["id"]
        if layout_content and re.search(
            r'name=["\']viewport["\'].*width=device-width|viewport.*width=device-width',
            layout_content,
            re.I | re.S,
        ):
            add(rid, "app/layout.tsx", "pass", "info", "layout에 viewport meta가 있습니다.", "")
        elif layout_content:
            add(
                rid,
                "app/layout.tsx",
                "fail",
                "warning",
                "app/layout.tsx에 width=device-width viewport meta가 없습니다.",
                check_map["viewport_meta_tag"][0].get("fix_hint", ""),
            )

    return findings


def append_krds_manual_findings(
    findings: list[dict[str, Any]],
    *,
    location: str,
    target: str = "source",
) -> None:
    existing = {f.get("rule_id") for f in findings}
    for rule in load_krds_uiux_rules():
        if rule.get("automatable") != "manual":
            continue
        rid = rule["id"]
        if rid in existing:
            continue
        findings.append(
            {
                "id": uuid.uuid4().hex[:12],
                "target": target,
                "location": location,
                "rule_id": rid,
                "category": "uiux",
                "status": "manual",
                "severity": rule.get("severity_default", "info"),
                "message": f"{rule['title']} — 수동 확인: {rule.get('description', '')}",
                "fix": rule.get("fix_hint", "체크리스트에 따라 수동 점검 후 기록하세요."),
                "krds_ref": rule.get("krds_ref", ""),
                "review_state_ids": list(rule.get("review_state_ids") or []),
                "review_hint": rule.get("review_hint", ""),
            }
        )
