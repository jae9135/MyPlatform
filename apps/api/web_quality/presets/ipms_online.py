"""전기사업정보시스템(ipms.online) 화면 시나리오 프리셋.

O2 SPA — MenuTree.js / O2Main.js 분석 기준:
- public: 알림마당(nob), 이용안내(usg), 통계분석(stats) + 홈/로그인 화면
- auth: 민원신청(cva), 주민수용성(rea), 내정보관리(myi) — 로그인·세션 필요
"""
from __future__ import annotations

from typing import Any

from web_quality.scenario_extract import ScenarioCandidate

IPMS_DEFAULT_BASE = "http://14.35.194.178:12000/ipms.online/"

# (group_label, ul_id, className, menu_name)
_NOB = (
    ("알림마당", "nob", "ntc", "공지사항"),
    ("알림마당", "nob", "cap", "양도양수 인가공고"),
    ("알림마당", "nob", "cpmsn", "법인 합병/분할 인가공고"),
    ("알림마당", "nob", "rpstr", "자료실"),
    ("알림마당", "nob", "qna", "Q&A"),
    ("알림마당", "nob", "faq", "FAQ"),
    ("알림마당", "nob", "gbs", "발전사업 관련사이트"),
    ("알림마당", "nob", "card", "카드뉴스"),
)
_USG = (
    ("이용안내", "usg", "gbi", "발전사업절차"),
    ("이용안내", "usg", "ebs", "시스템 안내"),
    ("이용안내", "usg", "ebi", "발전사업주요질의사항"),
)
_STATS = (
    ("통계분석", "stats", "public-map", "공개 주제도"),
    ("통계분석", "stats", "stats-dashboard", "통계 대시보드"),
    ("통계분석", "stats", "forecast-dashboard", "전망 대시보드"),
)
_CVA = (
    ("민원신청", "cva", "elbpa", "전기사업허가"),
    ("민원신청", "cva", "elbpc", "전기사업허가변경"),
    ("민원신청", "cva", "cspsda", "공사계획신고(인가)"),
    ("민원신청", "cva", "cspsdc", "공사계획신고(인가)변경"),
    ("민원신청", "cva", "elbsa", "사업개시신고"),
    ("민원신청", "cva", "cnasa", "사업양수인가"),
    ("민원신청", "cva", "cri", "제증명발급"),
    ("민원신청", "cva", "cpms", "법인합병분할인가"),
    ("민원신청", "cva", "sas", "주식취득인가"),
    ("민원신청", "cva", "bfad", "사업용시설인수신고"),
)
_REA = (
    ("주민수용성", "rea", "orp", "의견수렴공고"),
    ("주민수용성", "rea", "myo", "내 의견 관리"),
)
_MYI = (
    ("내정보관리", "myi", "mbm", "회원관리"),
    ("내정보관리", "myi", "cvp", "민원현황"),
    ("내정보관리", "myi", "agm", "대리인관리"),
    ("내정보관리", "myi", "cvhm", "민원접수 이력 관리"),
)


def _gnb_steps(group_label: str, ul_id: str, route_class: str) -> list[dict[str, Any]]:
    return [
        {"action": "wait", "selector": "#gnb .gnb-main-trigger", "timeout_ms": 30000},
        {"action": "click_has_text", "selector": ".gnb-main-trigger", "text": group_label},
        {"action": "wait", "selector": f"ul#{ul_id} a.{route_class}", "timeout_ms": 15000},
        {"action": "click", "selector": f"ul#{ul_id} a.{route_class}"},
        {"action": "wait", "selector": ".section-wrap", "timeout_ms": 45000},
    ]


def _menu_candidate(
    *,
    state_id: str,
    label: str,
    group_label: str,
    ul_id: str,
    route_class: str,
    access: str,
    recommended: bool,
) -> ScenarioCandidate:
    return ScenarioCandidate(
        state_id=state_id,
        label=label,
        description=f"{group_label} › {label} (비로그인 가능)" if access == "public" else f"{group_label} › {label} (로그인·권한 필요)",
        kind="page",
        recommended=recommended,
        selectable=True,
        confidence="high",
        source_files=["MenuTree.js"],
        evidence=f"GNB ul#{ul_id} a.{route_class}",
        ready_selector=".section-wrap",
        steps=_gnb_steps(group_label, ul_id, route_class),
        access=access,
    )


def build_ipms_candidates() -> list[ScenarioCandidate]:
    out: list[ScenarioCandidate] = []

    out.append(
        ScenarioCandidate(
            state_id="main_shell",
            label="홈 (GNB·푸터)",
            description="비로그인 메인 — skip link, GNB, footer",
            kind="page",
            recommended=True,
            selectable=True,
            confidence="high",
            source_files=["index.html"],
            evidence="O2 SPA shell",
            ready_selector="#container",
            steps=[
                {"action": "wait", "selector": "#gnb .gnb-main-trigger", "timeout_ms": 30000},
                {"action": "wait", "selector": "#footer", "timeout_ms": 10000},
                {"action": "wait", "selector": "#krds-skip-link a", "timeout_ms": 5000},
            ],
            access="public",
        )
    )
    out.append(
        ScenarioCandidate(
            state_id="login_form",
            label="로그인 화면",
            description="ID/PW 입력 폼 — 공개 (공동인증서 2단계는 제출 후 별도)",
            kind="page",
            recommended=True,
            selectable=True,
            confidence="high",
            source_files=["login/Login.js"],
            evidence="#userId #pswd",
            ready_selector="#userId",
            steps=[
                {"action": "wait", "selector": "#gnb .gnb-main-trigger", "timeout_ms": 30000},
                {"action": "click", "selector": "button.btn-login"},
                {"action": "wait", "selector": "#userId", "timeout_ms": 30000},
            ],
            access="public",
        )
    )

    pub_menus = [_NOB, _USG, _STATS]
    for menus in pub_menus:
        for group_label, ul_id, route_class, name in menus:
            out.append(
                _menu_candidate(
                    state_id=f"pub_{ul_id}_{route_class}",
                    label=name,
                    group_label=group_label,
                    ul_id=ul_id,
                    route_class=route_class,
                    access="public",
                    recommended=True,
                )
            )

    auth_menus = [_CVA, _REA, _MYI]
    for menus in auth_menus:
        for group_label, ul_id, route_class, name in menus:
            out.append(
                _menu_candidate(
                    state_id=f"auth_{ul_id}_{route_class}",
                    label=name,
                    group_label=group_label,
                    ul_id=ul_id,
                    route_class=route_class,
                    access="auth",
                    recommended=True,
                )
            )

    return out


def extract_ipms_scenarios(
    *,
    base_url: str = "",
    access: str = "public",
) -> dict[str, Any]:
    url = (base_url or IPMS_DEFAULT_BASE).strip()
    if not url.endswith("/"):
        url += "/"
    tier = (access or "public").strip().lower()
    if tier not in ("public", "auth"):
        tier = "public"

    all_c = build_ipms_candidates()
    candidates = [c for c in all_c if getattr(c, "access", "public") == tier]
    defaults = [c.state_id for c in candidates if c.recommended and c.selectable]

    warnings: list[str] = []
    if tier == "public":
        warnings.append(
            "비로그인 공개 메뉴(알림마당·이용안내·통계분석)와 홈·로그인 화면을 진단합니다."
        )
    else:
        warnings.append(
            "로그인 후 메뉴(민원신청·주민수용성·내정보관리)입니다. "
            "ID/PW만으로는 공동인증서 2단계가 필요할 수 있어 Playwright storage_state(JSON) 업로드를 권장합니다."
        )

    return {
        "ok": True,
        "target": "ipms-online",
        "target_name": "전기사업정보시스템",
        "extractable": True,
        "access": tier,
        "base_url": url,
        "candidates": [c.to_dict() for c in candidates],
        "defaults_selected": defaults,
        "warnings": warnings,
        "static_only_hint": "공개 HTML(shell) 정적 규칙은 런타임 없이도 fetch 가능합니다.",
    }
