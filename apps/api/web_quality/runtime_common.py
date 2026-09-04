from __future__ import annotations

import base64
import re
import uuid
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

from web_quality.catalog import axe_rule_to_egov, axe_rule_to_kwcag
from web_quality.fix_guides import resolve_finding_fix
from web_quality.krds_scanner import attach_krds_runtime_findings

AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"
MAX_ELEMENT_CAPTURES_PER_STATE = 3


@dataclass
class ScreenCoverage:
    state_id: str
    label: str
    scanned: bool
    reason: str = ""
    description: str = ""


@dataclass
class CaptureAsset:
    capture_id: str
    kind: str
    state_id: str
    label: str
    description: str
    filename: str
    data: bytes
    finding_id: str | None = None
    selector: str = ""

    def to_dict(self, *, include_data: bool = True) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.capture_id,
            "kind": self.kind,
            "state_id": self.state_id,
            "label": self.label,
            "description": self.description,
            "filename": self.filename,
            "finding_id": self.finding_id,
            "selector": self.selector,
        }
        if include_data and self.data:
            b64 = base64.b64encode(self.data).decode("ascii")
            out["data_base64"] = b64
            out["data_url"] = f"data:image/png;base64,{b64}"
        return out


@dataclass
class RuntimeScanResult:
    findings: list[dict[str, Any]] = field(default_factory=list)
    screen_coverage: list[ScreenCoverage] = field(default_factory=list)
    console_errors: list[str] = field(default_factory=list)
    captures: list[CaptureAsset] = field(default_factory=list)
    runtime_available: bool = True
    runtime_error: str = ""


def _fid() -> str:
    return uuid.uuid4().hex[:12]


def _axe_target_selector(target: Any) -> str:
    if not target:
        return ""
    if isinstance(target, str):
        return target
    if isinstance(target, list):
        parts: list[str] = []
        for item in target:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, list):
                inner = _axe_target_selector(item)
                if inner:
                    parts.append(inner)
        if not parts:
            return ""
        if len(parts) == 1:
            return parts[0]
        return " >> ".join(parts)
    return str(target)


def _finding_from_axe_violation(
    violation: dict[str, Any],
    state_id: str,
    *,
    state_label: str = "",
    state_description: str = "",
    screenshot_id: str | None = None,
    url_hint: str = "",
) -> dict[str, Any]:
    axe_id = violation.get("id", "")
    kwcag = axe_rule_to_kwcag(axe_id) or "8.2.1"
    egov = axe_rule_to_egov(axe_id) or kwcag
    nodes = violation.get("nodes") or []
    target = nodes[0].get("target", [""])[0] if nodes else ""
    desc = violation.get("description") or violation.get("help", axe_id)
    prefix = f"[{state_label}] " if state_label else ""
    location = f"{state_id} :: {target}" if state_id else str(target)
    if url_hint:
        location = f"{url_hint} :: {location}"
    help_url = str(violation.get("helpUrl") or "")
    fix_text, fix_url = resolve_finding_fix(
        axe_id=axe_id,
        rule_id=egov if egov.startswith(("WS", "WC", "WA")) else kwcag,
        existing_fix=help_url,
    )
    out: dict[str, Any] = {
        "id": _fid(),
        "target": "screen",
        "location": location,
        "rule_id": egov if egov.startswith(("WS", "WC", "WA")) else kwcag,
        "kwcag_id": kwcag,
        "category": "a11y",
        "status": "fail",
        "severity": "error" if violation.get("impact") in ("critical", "serious") else "warning",
        "message": f"{prefix}{violation.get('help', desc)}",
        "detail": desc,
        "fix": fix_text,
        "axe_id": axe_id,
        "state_id": state_id,
        "state_label": state_label,
        "state_description": state_description,
        "screenshot_id": screenshot_id,
    }
    if fix_url:
        out["fix_url"] = fix_url
    return out


def _run_axe_on_page(page) -> list[dict[str, Any]]:
    page.add_script_tag(url=AXE_CDN)
    results = page.evaluate(
        """
        async () => {
            if (typeof axe === 'undefined') return { violations: [], incomplete: [] };
            return await axe.run(document, {
                runOnly: {
                    type: 'tag',
                    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']
                }
            });
        }
        """
    )
    return results.get("violations") or []


def _capture_state_page(
    page,
    state_id: str,
    captures: list[CaptureAsset],
    *,
    label: str,
    description: str,
    filename_prefix: str = "screenshots",
) -> str | None:
    capture_id = _fid()
    filename = f"{filename_prefix}/{state_id}.png"
    try:
        data = page.screenshot(type="png", full_page=False)
        captures.append(
            CaptureAsset(
                capture_id=capture_id,
                kind="state",
                state_id=state_id,
                label=label,
                description=description,
                filename=filename,
                data=data,
            )
        )
        return capture_id
    except Exception:
        return None


def _capture_violation_elements(
    page,
    violations: list[dict[str, Any]],
    state_id: str,
    captures: list[CaptureAsset],
    findings: list[dict[str, Any]],
    *,
    state_label: str = "",
    state_description: str = "",
    state_capture_id: str | None = None,
    filename_prefix: str = "screenshots",
    url_hint: str = "",
) -> None:
    element_slots = MAX_ELEMENT_CAPTURES_PER_STATE

    for v in violations:
        finding = _finding_from_axe_violation(
            v,
            state_id,
            state_label=state_label,
            state_description=state_description,
            url_hint=url_hint,
        )
        nodes = v.get("nodes") or []
        selector = _axe_target_selector(nodes[0].get("target")) if nodes else ""

        if element_slots > 0 and selector:
            try:
                loc = page.locator(selector).first
                if loc.count():
                    data = loc.screenshot(type="png", timeout=5000)
                    capture_id = _fid()
                    safe_sel = re.sub(r"[^a-zA-Z0-9_-]+", "_", selector)[:40]
                    filename = (
                        f"{filename_prefix}/{state_id}_element_"
                        f"{MAX_ELEMENT_CAPTURES_PER_STATE - element_slots + 1}_{safe_sel}.png"
                    )
                    captures.append(
                        CaptureAsset(
                            capture_id=capture_id,
                            kind="element",
                            state_id=state_id,
                            label=state_label or state_id,
                            description=f"미흡 요소 — {v.get('help', v.get('id', ''))}",
                            filename=filename,
                            data=data,
                            finding_id=finding["id"],
                            selector=selector,
                        )
                    )
                    finding["screenshot_id"] = capture_id
                    element_slots -= 1
            except Exception:
                pass

        if not finding.get("screenshot_id") and state_capture_id:
            finding["screenshot_id"] = state_capture_id
        findings.append(finding)


def _attach_console_findings(console_errors: list[str], findings: list[dict[str, Any]]) -> None:
    if console_errors:
        for err in console_errors[:20]:
            findings.append(
                {
                    "id": _fid(),
                    "target": "screen",
                    "location": "page :: console",
                    "rule_id": "WC-2.1",
                    "category": "compat",
                    "status": "fail",
                    "severity": "error",
                    "message": f"JavaScript 콘솔 오류: {err[:500]}",
                    "fix": "브라우저 콘솔 오류를 수정하세요.",
                }
            )
    else:
        findings.append(
            {
                "id": _fid(),
                "target": "screen",
                "location": "page :: console",
                "rule_id": "WC-2.1",
                "category": "compat",
                "status": "pass",
                "severity": "info",
                "message": "JavaScript 콘솔 오류 없음",
                "fix": "",
            }
        )


def portal_login(page, base_url: str, password: str) -> None:
    login_url = urljoin(base_url.rstrip("/") + "/", "login")
    page.goto(login_url, wait_until="domcontentloaded", timeout=60000)
    page.fill('input[name="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle", timeout=60000)


def is_portal_like_url(url: str) -> bool:
    """MyPlatform 포털(localhost·Vercel) — PORTAL_PASSWORD /login 자동 로그인 대상."""
    try:
        host = (urlparse((url or "").strip()).hostname or "").lower()
    except Exception:
        return False
    if host in ("127.0.0.1", "localhost", "::1"):
        return True
    return host.endswith(".vercel.app")


_AUTH_COOKIE_RE = re.compile(r"session|auth|token|login|jsession|sid|sso|remember", re.I)


def _cookie_host_matches(cookie_domain: str, host: str) -> bool:
    dom = (cookie_domain or "").lstrip(".").lower()
    h = (host or "").lower()
    if not dom or not h:
        return False
    return h == dom or h.endswith(f".{dom}") or dom.endswith(h)


_ANALYTICS_COOKIE_RE = re.compile(r"^_ga|^_gid|^_gat|utm|fbp|gcl", re.I)


def has_auth_cookies(cookies: list[dict[str, Any]], host: str) -> bool:
    host_cookies: list[dict[str, Any]] = []
    for c in cookies:
        name = (c.get("name") or "").strip()
        if not name:
            continue
        if not _cookie_host_matches(str(c.get("domain") or ""), host):
            continue
        host_cookies.append(c)
        if _AUTH_COOKIE_RE.search(name):
            return True
    meaningful = [
        c
        for c in host_cookies
        if not _ANALYTICS_COOKIE_RE.search((c.get("name") or "").lower())
    ]
    return len(meaningful) >= 2


def looks_like_login_form(page) -> bool:
    """Playwright page — 로그인 폼(커스텀 비밀번호 입력 포함) 여부."""
    try:
        if page.locator('input[type="password"]:visible').count():
            return True
        if page.locator('input[autocomplete="current-password"]:visible').count():
            return True
        if page.locator(
            'input[name*="pass" i]:visible, input[id*="pass" i]:visible, '
            'input[placeholder*="비밀번호" i]:visible, input[placeholder*="password" i]:visible'
        ).count():
            return True
        user_visible = page.locator(
            'input[type="email"]:visible, input[type="text"]:visible, '
            'input[name*="user" i]:visible, input[name*="id" i]:visible, '
            'input[name*="login" i]:visible, input[id*="user" i]:visible'
        ).count()
        login_btn = page.locator(
            'button[type="submit"]:visible, input[type="submit"]:visible, '
            'button:has-text("로그인"):visible, button:has-text("Login"):visible'
        ).count()
        has_app_shell = page.locator(
            ".er-modeler, .app, main, [role='main'], #wrap, #container, .container, .gnb, .header"
        ).count()
        if user_visible > 0 and login_btn > 0 and has_app_shell == 0:
            return True
    except Exception:
        pass
    return False


def page_login_blocked(page) -> tuple[bool, str]:
    """Playwright page — 로그인·추가 인증 화면 여부 (외부 URL·포털 공통)."""
    try:
        if page.locator(".ui-dialog:visible, .pop-box.open-confirm:visible").count():
            return True, "추가 인증(2단계·공동인증서) — 자동 탐색 제외"
        if page.locator('[role="dialog"]:visible').count():
            txt = (page.locator('[role="dialog"]:visible').first.inner_text() or "")[:200]
            if any(k in txt for k in ("인증", "OTP", "2단계", "공동인증", "본인확인")):
                return True, "추가 인증 대화상자 — 자동 탐색 제외"
        if looks_like_login_form(page):
            return True, "로그인 화면 — 로그인 후 재탐색 필요"
    except Exception:
        pass
    return False, ""


def external_login(
    page,
    login_url: str,
    username: str,
    password: str,
    *,
    user_selector: str = "",
    password_selector: str = "",
    submit_selector: str = "",
) -> None:
    page.goto(login_url, wait_until="domcontentloaded", timeout=60000)
    user_sels = [s.strip() for s in (user_selector or "").split(",") if s.strip()] or [
        'input[name="username"]',
        'input[name="email"]',
        'input[name="user"]',
        'input[type="email"]',
        "#username",
        "#email",
    ]
    pass_sels = [s.strip() for s in (password_selector or "").split(",") if s.strip()] or [
        'input[type="password"]',
        'input[name="password"]',
        "#password",
    ]
    submit_sels = [s.strip() for s in (submit_selector or "").split(",") if s.strip()] or [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("로그인")',
        'button:has-text("Login")',
    ]

    filled_user = False
    for sel in user_sels:
        try:
            loc = page.locator(sel).first
            if loc.count():
                loc.fill(username, timeout=5000)
                filled_user = True
                break
        except Exception:
            continue
    if not filled_user:
        raise RuntimeError(f"로그인 사용자 입력 필드를 찾을 수 없습니다: {user_sels}")

    filled_pass = False
    for sel in pass_sels:
        try:
            loc = page.locator(sel).first
            if loc.count():
                loc.fill(password, timeout=5000)
                filled_pass = True
                break
        except Exception:
            continue
    if not filled_pass:
        raise RuntimeError(f"로그인 암호 입력 필드를 찾을 수 없습니다: {pass_sels}")

    clicked = False
    for sel in submit_sels:
        try:
            loc = page.locator(sel).first
            if loc.count():
                loc.click(timeout=5000)
                clicked = True
                break
        except Exception:
            continue
    if not clicked:
        page.keyboard.press("Enter")
    page.wait_for_load_state("networkidle", timeout=60000)


def scan_page_states(
    page,
    ui_states: list[dict[str, Any]],
    *,
    open_state_fn,
    filename_prefix: str = "screenshots",
    url_hint: str = "",
    on_progress=None,
    include_krds: bool = True,
) -> RuntimeScanResult:
    findings: list[dict[str, Any]] = []
    coverage: list[ScreenCoverage] = []
    captures: list[CaptureAsset] = []
    total = len(ui_states)

    for idx, state in enumerate(ui_states):
        sid = state["state_id"]
        label = state.get("label", sid)
        desc = state.get("description", "")
        if on_progress:
            on_progress(idx, total, label)
        ok, reason = open_state_fn(page, sid)
        if not ok:
            try:
                page.wait_for_timeout(2000)
            except Exception:
                pass
            ok, reason = open_state_fn(page, sid)
        if not ok:
            coverage.append(ScreenCoverage(sid, label, False, reason, desc))
            findings.append(
                {
                    "id": _fid(),
                    "target": "screen",
                    "location": sid,
                    "rule_id": "8.2.1",
                    "category": "a11y",
                    "status": "not_scanned",
                    "severity": "info",
                    "message": f"화면 상태 '{label}' 미실행: {reason}",
                    "detail": desc,
                    "fix": "해당 UI를 연 뒤 재진단하거나 수동 확인하세요.",
                    "state_id": sid,
                    "state_label": label,
                    "state_description": desc,
                }
            )
            continue

        coverage.append(ScreenCoverage(sid, label, True, "", desc))
        page.wait_for_timeout(300)
        state_capture_id = _capture_state_page(
            page,
            sid,
            captures,
            label=label,
            description=desc,
            filename_prefix=filename_prefix,
        )
        violations = _run_axe_on_page(page)

        if violations:
            _capture_violation_elements(
                page,
                violations,
                sid,
                captures,
                findings,
                state_label=label,
                state_description=desc,
                state_capture_id=state_capture_id,
                filename_prefix=filename_prefix,
                url_hint=url_hint,
            )
        else:
            findings.append(
                {
                    "id": _fid(),
                    "target": "screen",
                    "location": sid,
                    "rule_id": "8.2.1",
                    "category": "a11y",
                    "status": "pass",
                    "severity": "info",
                    "message": f"[{label}] axe 자동 검사 — 위반 없음",
                    "detail": desc,
                    "fix": "",
                    "state_id": sid,
                    "state_label": label,
                    "state_description": desc,
                    "screenshot_id": state_capture_id,
                }
            )

        attach_krds_runtime_findings(
            page,
            state_id=sid,
            state_label=label,
            state_description=desc,
            findings=findings,
            include_krds=include_krds,
        )

        if sid != ui_states[0]["state_id"]:
            try:
                page.keyboard.press("Escape")
                page.wait_for_timeout(400)
            except Exception:
                pass

    return RuntimeScanResult(
        findings=findings,
        screen_coverage=coverage,
        captures=captures,
        runtime_available=True,
    )
