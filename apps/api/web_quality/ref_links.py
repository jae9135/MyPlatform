"""Deep-link URLs for 관련근거 — single source: rules/ref_links.json + krds_uiux.json."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

RULES_DIR = Path(__file__).resolve().parent / "rules"
_REF_CONFIG_PATH = RULES_DIR / "ref_links.json"

# Minimum ref_text length for Chrome #:~:text= (short tokens match wrong sections)
_MIN_TEXT_FRAGMENT_LEN = 8


@lru_cache(maxsize=1)
def _ref_config() -> dict[str, Any]:
    with _REF_CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def reload_ref_config() -> None:
    _ref_config.cache_clear()


def _cfg(key: str, default: Any = None) -> Any:
    return _ref_config().get(key, default)


GUIDELINE_UIUX_2025_URL: str = ""  # set after load


def _init_constants() -> None:
    global GUIDELINE_UIUX_2025_URL
    GUIDELINE_UIUX_2025_URL = str(
        _cfg("guideline_uiux_url")
        or "https://www.krds.go.kr/html/site/community/community_01_01.html?nttId=9"
    )


_init_constants()


def kwcag_base_url() -> str:
    return str(_cfg("kwcag_base_url") or "https://a11ykr.github.io/kwcag22/")


def kwcag_anchors() -> dict[str, str]:
    return dict(_cfg("kwcag_anchors") or {})


def egov_wa_kwcag_map() -> dict[str, str]:
    return dict(_cfg("egov_wa_kwcag_map") or {})


def krds_fallbacks() -> dict[str, str]:
    return dict(_cfg("krds_fallbacks") or {})


def ref_config_public() -> dict[str, Any]:
    """Catalog payload for API / portal (no secrets)."""
    from web_quality.catalog import load_krds_uiux_rules

    rules: list[dict[str, Any]] = []
    for rule in load_krds_uiux_rules():
        entry = {
            "id": rule["id"],
            "ref_url": rule.get("ref_url", ""),
            "ref_anchor": rule.get("ref_anchor", ""),
            "ref_text": rule.get("ref_text", ""),
            "ref_fallback_url": rule.get("ref_fallback_url", ""),
        }
        resolved = resolve_rule_ref_urls(entry)
        entry["resolved_ref_url"] = resolved.get("primary", "")
        entry["resolved_ref_fallback_url"] = resolved.get("fallback", "")
        rules.append(entry)

    return {
        "version": _cfg("version", "1"),
        "guideline_uiux_url": GUIDELINE_UIUX_2025_URL,
        "kwcag_base_url": kwcag_base_url(),
        "kwcag_anchors": kwcag_anchors(),
        "egov_wa_kwcag_map": egov_wa_kwcag_map(),
        "krds_fallbacks": krds_fallbacks(),
        "krds_rules": rules,
    }


def build_ref_url(
    base_url: str,
    *,
    anchor: str = "",
    ref_text: str = "",
    allow_text_fragment: bool = True,
) -> str:
    """Prefer #anchor; use #:~:text= only for long, distinctive phrases."""
    url = (base_url or "").strip().rstrip("#")
    if not url:
        return ""
    anchor = (anchor or "").strip()
    ref_text = (ref_text or "").strip()
    if anchor:
        return url + (anchor if anchor.startswith("#") else f"#{anchor}")
    if allow_text_fragment and len(ref_text) >= _MIN_TEXT_FRAGMENT_LEN:
        return f"{url}#:~:text={quote(ref_text, safe='')}"
    return url


def _infer_krds_fallback(base_url: str) -> str:
    fb = krds_fallbacks()
    path = urlparse(base_url).path.lower()
    if "/component/" in path:
        return fb.get("component", GUIDELINE_UIUX_2025_URL)
    if "/style/" in path:
        return fb.get("style", GUIDELINE_UIUX_2025_URL)
    if "/service/" in path:
        return fb.get("service", GUIDELINE_UIUX_2025_URL)
    if "/global/" in path:
        return fb.get("global", GUIDELINE_UIUX_2025_URL)
    return fb.get("guideline", GUIDELINE_UIUX_2025_URL)


def resolve_rule_ref_urls(
    rule: dict[str, Any],
    *,
    kwcag_id: str = "",
    category: str = "",
) -> dict[str, str]:
    """Returns {primary, fallback} URLs for a catalog rule or finding context."""
    rule_id = str(rule.get("id") or rule.get("rule_id") or "")
    ref_url = str(rule.get("ref_url") or "")
    ref_anchor = str(rule.get("ref_anchor") or "")
    ref_text = str(rule.get("ref_text") or "")
    ref_fallback = str(rule.get("ref_fallback_url") or "")

    primary = ""
    fallback = ref_fallback

    if rule_id.startswith("UX-KRDS-") or (category == "uiux" and ref_url):
        if ref_url:
            primary = build_ref_url(ref_url, anchor=ref_anchor, ref_text=ref_text)
            if not fallback:
                fallback = _infer_krds_fallback(ref_url)
        elif rule_id.startswith("UX-KRDS-"):
            from web_quality.catalog import rule_by_id

            cat = rule_by_id(rule_id) or {}
            ref_url = str(cat.get("ref_url") or "")
            if ref_url:
                primary = build_ref_url(
                    ref_url,
                    anchor=str(cat.get("ref_anchor") or ""),
                    ref_text=str(cat.get("ref_text") or ref_text),
                )
                fallback = str(cat.get("ref_fallback_url") or "") or _infer_krds_fallback(ref_url)
        if not primary:
            primary = GUIDELINE_UIUX_2025_URL
            fallback = fallback or krds_fallbacks().get("component", GUIDELINE_UIUX_2025_URL)
        return {"primary": primary, "fallback": fallback}

    kid = (kwcag_id or "").strip()
    if not kid and rule_id.startswith("WA-"):
        kid = egov_wa_kwcag_map().get(rule_id, "")
    if not kid and re.match(r"^\d+\.\d+", rule_id):
        kid = rule_id

    if kid:
        anchor = kwcag_anchors().get(kid)
        if anchor:
            base = kwcag_base_url().rstrip("/")
            primary = f"{base}/#{anchor}"
            fallback = fallback or base
            return {"primary": primary, "fallback": fallback}

    if category == "uiux":
        return {
            "primary": GUIDELINE_UIUX_2025_URL,
            "fallback": krds_fallbacks().get("guideline", GUIDELINE_UIUX_2025_URL),
        }
    return {"primary": "", "fallback": ""}


def kwcag_ref_url(kwcag_id: str) -> str | None:
    urls = resolve_rule_ref_urls({"kwcag_id": kwcag_id}, kwcag_id=kwcag_id)
    return urls.get("primary") or None


def krds_rule_ref_url(rule_id: str) -> str | None:
    urls = resolve_rule_ref_urls({"id": rule_id, "rule_id": rule_id}, category="uiux")
    return urls.get("primary") or None


def resolve_finding_ref_url(
    *,
    rule_id: str = "",
    kwcag_id: str = "",
    category: str = "",
    rule_ref_url: str = "",
    rule_ref_anchor: str = "",
    rule_ref_text: str = "",
    rule_ref_fallback: str = "",
) -> str | None:
    urls = resolve_rule_ref_urls(
        {
            "id": rule_id,
            "rule_id": rule_id,
            "ref_url": rule_ref_url,
            "ref_anchor": rule_ref_anchor,
            "ref_text": rule_ref_text,
            "ref_fallback_url": rule_ref_fallback,
        },
        kwcag_id=kwcag_id,
        category=category,
    )
    return urls.get("primary") or None


def resolve_finding_ref_urls(
    *,
    rule_id: str = "",
    kwcag_id: str = "",
    category: str = "",
    rule_ref_url: str = "",
    rule_ref_anchor: str = "",
    rule_ref_text: str = "",
    rule_ref_fallback: str = "",
) -> dict[str, str]:
    return resolve_rule_ref_urls(
        {
            "id": rule_id,
            "rule_id": rule_id,
            "ref_url": rule_ref_url,
            "ref_anchor": rule_ref_anchor,
            "ref_text": rule_ref_text,
            "ref_fallback_url": rule_ref_fallback,
        },
        kwcag_id=kwcag_id,
        category=category,
    )
