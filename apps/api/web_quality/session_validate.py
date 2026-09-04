"""URL 유형별 Playwright storage_state 검증 (웹 품질 · 성능 진단 공통)."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from web_quality.runtime_common import is_portal_like_url


def is_ipms_deploy_url(url: str) -> bool:
    return "ipms.online" in (url or "").lower()


def is_portal_local_url(url: str) -> bool:
    host = (urlparse((url or "").strip()).hostname or "").lower()
    return host in ("localhost", "127.0.0.1", "::1")


def validate_storage_session_for_url(
    base_url: str,
    storage_state: dict[str, Any],
) -> tuple[bool, str]:
    """base_url 종류에 맞는 세션 검증 (IPMS · 로컬 포털 · Vercel 포털 · 외부 URL)."""
    url = (base_url or "").strip()
    if not url:
        return False, "base_url이 필요합니다."

    if is_ipms_deploy_url(url):
        from web_quality.ipms_scanner import validate_ipms_storage_session

        return validate_ipms_storage_session(url, storage_state)

    if is_portal_local_url(url):
        from perf_test.session import validate_portal_storage_state

        ok, msg = validate_portal_storage_state(storage_state, url)
        return (True, "") if ok else (False, msg)

    if is_portal_like_url(url):
        for c in storage_state.get("cookies") or []:
            if (
                isinstance(c, dict)
                and c.get("name") == "mp_portal"
                and str(c.get("value") or "").strip()
            ):
                return True, ""
        from web_quality.external_scenario_extract import validate_external_storage_session

        return validate_external_storage_session(url, storage_state)

    from web_quality.external_scenario_extract import validate_external_storage_session

    return validate_external_storage_session(url, storage_state)


def validate_session_job_for_url(job_id: str, base_url: str) -> tuple[bool, str]:
    from web_quality.ipms_session import load_session_json

    jid = (job_id or "").strip()
    if not jid:
        return False, "세션 job_id가 필요합니다."
    storage = load_session_json(jid)
    if not storage:
        return False, "세션 파일이 없습니다. 「로그인 창 띄움」을 다시 실행하세요."
    ok, msg = validate_storage_session_for_url(base_url, storage)
    return ok, msg if not ok else ""
