"""Playwright dry-run: open selected web-quality scenarios without full scan."""



from __future__ import annotations



import json

from typing import Any



from web_quality.service import discover_external_scenarios_from_params

from web_quality.ipms_scanner import _goto_home, parse_storage_state

from web_quality.presets.ipms_online import IPMS_DEFAULT_BASE, extract_ipms_scenarios

from web_quality.runtime_env import _friendly_playwright_error, _launch_chromium

from web_quality.scenario_extract import parse_state_ids

from web_quality.java_scenario_extract import is_jsp_auto_modal

from web_quality.scenario_steps import IPMS_DIRECT_URL_MSG, is_java_direct_goto_page, open_state_by_steps





def _is_ipms_deploy_url(page_url: str) -> bool:
    text = (page_url or "").lower()
    return "ipms.online" in text


def _login_required_preview_items(
    runnable: list[str],
    by_id: dict[str, dict[str, Any]],
    items: list[dict[str, Any]],
    *,
    message: str,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    for sid in runnable:
        cand = by_id[sid]
        label = str(cand.get("label") or sid)
        items.append(
            {
                "state_id": sid,
                "label": label,
                "ok": False,
                "error": message,
                "url": "",
            }
        )
    total = len(items)
    ok_count = sum(1 for i in items if i.get("ok"))
    return {
        "ok": False,
        "errors": [message],
        "warnings": warnings or [],
        "items": items,
        "summary": {"ok": ok_count, "fail": total - ok_count, "total": total},
    }


def _resolve_ipms_storage(

    *,

    session_job_id: str,

    session_storage_bytes: bytes | None,

) -> dict[str, Any] | None:

    if session_job_id.strip():

        from web_quality.ipms_session import load_session_json



        return load_session_json(session_job_id.strip())

    if session_storage_bytes:

        return parse_storage_state(session_storage_bytes)

    return None





def _preview_ipms(

    *,

    page_url: str,

    state_ids: str | list | None,

    ipms_access: str,

    session_storage_bytes: bytes | None,

    session_job_id: str = "",

    candidates_override: list[dict[str, Any]] | None = None,

) -> dict[str, Any]:

    url = (page_url or IPMS_DEFAULT_BASE).strip()

    if not url.endswith("/"):

        url += "/"



    if candidates_override:

        all_candidates = [c for c in candidates_override if isinstance(c, dict)]

    else:

        payload = extract_ipms_scenarios(base_url=url, access=ipms_access or "public,auth")

        all_candidates = payload.get("candidates") or []



    by_id = {

        str(c.get("state_id")): c

        for c in all_candidates

        if isinstance(c, dict) and c.get("state_id")

    }

    selected = parse_state_ids(state_ids) or []

    if not selected:

        return {"ok": False, "errors": ["미리볼 시나리오를 1개 이상 선택하세요."], "items": []}



    storage = _resolve_ipms_storage(

        session_job_id=session_job_id,

        session_storage_bytes=session_storage_bytes,

    )



    items: list[dict[str, Any]] = []

    errors: list[str] = []

    warnings: list[str] = []

    runnable: list[str] = []



    for sid in selected:

        cand = by_id.get(sid)

        if not cand:

            items.append(

                {

                    "state_id": sid,

                    "label": sid,

                    "ok": False,

                    "error": "시나리오 정의 없음 — 화면 시나리오 목록과 추출 소스(접속 URL/ZIP)가 일치하는지 확인하세요.",

                    "url": "",

                }

            )

            continue

        label = str(cand.get("label") or sid)

        if not cand.get("selectable", True):

            items.append(

                {

                    "state_id": sid,

                    "label": label,

                    "ok": False,

                    "error": str(cand.get("skip_reason") or "검증 불가 시나리오"),

                    "url": "",

                }

            )

            continue

        access = str(cand.get("access") or "public").lower()

        if access == "auth" and not storage:

            items.append(

                {

                    "state_id": sid,

                    "label": label,

                    "ok": False,

                    "error": "로그인 세션 필요",

                    "url": "",

                }

            )

            continue

        runnable.append(sid)



    if not runnable and items:

        return {

            "ok": False,

            "errors": ["검증 가능한 시나리오가 없습니다."],

            "warnings": warnings,

            "items": items,

            "summary": {"ok": 0, "fail": len(items), "total": len(items)},

        }



    try:

        from playwright.sync_api import sync_playwright

    except ImportError:

        return {"ok": False, "errors": ["playwright 미설치"], "items": items}



    try:

        with sync_playwright() as p:

            browser = _launch_chromium(p)

            context = browser.new_context(

                viewport={"width": 1280, "height": 900},

                storage_state=storage,

            )

            page = context.new_page()

            if storage:

                try:

                    _goto_home(page, url)

                except Exception as e:

                    browser.close()

                    return {

                        "ok": False,

                        "errors": [_friendly_playwright_error(str(e))],

                        "items": items,

                    }

            else:

                try:

                    _goto_home(page, url)

                except Exception as e:

                    browser.close()

                    return {

                        "ok": False,

                        "errors": [_friendly_playwright_error(str(e))],

                        "items": items,

                    }



            for sid in runnable:

                cand = by_id[sid]

                label = str(cand.get("label") or sid)

                try:

                    if sid != "login_form":

                        try:

                            _goto_home(page, url)

                        except Exception:

                            pass

                    ok, reason = open_state_by_steps(page, cand, base_url=url)

                    items.append(

                        {

                            "state_id": sid,

                            "label": label,

                            "ok": ok,

                            "error": "" if ok else reason,

                            "url": page.url,

                        }

                    )

                except Exception as e:

                    items.append(

                        {

                            "state_id": sid,

                            "label": label,

                            "ok": False,

                            "error": _friendly_playwright_error(str(e)),

                            "url": page.url,

                        }

                    )

            browser.close()

    except Exception as e:

        errors.append(_friendly_playwright_error(str(e)))



    ok_n = sum(1 for i in items if i.get("ok"))

    fail_n = len(items) - ok_n

    return {

        "ok": fail_n == 0 and not errors,

        "errors": errors,

        "warnings": warnings,

        "items": items,

        "summary": {"ok": ok_n, "fail": fail_n, "total": len(items)},

    }





def _preview_external(

    *,

    page_url: str,

    state_ids: str | list | None,

    need_login: bool,

    login_url: str,

    login_username: str,

    login_password: str,

    portal_password: str,

    login_user_selector: str,

    login_password_selector: str,

    login_submit_selector: str,

    session_storage_bytes: bytes | None,

    session_job_id: str = "",

) -> dict[str, Any]:

    from web_quality.external_scanner import ExternalLoginConfig, _establish_session

    from web_quality.ipms_session import load_session_json



    url = page_url.strip()

    discovered = discover_external_scenarios_from_params(

        page_url=url,

        need_login=need_login,

        login_url=login_url,

        login_username=login_username,

        login_password=login_password,

        portal_password=portal_password,

        login_user_selector=login_user_selector,

        login_password_selector=login_password_selector,

        login_submit_selector=login_submit_selector,

        session_storage_bytes=session_storage_bytes,

        session_job_id=session_job_id,

    )

    if not discovered.get("ok"):

        return {"ok": False, "errors": [discovered.get("detail") or "시나리오 탐색 실패"], "items": []}



    all_candidates = discovered.get("candidates") or []

    by_id = {c["state_id"]: c for c in all_candidates if isinstance(c, dict)}

    selected = parse_state_ids(state_ids)

    if selected is not None:

        chosen = [by_id[sid] for sid in selected if sid in by_id and by_id[sid].get("selectable")]

    else:

        chosen = [c for c in all_candidates if c.get("recommended") and c.get("selectable")][:5]



    if not chosen:

        return {"ok": False, "errors": ["미리볼 시나리오 없음"], "items": []}



    storage = None

    if session_job_id.strip():

        storage = load_session_json(session_job_id.strip())

    elif session_storage_bytes:

        storage = parse_storage_state(session_storage_bytes)



    login_cfg = ExternalLoginConfig(

        login_url=login_url.strip(),

        username=login_username.strip(),

        password=login_password.strip(),

        portal_password=portal_password.strip(),

        user_selector=login_user_selector.strip(),

        password_selector=login_password_selector.strip(),

        submit_selector=login_submit_selector.strip(),

        need_login=need_login,

    )



    items: list[dict[str, Any]] = []

    errors: list[str] = []

    warnings: list[str] = []



    try:

        from playwright.sync_api import sync_playwright

    except ImportError:

        return {"ok": False, "errors": ["playwright 미설치"], "items": []}



    try:

        with sync_playwright() as p:

            browser = _launch_chromium(p)

            context = browser.new_context(

                viewport={"width": 1280, "height": 900},

                storage_state=storage,

            )

            page = context.new_page()

            ok, reason = _establish_session(page, url, login_cfg)

            if not ok:

                return {"ok": False, "errors": [reason], "items": []}



            for cand in chosen:

                sid = cand["state_id"]

                label = cand.get("label", sid)

                try:

                    ok, reason = open_state_by_steps(page, cand, base_url=url)

                    items.append(

                        {

                            "state_id": sid,

                            "label": label,

                            "ok": ok,

                            "error": "" if ok else reason,

                            "url": page.url,

                        }

                    )

                except Exception as e:

                    items.append(

                        {

                            "state_id": sid,

                            "label": label,

                            "ok": False,

                            "error": _friendly_playwright_error(str(e)),

                            "url": page.url,

                        }

                    )

            browser.close()

    except Exception as e:

        errors.append(_friendly_playwright_error(str(e)))



    ok_n = sum(1 for i in items if i.get("ok"))

    fail_n = len(items) - ok_n

    return {

        "ok": fail_n == 0 and not errors,

        "errors": errors,

        "warnings": warnings,

        "items": items,

        "summary": {"ok": ok_n, "fail": fail_n, "total": len(items)},

    }





def _preview_java_upload(

    *,

    page_url: str,

    state_ids: str | list | None,

    login_url: str = "",

    login_username: str = "",

    login_password: str = "",

    login_user_selector: str = "",

    login_password_selector: str = "",

    login_submit_selector: str = "",

    session_storage_bytes: bytes | None = None,

    session_job_id: str = "",

    candidates_override: list[dict[str, Any]] | None = None,

) -> dict[str, Any]:

    from web_quality.external_scanner import ExternalLoginConfig

    from web_quality.runtime_common import external_login

    from web_quality.ipms_scanner import _goto_home, parse_storage_state



    url = (page_url or "").strip().rstrip("/")

    if not url.startswith("http://") and not url.startswith("https://"):

        return {"ok": False, "errors": ["배포 URL(http://...)이 필요합니다."], "items": []}



    ipms_deploy = _is_ipms_deploy_url(url)



    all_candidates = candidates_override or []

    if not all_candidates:

        return {

            "ok": False,

            "errors": ["화면 시나리오가 없습니다. ZIP을 선택해 시나리오를 불러오세요."],

            "items": [],

        }



    by_id = {

        str(c.get("state_id")): c

        for c in all_candidates

        if isinstance(c, dict) and c.get("state_id")

    }

    selected = parse_state_ids(state_ids) or []

    if not selected:

        return {"ok": False, "errors": ["미리볼 시나리오를 1개 이상 선택하세요."], "items": []}



    items: list[dict[str, Any]] = []

    errors: list[str] = []

    warnings: list[str] = []

    runnable: list[str] = []



    if ipms_deploy:

        warnings.append(

            "IPMS 배포 URL — @GetMapping 직링크 미리보기는 「비정상적인 접근」으로 실패할 수 있습니다. "

            "정적(JSP/HTML) 진단 또는 IPMS 온라인 탭을 이용하세요."

        )



    storage = _resolve_ipms_storage(

        session_job_id=session_job_id,

        session_storage_bytes=session_storage_bytes,

    )



    login_cfg = None

    if login_url.strip() and login_username.strip() and login_password.strip():

        login_cfg = ExternalLoginConfig(

            login_url=login_url.strip(),

            username=login_username.strip(),

            password=login_password.strip(),

            user_selector=login_user_selector.strip(),

            password_selector=login_password_selector.strip(),

            submit_selector=login_submit_selector.strip(),

        )



    for sid in selected:

        cand = by_id.get(sid)

        if not cand:

            items.append(

                {

                    "state_id": sid,

                    "label": sid,

                    "ok": False,

                    "error": "시나리오 정의 없음 — ZIP에서 시나리오를 다시 읽어 주세요.",

                    "url": "",

                }

            )

            continue

        label = str(cand.get("label") or sid)

        if not cand.get("selectable", True):

            items.append(

                {

                    "state_id": sid,

                    "label": label,

                    "ok": False,

                    "error": str(cand.get("skip_reason") or "검증 불가 시나리오"),

                    "url": "",

                }

            )

            continue

        if is_jsp_auto_modal(cand):

            items.append(

                {

                    "state_id": sid,

                    "label": label,

                    "ok": False,

                    "error": str(

                        cand.get("skip_reason")

                        or "JSP 모달 — 열기 동작 없음. 부모 화면에서 수동 확인"

                    ),

                    "url": "",

                }

            )

            continue

        if ipms_deploy and is_java_direct_goto_page(cand):

            items.append(

                {

                    "state_id": sid,

                    "label": label,

                    "ok": False,

                    "error": IPMS_DIRECT_URL_MSG,

                    "url": "",

                }

            )

            continue

        access = str(cand.get("access") or "public").lower()

        if access == "auth" and not storage and not login_cfg:

            items.append(

                {

                    "state_id": sid,

                    "label": label,

                    "ok": False,

                    "error": "로그인 세션 필요 — 「로그인 창 띄움」 또는 세션 JSON 업로드",

                    "url": "",

                }

            )

            continue

        runnable.append(sid)



    if not runnable and items:

        err_list = ["검증 가능한 시나리오가 없습니다."]

        if ipms_deploy and items and all(

            IPMS_DIRECT_URL_MSG in str(i.get("error") or "") for i in items

        ):

            err_list = [IPMS_DIRECT_URL_MSG]

        return {

            "ok": False,

            "errors": err_list,

            "warnings": warnings,

            "items": items,

            "summary": {"ok": 0, "fail": len(items), "total": len(items)},

        }



    if runnable and not storage and not login_cfg:

        return _login_required_preview_items(

            runnable,

            by_id,

            items,

            message="로그인 세션 필요 — 「로그인 창 띄움」 또는 세션 JSON 업로드",

            warnings=warnings,

        )



    if storage and _is_ipms_deploy_url(url):

        from web_quality.ipms_scanner import validate_ipms_storage_session

        ok, msg = validate_ipms_storage_session(url, storage)

        if not ok:

            return _login_required_preview_items(

                runnable,

                by_id,

                items,

                message=f"로그인 세션 필요 — {msg or '세션 만료'}",

                warnings=warnings,

            )



    try:

        from playwright.sync_api import sync_playwright

    except ImportError:

        return {"ok": False, "errors": ["playwright 미설치"], "items": items}



    try:

        with sync_playwright() as p:

            browser = _launch_chromium(p)

            context = browser.new_context(

                viewport={"width": 1280, "height": 900},

                storage_state=storage,

            )

            page = context.new_page()

            if login_cfg:

                external_login(

                    page,

                    login_cfg.login_url,

                    login_cfg.username,

                    login_cfg.password,

                    login_cfg.user_selector,

                    login_cfg.password_selector,

                    login_cfg.submit_selector,

                )

            elif storage:

                try:

                    home = url if url.endswith("/") else f"{url}/"

                    _goto_home(page, home)

                except Exception as e:

                    browser.close()

                    return {

                        "ok": False,

                        "errors": [_friendly_playwright_error(str(e))],

                        "items": items,

                    }



            for sid in runnable:

                cand = by_id[sid]

                label = str(cand.get("label") or sid)

                try:

                    ok, reason = open_state_by_steps(

                        page,

                        cand,

                        base_url=url,

                        ipms_deploy=ipms_deploy,

                    )

                    items.append(

                        {

                            "state_id": sid,

                            "label": label,

                            "ok": ok,

                            "error": "" if ok else reason,

                            "url": page.url,

                        }

                    )

                except Exception as e:

                    items.append(

                        {

                            "state_id": sid,

                            "label": label,

                            "ok": False,

                            "error": _friendly_playwright_error(str(e)),

                            "url": page.url,

                        }

                    )

            browser.close()

    except Exception as e:

        errors.append(_friendly_playwright_error(str(e)))



    ok_n = sum(1 for i in items if i.get("ok"))

    fail_n = len(items) - ok_n

    return {

        "ok": fail_n == 0 and not errors,

        "errors": errors,

        "warnings": warnings,

        "items": items,

        "summary": {"ok": ok_n, "fail": fail_n, "total": len(items)},

    }





def preview_wq_scenarios(

    *,

    mode: str,

    page_url: str,

    state_ids: str | list | None = None,

    ipms_access: str = "public",

    need_login: bool = False,

    login_url: str = "",

    login_username: str = "",

    login_password: str = "",

    portal_password: str = "",

    login_user_selector: str = "",

    login_password_selector: str = "",

    login_submit_selector: str = "",

    session_storage_bytes: bytes | None = None,

    session_job_id: str = "",

    candidates_override: list[dict[str, Any]] | None = None,

) -> dict[str, Any]:

    mode = (mode or "").strip().lower()

    if mode in ("ipms-public", "ipms-auth", "ipms-online"):

        tier = ipms_access if mode == "ipms-online" else ("public" if mode == "ipms-public" else "auth")

        return _preview_ipms(

            page_url=page_url,

            state_ids=state_ids,

            ipms_access=tier,

            session_storage_bytes=session_storage_bytes,

            session_job_id=session_job_id,

            candidates_override=candidates_override,

        )

    if mode == "external":

        return _preview_external(

            page_url=page_url,

            state_ids=state_ids,

            need_login=need_login,

            login_url=login_url,

            login_username=login_username,

            login_password=login_password,

            portal_password=portal_password,

            login_user_selector=login_user_selector,

            login_password_selector=login_password_selector,

            login_submit_selector=login_submit_selector,

            session_storage_bytes=session_storage_bytes,

            session_job_id=session_job_id,

        )

    if mode == "java-upload":

        return _preview_java_upload(

            page_url=page_url,

            state_ids=state_ids,

            login_url=login_url,

            login_username=login_username,

            login_password=login_password,

            login_user_selector=login_user_selector,

            login_password_selector=login_password_selector,

            login_submit_selector=login_submit_selector,

            session_storage_bytes=session_storage_bytes,

            session_job_id=session_job_id,

            candidates_override=candidates_override,

        )

    return {"ok": False, "errors": [f"미리보기 미지원 mode: {mode}"], "items": []}





def parse_candidates_json(raw: str) -> list[dict[str, Any]] | None:

    text = (raw or "").strip()

    if not text:

        return None

    data = json.loads(text)

    if not isinstance(data, list):

        raise ValueError("candidates_json must be a JSON array")

    return [c for c in data if isinstance(c, dict)]

