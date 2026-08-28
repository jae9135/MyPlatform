from __future__ import annotations

from typing import Any

from web_quality.manifest import TARGETS  # type: ignore

# 포털 앱 중 web-quality manifest에 없는 경로
SUPPLEMENTAL_PORTAL_URLS: list[dict[str, Any]] = [
    {
        "id": "source-scan",
        "name": "소스코드·보안 진단",
        "path": "/apps/source-scan",
        "description": "PMD · FindSecBugs 소스 점검",
    },
    {
        "id": "web-quality",
        "name": "웹 품질 진단",
        "path": "/apps/web-quality",
        "description": "KWCAG · 접근성 · 웹표준 진단",
    },
    {
        "id": "perf-test",
        "name": "성능 진단",
        "path": "/apps/perf-test",
        "description": "Locust HTTP 부하 테스트",
    },
]


def _is_public_portal_path(path: str) -> bool:
    p = (path or "/").rstrip("/") or "/"
    if p == "/":
        return True
    if p.startswith("/products"):
        return True
    if p.startswith("/demo"):
        return True
    if p in ("/customize", "/contact", "/login"):
        return True
    if p.startswith("/receipt-to-pdf"):
        return True
    return False


def _item_from_target(t: dict[str, Any]) -> dict[str, Any]:
    path = (t.get("path") or "/").strip() or "/"
    public = _is_public_portal_path(path)
    return {
        "id": t["id"],
        "name": t.get("name", t["id"]),
        "path": path,
        "description": t.get("description", ""),
        "public_access": public,
        "requires_auth": not public,
        "recommended": public,
    }


def list_portal_urls() -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for t in TARGETS:
        if t.get("mode") != "portal":
            continue
        path = (t.get("path") or "/").strip() or "/"
        if path in seen:
            continue
        seen.add(path)
        items.append(_item_from_target(t))

    for t in SUPPLEMENTAL_PORTAL_URLS:
        path = (t.get("path") or "").strip()
        if not path or path in seen:
            continue
        seen.add(path)
        public = _is_public_portal_path(path)
        items.append(
            {
                "id": t["id"],
                "name": t.get("name", t["id"]),
                "path": path,
                "description": t.get("description", ""),
                "public_access": public,
                "requires_auth": not public,
                "recommended": public,
            }
        )

    items.sort(key=lambda x: (x["path"] != "/", x["path"]))
    defaults = [x["path"] for x in items if x.get("recommended")]
    if not defaults and items:
        defaults = [items[0]["path"]]

    return {
        "ok": True,
        "items": items,
        "defaults_selected": defaults,
    }
