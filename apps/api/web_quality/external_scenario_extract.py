"""외부 URL · 포털 앱 실시간 화면 시나리오 탐색 (Playwright)."""
from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

from web_quality.manifest import match_portal_target_from_url
from web_quality.runtime_common import external_login, is_portal_like_url, portal_login
from web_quality.runtime_env import _friendly_playwright_error, _launch_chromium
from web_quality.scenario_extract import ScenarioCandidate, extract_portal_wq_scenarios

MAX_LINK_SCENARIOS = 35
MAX_WQ_TARGET_SCENARIOS = 20
SKIP_HREF = re.compile(
    r"^(javascript:|mailto:|tel:|#|$)|logout|signout|sign-out|/api/",
    re.I,
)
LOGIN_PATH = re.compile(r"/login(?:/|$)|signin|sign-in|/auth(?:/|$)", re.I)
LOGIN_LABEL = re.compile(r"^\s*(로그인|login|sign\s*in)\s*$", re.I)


def _is_login_url(url: str) -> bool:
    try:
        path = (urlparse(url).path or "").lower()
    except Exception:
        return False
    return bool(LOGIN_PATH.search(path))


def _is_login_link(url: str, label: str) -> bool:
    if _is_login_url(url):
        return True
    return bool(LOGIN_LABEL.match((label or "").strip()))


def _origin(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


def _normalize_url(base: str, href: str) -> str | None:
    if not href or SKIP_HREF.search(href.strip()):
        return None
    full = urljoin(base, href.strip())
    p = urlparse(full)
    if p.scheme not in ("http", "https"):
        return None
    # drop fragment
    return urlunparse((p.scheme, p.netloc, p.path or "/", p.params, p.query, ""))


def _state_id_from_url(url: str) -> str:
    h = hashlib.sha1(url.encode()).hexdigest()[:10]
    return f"url_{h}"


def _state_id_from_target(target: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", target)[:40]
    return f"wq_{safe}"


def _detect_blockers(page) -> tuple[bool, str]:
    from web_quality.runtime_common import page_login_blocked

    return page_login_blocked(page)


def _is_portal_host(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return host in ("127.0.0.1", "localhost", "::1")


def _is_portal_like_entry(url: str) -> bool:
    """로컬·Vercel 등 이 플랫폼 포털 URL — manifest 하위 경로 목록 사용."""
    return is_portal_like_url(url)


def _is_portal_login_page(page) -> bool:
    url = page.url.lower()
    if "/login" in url:
        return True
    if page.locator('input[name="password"]').count() > 0:
        if page.locator(".er-modeler, .app, main").count() == 0:
            return True
    return False


def _establish_session(
    page,
    entry_url: str,
    *,
    need_login: bool,
    login_url: str,
    login_username: str,
    login_password: str,
    portal_password: str,
    login_user_selector: str,
    login_password_selector: str,
    login_submit_selector: str,
    storage_state: dict[str, Any] | None,
) -> tuple[bool, str]:
    if storage_state:
        return True, ""

    pw = (login_password or portal_password or "").strip()
    user = login_username.strip()
    lu = login_url.strip()

    if _is_portal_host(entry_url):
        if pw and not lu and not user:
            base = _origin(entry_url)
            try:
                portal_login(page, base, pw)
                return True, ""
            except Exception as e:
                return False, f"포털 로그인 실패: {e}"
        if need_login and not pw:
            return False, (
                "포털 로그인 필요 — 「③ 로그인 세션 자동 생성」을 실행하거나 "
                "API PORTAL_PASSWORD를 설정하세요."
            )
        return True, ""

    if not need_login:
        return True, ""

    if lu and user and pw:
        try:
            external_login(
                page,
                lu,
                user,
                pw,
                user_selector=login_user_selector,
                password_selector=login_password_selector,
                submit_selector=login_submit_selector,
            )
            return True, ""
        except Exception as e:
            return False, f"로그인 실패: {e}"

    return False, "로그인 세션이 필요합니다. 「로그인 창 띄움」으로 세션을 생성하거나 JSON을 업로드하세요."


def _merge_candidates(
    primary: list[ScenarioCandidate],
    extra: list[ScenarioCandidate],
) -> list[ScenarioCandidate]:
    by_id = {c.state_id: c for c in primary}
    for c in extra:
        if c.state_id not in by_id:
            by_id[c.state_id] = c
    return list(by_id.values())


def _collect_link_candidates(page, entry_url: str) -> list[tuple[str, str]]:
    origin = _origin(entry_url)
    raw: list[dict[str, str]] = page.evaluate(
        """() => {
        const out = [];
        for (const a of document.querySelectorAll('a[href]')) {
          const href = a.getAttribute('href') || '';
          const text = (a.innerText || a.textContent || '').trim().replace(/\\s+/g, ' ');
          if (text) out.push({ href, text: text.slice(0, 100) });
        }
        return out;
    }"""
    )
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for item in raw:
        norm = _normalize_url(entry_url, item.get("href", ""))
        if not norm or not norm.startswith(origin):
            continue
        if norm in seen:
            continue
        seen.add(norm)
        label = (item.get("text") or norm).strip() or norm
        if _is_login_link(norm, label):
            continue
        out.append((norm, label))
        if len(out) >= MAX_LINK_SCENARIOS:
            break
    return out


def _collect_wq_targets(page) -> list[tuple[str, str]]:
    raw: list[dict[str, str]] = page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-wq-target]')).map(el => ({
          target: el.getAttribute('data-wq-target') || '',
          label: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('data-wq-target') || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
        }))"""
    )
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for item in raw:
        t = (item.get("target") or "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        label = (item.get("label") or t).strip() or t
        out.append((t, label))
        if len(out) >= MAX_WQ_TARGET_SCENARIOS:
            break
    return out


def _probe_link(page, url: str, entry_url: str) -> tuple[bool, str]:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_selector("body", timeout=15000)
        page.wait_for_timeout(400)
        blocked, reason = _detect_blockers(page)
        if blocked:
            return False, reason
        final = page.url
        if _normalize_url(entry_url, final) != _normalize_url(entry_url, url):
            # redirected away — often login
            blocked2, reason2 = _detect_blockers(page)
            if blocked2:
                return False, reason2
        return True, ""
    except Exception as e:
        return False, str(e)[:120]


def _probe_wq_target(page, entry_url: str, target: str) -> tuple[bool, str, str]:
    """Returns ok, reason, ready_selector."""
    try:
        page.goto(entry_url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("body", timeout=20000)
        page.wait_for_timeout(500)
        blocked, reason = _detect_blockers(page)
        if blocked:
            return False, reason, ""
        sel = f'[data-wq-target="{target}"]'
        loc = page.locator(sel).first
        if not loc.count():
            return False, "요소 없음", ""
        loc.click(timeout=10000)
        page.wait_for_timeout(600)
        state_sel = f'[data-wq-state="{target}"]'
        if page.locator(state_sel).count():
            return True, "", state_sel
        if page.locator('[role="dialog"]:visible, .modal:visible, [data-wq-state]').count():
            rs = "[data-wq-state]" if page.locator("[data-wq-state]").count() else '[role="dialog"]:visible'
            return True, "", rs
        blocked2, reason2 = _detect_blockers(page)
        if blocked2:
            return False, reason2, ""
        return True, "", "body"
    except Exception as e:
        return False, str(e)[:120], ""


def _discover_via_menutree(
    entry: str,
    *,
    need_login: bool,
    storage_state: dict[str, Any] | None,
    progress_job_id: str | None,
) -> dict[str, Any] | None:
    from web_quality.job_progress import update_job
    from web_quality.o2_spa_scenario_extract import extract_o2_spa_from_base_url, menu_candidate_count

    def prog(pct: int, message: str, step_label: str = "MenuTree") -> None:
        if progress_job_id:
            update_job(
                progress_job_id,
                pct=pct,
                message=message,
                step_label=step_label,
            )

    prog(5, "MenuTree.js 확인…")
    candidates, warnings, meta = extract_o2_spa_from_base_url(entry)
    if menu_candidate_count(candidates) < 1:
        return None

    has_session = bool(storage_state) or need_login
    menu_n = menu_candidate_count(candidates)
    prog(100, f"MenuTree 시나리오 {menu_n}건", "완료")

    out_warnings = [
        f"O2 SPA MenuTree.js에서 GNB 메뉴 시나리오 {menu_n}건 추출.",
        *warnings,
    ]
    if not has_session:
        out_warnings.append(
            "로그인 메뉴는 목록에 표시되며, 세션 생성 전까지 선택·미리보기가 비활성화됩니다."
        )
    else:
        out_warnings.append("로그인·세션 기준으로 공개·권한 메뉴를 포함합니다.")

    selectable = [c for c in candidates if c.selectable]
    defaults = [
        c.state_id
        for c in selectable
        if c.recommended and (c.access or "public").lower() != "auth"
    ]
    if not defaults:
        defaults = [c.state_id for c in selectable if c.recommended]

    return {
        "ok": True,
        "method": "o2_spa_url",
        "target": "external",
        "target_name": "외부 URL",
        "extractable": True,
        "page_url": entry,
        "need_login": need_login,
        "candidates": [c.to_dict() for c in candidates],
        "defaults_selected": defaults,
        "warnings": out_warnings,
        "resolve_meta": meta,
    }


def _portal_manifest_link_items(entry_url: str) -> list[dict[str, Any]]:
    try:
        from perf_test.portal_urls import list_portal_urls
    except ImportError:
        return []
    origin = _origin(entry_url)
    payload = list_portal_urls()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for it in payload.get("items") or []:
        path = (it.get("path") or "/").strip() or "/"
        full = urljoin(origin.rstrip("/") + "/", path.lstrip("/"))
        norm = _normalize_url(entry_url, full) or full
        if norm in seen:
            continue
        seen.add(norm)
        out.append(
            {
                "url": norm,
                "label": it.get("name", path),
                "path": path,
                "requires_auth": bool(it.get("requires_auth")),
                "recommended": bool(it.get("recommended")),
            }
        )
    return out


def _resolve_include_links(entry: str, include_urls: list[str] | None) -> list[tuple[str, str]] | None:
    if not include_urls:
        return None
    origin = _origin(entry)
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw in include_urls:
        s = (raw or "").strip()
        if not s:
            continue
        if s.startswith("/"):
            full = urljoin(origin.rstrip("/") + "/", s.lstrip("/"))
        elif s.startswith("http://") or s.startswith("https://"):
            full = s
        else:
            full = urljoin(origin.rstrip("/") + "/", s)
        norm = _normalize_url(entry, full)
        if not norm or not norm.startswith(origin) or norm in seen:
            continue
        seen.add(norm)
        path = urlparse(norm).path or "/"
        label = path if path != "/" else "시작 페이지"
        out.append((norm, label))
    return out


def preview_external_links(
    page_url: str,
    *,
    need_login: bool = False,
    login_url: str = "",
    login_username: str = "",
    login_password: str = "",
    portal_password: str = "",
    login_user_selector: str = "",
    login_password_selector: str = "",
    login_submit_selector: str = "",
    storage_state: dict[str, Any] | None = None,
    progress_job_id: str | None = None,
) -> dict[str, Any]:
    from web_quality.job_progress import update_job

    def prog(pct: int, message: str, step_label: str = "") -> None:
        if progress_job_id:
            update_job(
                progress_job_id,
                pct=pct,
                message=message,
                step_label=step_label or message,
            )

    entry = (page_url or "").strip()
    if not entry.startswith("http://") and not entry.startswith("https://"):
        return {"ok": False, "detail": "URL은 http:// 또는 https:// 로 시작해야 합니다."}

    by_url: dict[str, dict[str, Any]] = {}

    if _is_portal_like_entry(entry):
        prog(8, "포털 manifest 경로 목록…", "manifest")
        for item in _portal_manifest_link_items(entry):
            by_url[item["url"]] = item

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        if by_url:
            links = sorted(by_url.values(), key=lambda x: ((x.get("path") or x["url"]) != "/", x.get("path") or ""))
            return {
                "ok": True,
                "source": "portal_manifest",
                "entry": entry,
                "links": links,
                "defaults_selected": [x["url"] for x in links if x.get("recommended")],
            }
        return {"ok": False, "detail": "playwright 미설치"}

    try:
        prog(12, "Chromium 실행 중…", "준비")
        with sync_playwright() as p:
            browser = _launch_chromium(p)
            ctx: dict[str, Any] = {"viewport": {"width": 1280, "height": 900}}
            if storage_state:
                ctx["storage_state"] = storage_state
            context = browser.new_context(**ctx)
            page = context.new_page()

            ok_sess, sess_err = _establish_session(
                page,
                entry,
                need_login=need_login or bool(storage_state),
                login_url=login_url,
                login_username=login_username,
                login_password=login_password,
                portal_password=portal_password,
                login_user_selector=login_user_selector,
                login_password_selector=login_password_selector,
                login_submit_selector=login_submit_selector,
                storage_state=storage_state,
            )
            if not ok_sess:
                browser.close()
                return {"ok": False, "detail": sess_err}

            prog(35, "진입 페이지에서 링크 수집…", "링크")
            page.goto(entry, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("body", timeout=30000)
            page.wait_for_timeout(500)

            entry_norm = _normalize_url(entry, entry) or entry
            if entry_norm not in by_url:
                by_url[entry_norm] = {
                    "url": entry_norm,
                    "label": "시작 페이지",
                    "path": urlparse(entry_norm).path or "/",
                    "requires_auth": False,
                    "recommended": True,
                }

            for link_url, link_label in _collect_link_candidates(page, entry):
                if link_url in by_url:
                    continue
                by_url[link_url] = {
                    "url": link_url,
                    "label": link_label[:80] or link_url,
                    "path": urlparse(link_url).path or "/",
                    "requires_auth": False,
                    "recommended": False,
                }

            browser.close()
    except Exception as e:
        if by_url:
            links = sorted(by_url.values(), key=lambda x: ((x.get("path") or x["url"]) != "/", x.get("path") or ""))
            return {
                "ok": True,
                "source": "portal_manifest",
                "entry": entry,
                "links": links,
                "warnings": [_friendly_playwright_error(str(e))],
                "defaults_selected": [x["url"] for x in links if x.get("recommended")],
            }
        return {"ok": False, "detail": _friendly_playwright_error(str(e))}

    links = sorted(by_url.values(), key=lambda x: ((x.get("path") or x["url"]) != "/", x.get("path") or ""))
    defaults = [x["url"] for x in links if x.get("recommended")]
    if not defaults and links:
        defaults = [links[0]["url"]]
    prog(100, f"하위 URL {len(links)}건", "완료")
    return {
        "ok": True,
        "source": "portal_manifest" if _is_portal_like_entry(entry) else "page_links",
        "entry": entry,
        "links": links,
        "defaults_selected": defaults,
    }


def discover_external_scenarios(
    page_url: str,
    *,
    need_login: bool = False,
    login_url: str = "",
    login_username: str = "",
    login_password: str = "",
    portal_password: str = "",
    login_user_selector: str = "",
    login_password_selector: str = "",
    login_submit_selector: str = "",
    storage_state: dict[str, Any] | None = None,
    progress_job_id: str | None = None,
    include_urls: list[str] | None = None,
) -> dict[str, Any]:
    from web_quality.job_progress import update_job

    def prog(pct: int, message: str, step_label: str = "") -> None:
        if progress_job_id:
            update_job(
                progress_job_id,
                pct=pct,
                message=message,
                step_label=step_label or "탐색",
            )

    entry = (page_url or "").strip()
    if not entry.startswith("http://") and not entry.startswith("https://"):
        return {"ok": False, "detail": "URL은 http:// 또는 https:// 로 시작해야 합니다."}

    menutree = _discover_via_menutree(
        entry,
        need_login=need_login,
        storage_state=storage_state,
        progress_job_id=progress_job_id,
    )
    if menutree:
        return menutree

    portal_cfg = match_portal_target_from_url(entry)
    warnings: list[str] = []
    candidates: list[ScenarioCandidate] = []

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"ok": False, "detail": "playwright 미설치"}

    try:
        prog(5, "Chromium 실행 중…", "준비")
        with sync_playwright() as p:
            browser = _launch_chromium(p)
            ctx: dict[str, Any] = {"viewport": {"width": 1280, "height": 900}}
            if storage_state:
                ctx["storage_state"] = storage_state
            context = browser.new_context(**ctx)
            page = context.new_page()

            prog(10, "로그인·세션 확인…", "세션")
            ok_sess, sess_err = _establish_session(
                page,
                entry,
                need_login=need_login or bool(storage_state) or bool(portal_cfg),
                login_url=login_url,
                login_username=login_username,
                login_password=login_password,
                portal_password=portal_password,
                login_user_selector=login_user_selector,
                login_password_selector=login_password_selector,
                login_submit_selector=login_submit_selector,
                storage_state=storage_state,
            )
            if not ok_sess:
                browser.close()
                return {"ok": False, "detail": sess_err}

            prog(18, "진입 페이지 로드…", "진입")
            page.goto(entry, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("body", timeout=30000)

            ready_sel = (portal_cfg or {}).get("ready_selector") if portal_cfg else None
            if ready_sel:
                try:
                    page.wait_for_selector(ready_sel, timeout=45000)
                except Exception:
                    pass
            elif portal_cfg:
                page.wait_for_timeout(1200)
            else:
                page.wait_for_timeout(600)

            pw_env = (portal_password or "").strip()
            if portal_cfg and _is_portal_login_page(page) and pw_env:
                prog(22, "포털 로그인…", "로그인")
                try:
                    portal_login(page, _origin(entry), pw_env)
                    page.goto(entry, wait_until="domcontentloaded", timeout=60000)
                    if ready_sel:
                        page.wait_for_selector(ready_sel, timeout=45000)
                except Exception as e:
                    browser.close()
                    return {"ok": False, "detail": f"포털 로그인 실패: {e}"}

            entry_blocked, entry_reason = _detect_blockers(page)
            entry_ok = not entry_blocked
            sid0 = _state_id_from_url(entry)
            entry_norm = _normalize_url(entry, entry) or entry
            selected_links = _resolve_include_links(entry, include_urls)
            include_only = selected_links is not None

            if not include_only or entry_norm in {u for u, _ in selected_links or []}:
                candidates.append(
                    ScenarioCandidate(
                        state_id=sid0,
                        label="시작 페이지",
                        description=entry,
                        kind="page",
                        recommended=True,
                        selectable=entry_ok,
                        skip_reason=entry_reason if not entry_ok else "",
                        confidence="high",
                        source_files=[],
                        evidence=entry,
                        ready_selector=ready_sel or "body",
                        steps=[{"action": "goto", "url": entry}],
                    )
                )

            if not include_only:
                prog(30, "포털·다이얼로그 대상 탐색…", "UI")
                wq_targets = _collect_wq_targets(page)
                total_wq = max(len(wq_targets), 1)
                for idx, (target, label) in enumerate(wq_targets):
                    pct = 30 + int(25 * (idx + 1) / total_wq)
                    prog(pct, f"다이얼로그 확인 ({idx + 1}/{len(wq_targets) or 1})…", label[:40])
                    ok, reason, ready = _probe_wq_target(page, entry, target)
                    candidates.append(
                        ScenarioCandidate(
                            state_id=_state_id_from_target(target),
                            label=label,
                            description=f"data-wq-target={target}",
                            kind="dialog",
                            recommended=ok,
                            selectable=ok,
                            skip_reason=reason if not ok else "",
                            confidence="high" if ok else "low",
                            source_files=[],
                            evidence=f'[data-wq-target="{target}"]',
                            ready_selector=ready or f'[data-wq-state="{target}"]',
                            steps=[
                                {"action": "goto", "url": entry},
                                {"action": "wait", "selector": ready_sel or "body", "timeout_ms": 20000},
                                {"action": "click", "selector": f'[data-wq-target="{target}"]'},
                                {
                                    "action": "wait",
                                    "selector": ready or f'[data-wq-state="{target}"]',
                                    "timeout_ms": 15000,
                                },
                            ],
                        )
                    )

                if portal_cfg:
                    prog(58, "포털 앱 소스 시나리오 병합…", portal_cfg.get("name", ""))
                    source_cands = extract_portal_wq_scenarios(portal_cfg["id"], entry)
                    total_src = max(len(source_cands), 1)
                    verified: list[ScenarioCandidate] = []
                    for idx, sc in enumerate(source_cands):
                        pct = 58 + int(12 * (idx + 1) / total_src)
                        if sc.kind == "dialog" and sc.evidence.startswith("[data-wq-target"):
                            target = sc.evidence.split('"')[1]
                            prog(pct, f"소스 시나리오 검증 ({idx + 1}/{len(source_cands)})…", sc.label)
                            ok, reason, ready = _probe_wq_target(page, entry, target)
                            sc.selectable = ok
                            sc.recommended = ok
                            sc.skip_reason = reason if not ok else ""
                            if ready:
                                sc.ready_selector = ready
                        verified.append(sc)
                    candidates = _merge_candidates(candidates, verified)
                    warnings.append(
                        f"포털 앱 「{portal_cfg.get('name', portal_cfg['id'])}」 — "
                        "소스 data-wq-target + 실시간 탐색 병합."
                    )

            prog(72, "링크 수집…", "링크")
            if include_only:
                links = selected_links or []
                prog(74, f"선택 URL {len(links)}건 확인…", "선택")
            else:
                links = _collect_link_candidates(page, entry)
            total_links = max(len(links), 1)
            for idx, (link_url, link_label) in enumerate(links):
                if _normalize_url(entry, link_url) == entry_norm:
                    continue
                pct = 72 + int(23 * (idx + 1) / total_links)
                prog(pct, f"링크 확인 ({idx + 1}/{len(links) or 1})…", link_label[:40])
                ok, reason = _probe_link(page, link_url, entry)
                if not ok:
                    continue
                candidates.append(
                    ScenarioCandidate(
                        state_id=_state_id_from_url(link_url),
                        label=link_label[:80] or link_url,
                        description=link_url,
                        kind="page",
                        recommended=True,
                        selectable=True,
                        skip_reason="",
                        confidence="medium",
                        source_files=[],
                        evidence=link_url,
                        ready_selector="body",
                        steps=[{"action": "goto", "url": link_url}],
                    )
                )

            browser.close()
    except Exception as e:
        return {"ok": False, "detail": _friendly_playwright_error(str(e))}

    prog(100, "탐색 완료", "완료")

    selectable = [c for c in candidates if c.selectable]
    if _is_portal_host(entry):
        warnings.append(
            "포털 앱 URL — 로그인 시 포털 암호만 입력하면 됩니다 (/login)."
        )

    defaults = [c.state_id for c in selectable if c.recommended]
    if sid0 in [c.state_id for c in selectable] and sid0 not in defaults:
        defaults.insert(0, sid0)

    return {
        "ok": True,
        "target": "external",
        "target_name": "외부 URL",
        "extractable": True,
        "page_url": entry,
        "need_login": need_login,
        "candidates": [c.to_dict() for c in candidates],
        "defaults_selected": defaults,
        "warnings": warnings,
    }


def validate_external_storage_session(
    base_url: str,
    storage_state: dict[str, Any],
) -> tuple[bool, str]:
    """Playwright storage_state로 외부 URL 접속 후 로그인·인증 화면 여부 확인."""
    from web_quality.runtime_common import has_auth_cookies, page_login_blocked

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False, "Playwright 미설치 — API 서버에서 playwright install chromium 실행"

    url = (base_url or "").strip()
    if not url:
        return False, "base_url이 필요합니다."

    host = (urlparse(url).hostname or "").lower()
    stored_cookies = storage_state.get("cookies") or []
    if not has_auth_cookies(stored_cookies, host):
        return False, "로그인 쿠키가 없습니다. Chromium에서 로그인을 완료한 뒤 다시 시도하세요."

    try:
        with sync_playwright() as p:
            browser = _launch_chromium(p)
            context = browser.new_context(
                viewport={"width": 1280, "height": 900},
                storage_state=storage_state,
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("body", timeout=30000)
            blocked = True
            reason = ""
            for _ in range(10):
                page.wait_for_timeout(500)
                blocked, reason = page_login_blocked(page)
                if not blocked:
                    break
            browser.close()
            if blocked:
                return False, reason or "로그인 화면 — 로그인 후 재탐색 필요"
            return True, ""
    except Exception as e:
        return False, _friendly_playwright_error(str(e))
