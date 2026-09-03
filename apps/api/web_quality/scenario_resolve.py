"""통합 화면 시나리오 resolver — 소스 ZIP / dev URL / Playwright fallback."""
from __future__ import annotations

from typing import Any

from web_quality.java_scenario_extract import extract_java_zip_scenarios
from web_quality.o2_spa_scenario_extract import (
    extract_o2_spa_from_base_url,
    extract_o2_spa_from_zip,
    menu_candidate_count,
)
from web_quality.presets.ipms_online import (
    IPMS_DEFAULT_BASE,
    build_ipms_candidates,
    parse_ipms_access_tiers,
)
from web_quality.scenario_extract import ScenarioCandidate


def _filter_by_access(candidates: list[ScenarioCandidate], access: str) -> list[ScenarioCandidate]:
    tiers = parse_ipms_access_tiers(access)
    return [c for c in candidates if getattr(c, "access", "public") in tiers]


def _payload_from_candidates(
    *,
    candidates: list[ScenarioCandidate],
    method: str,
    target: str,
    target_name: str,
    base_url: str,
    access: str,
    warnings: list[str],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    defaults = [
        c.state_id
        for c in candidates
        if c.selectable and getattr(c, "access", "public") != "auth"
    ]
    out: dict[str, Any] = {
        "ok": True,
        "method": method,
        "target": target,
        "target_name": target_name,
        "extractable": True,
        "access": access,
        "base_url": base_url,
        "candidates": [c.to_dict() for c in candidates],
        "defaults_selected": defaults,
        "warnings": warnings,
    }
    if extra:
        out["resolve_meta"] = extra
    return out


def _try_o2_zip(zip_bytes: bytes) -> tuple[list[ScenarioCandidate], list[str], dict[str, Any], str]:
    candidates, warnings, meta = extract_o2_spa_from_zip(zip_bytes)
    if menu_candidate_count(candidates) >= 1:
        return candidates, warnings, meta, "o2_spa_zip"
    return [], warnings, meta, ""


def _try_o2_url(base_url: str) -> tuple[list[ScenarioCandidate], list[str], dict[str, Any], str]:
    candidates, warnings, meta = extract_o2_spa_from_base_url(base_url)
    if menu_candidate_count(candidates) >= 1:
        return candidates, warnings, meta, "o2_spa_url"
    return [], warnings, meta, ""


def _try_java_zip(zip_bytes: bytes) -> dict[str, Any] | None:
    result = extract_java_zip_scenarios(zip_bytes)
    if not result.get("ok"):
        return None
    raw = result.get("candidates") or []
    stats = result.get("file_stats") or {}
    static_views = int(stats.get("static_views") or stats.get("views") or 0)
    if not raw and static_views <= 0:
        return None
    return result


def _legacy_ipms_fallback(access: str, base_url: str) -> dict[str, Any]:
    candidates = _filter_by_access(build_ipms_candidates(), access)
    warnings = [
        "MenuTree/Config 자동 추출 실패 — 내장 legacy 프리셋을 사용합니다.",
        "접속 URL 접근 또는 프론트 JS ZIP 업로드 후 「시나리오 새로고침」을 다시 시도하세요.",
    ]
    return _payload_from_candidates(
        candidates=candidates,
        method="legacy_fallback",
        target="ipms-online",
        target_name="전기사업정보시스템",
        base_url=base_url,
        access=access,
        warnings=warnings,
    )


def resolve_ipms_scenarios(
    *,
    base_url: str = "",
    access: str = "public,auth",
    zip_bytes: bytes | None = None,
    allow_playwright_fallback: bool = False,
    discover_fn=None,
) -> dict[str, Any]:
    """IPMS/O2 SPA — ZIP → dev URL → (optional) Playwright → legacy."""
    url = (base_url or IPMS_DEFAULT_BASE).strip()
    if not url.endswith("/"):
        url += "/"
    access_norm = ",".join(sorted(parse_ipms_access_tiers(access)))

    warnings: list[str] = []
    meta: dict[str, Any] = {}

    if zip_bytes:
        candidates, w, meta, method = _try_o2_zip(zip_bytes)
        warnings.extend(w)
        if method:
            filtered = _filter_by_access(candidates, access_norm)
            warnings.insert(0, f"프론트 JS ZIP에서 MenuTree 기반 시나리오 {menu_candidate_count(filtered)}개 추출.")
            return _payload_from_candidates(
                candidates=filtered,
                method=method,
                target="ipms-online",
                target_name="전기사업정보시스템",
                base_url=url,
                access=access_norm,
                warnings=warnings,
                extra=meta,
            )

    candidates, w, meta, method = _try_o2_url(url)
    warnings.extend(w)
    if method:
        filtered = _filter_by_access(candidates, access_norm)
        return _payload_from_candidates(
            candidates=filtered,
            method=method,
            target="ipms-online",
            target_name="전기사업정보시스템",
            base_url=url,
            access=access_norm,
            warnings=warnings,
            extra=meta,
        )

    if allow_playwright_fallback and discover_fn:
        discovered = discover_fn(page_url=url)
        if discovered.get("ok") and discovered.get("candidates"):
            discovered["method"] = "playwright"
            discovered["access"] = access_norm
            discovered["base_url"] = url
            discovered.setdefault("warnings", []).insert(
                0,
                "소스 추출 실패 — Playwright 링크 탐색 결과를 사용합니다 (SPA GNB 메뉴는 누락될 수 있음).",
            )
            return discovered

    return _legacy_ipms_fallback(access_norm, url)


def resolve_scenarios(
    *,
    extractor: str = "auto",
    target: str = "",
    base_url: str = "",
    access: str = "public,auth",
    zip_bytes: bytes | None = None,
    allow_playwright_fallback: bool = False,
    discover_fn=None,
) -> dict[str, Any]:
    """Unified resolver for internal QA."""
    ext = (extractor or "auto").strip().lower()
    tgt = (target or "").strip().lower()

    if tgt in ("java-upload", "java"):
        if not zip_bytes:
            return {"ok": False, "detail": "Java/ZIP 파일이 필요합니다.", "warnings": []}
        java_result = _try_java_zip(zip_bytes)
        if java_result:
            java_result["method"] = "java_zip"
            return java_result
        candidates, w, meta, method = _try_o2_zip(zip_bytes)
        if method:
            return _payload_from_candidates(
                candidates=candidates,
                method=method,
                target="java-upload",
                target_name="Java / O2 SPA ZIP",
                base_url=base_url or "",
                access=access,
                warnings=w + ["Java 매핑 없음 — O2 SPA(MenuTree) 추출 결과입니다."],
                extra=meta,
            )
        return {"ok": False, "detail": "ZIP에서 Java/JSP 또는 MenuTree.js를 찾지 못했습니다.", "warnings": []}

    if tgt in ("ipms-online", "ipms", "o2-spa") or ext == "o2_spa":
        return resolve_ipms_scenarios(
            base_url=base_url,
            access=access,
            zip_bytes=zip_bytes,
            allow_playwright_fallback=allow_playwright_fallback,
            discover_fn=discover_fn,
        )

    if zip_bytes and ext in ("auto", "java"):
        java_result = _try_java_zip(zip_bytes)
        if java_result:
            java_result["method"] = "java_zip"
            return java_result

    if zip_bytes and ext in ("auto", "o2_spa"):
        candidates, warnings, meta, method = _try_o2_zip(zip_bytes)
        if method:
            return _payload_from_candidates(
                candidates=candidates,
                method=method,
                target="o2-spa",
                target_name="O2 SPA",
                base_url=base_url or "",
                access=access,
                warnings=warnings,
                extra=meta,
            )

    if base_url and ext in ("auto", "o2_spa"):
        result = resolve_ipms_scenarios(
            base_url=base_url,
            access=access,
            zip_bytes=None,
            allow_playwright_fallback=allow_playwright_fallback,
            discover_fn=discover_fn,
        )
        if result.get("method") != "legacy_fallback":
            if tgt:
                result["target"] = tgt
            return result

    if allow_playwright_fallback and discover_fn and base_url:
        discovered = discover_fn(page_url=base_url)
        if discovered.get("ok"):
            discovered["method"] = "playwright"
            return discovered

    return {
        "ok": False,
        "detail": "시나리오를 추출하지 못했습니다. ZIP 업로드, dev URL, 또는 Playwright 탐색을 시도하세요.",
        "warnings": [],
    }
