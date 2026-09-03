"""O2 SPA (MenuTree.js + *Config.js) 화면 시나리오 추출 — 내부 QA용."""
from __future__ import annotations

import re
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from web_quality.scenario_extract import ScenarioCandidate

MENUTREE_REL_PATHS = (
    "app/js/common/MenuTree.js",
    "js/common/MenuTree.js",
)

# ipms.online — DISABLED_FOR_GUEST Set. ipms.permit 등 미선언 시 nob/usg/stats만 공개.
O2_PUBLIC_UL_IDS = frozenset({"nob", "usg", "stats"})

ImportMap = dict[str, str]
GroupConfig = tuple[str, str]  # (ul_id, import_alias)


def _fetch_text(url: str, *, timeout: int = 25) -> str:
    req = Request(url.strip(), headers={"User-Agent": "MyPlatform-WQ/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def find_menutree_path(root: Path) -> Path | None:
    matches = sorted(root.rglob("MenuTree.js"), key=lambda p: len(p.parts))
    return matches[0] if matches else None


def parse_disabled_for_guest(text: str) -> set[str]:
    m = re.search(r"DISABLED_FOR_GUEST\s*=\s*new\s*Set\(\[(.*?)\]\)", text, re.DOTALL)
    if not m:
        return set()
    return set(re.findall(r"['\"](\w+)['\"]", m.group(1)))


def menutree_declares_guest_set(text: str) -> bool:
    return bool(re.search(r"DISABLED_FOR_GUEST\s*=", text))


def resolve_o2_menu_access(ul_id: str, disabled_guest: set[str], *, guest_declared: bool) -> str:
    if guest_declared:
        return "auth" if ul_id in disabled_guest else "public"
    if ul_id in O2_PUBLIC_UL_IDS:
        return "public"
    return "auth"


def parse_import_map(text: str) -> ImportMap:
    out: ImportMap = {}
    for m in re.finditer(
        r"import\s*\*\s*as\s+(\_\w+)\s*from\s*['\"]([^'\"]+)['\"]",
        text,
    ):
        out[m.group(1)] = m.group(2)
    return out


def parse_group_configs(text: str) -> list[GroupConfig]:
    out: list[GroupConfig] = []
    seen: set[str] = set()
    for m in re.finditer(
        r"\{\s*ulId:\s*['\"](\w+)['\"][^}]*?config:\s*(_\w+)",
        text,
    ):
        ul_id = m.group(1)
        if ul_id in seen:
            continue
        seen.add(ul_id)
        out.append((ul_id, m.group(2)))
    return out


def parse_inline_group_menus(text: str) -> list[tuple[str, str, list[tuple[str, str]]]]:
    """MenuTree.js inline `{ config: { GROUP: { ... CHILDMENU/CHILDREN }}}` 항목."""
    out: list[tuple[str, str, list[tuple[str, str]]]] = []
    marker = re.compile(
        r"\{\s*ulId:\s*['\"](\w+)['\"]\s*,\s*name:\s*['\"]([^'\"]+)['\"]\s*,\s*config:\s*\{\s*GROUP:\s*\{",
    )
    for m in marker.finditer(text):
        ul_id, group_label = m.group(1), m.group(2)
        group_body = text[m.end() : m.end() + 4000]
        _, menus = parse_config_menus(f"NAME: '{group_label}'" + group_body)
        if menus:
            out.append((ul_id, group_label, menus))
    return out


def parse_config_menus(text: str) -> tuple[str, list[tuple[str, str]]]:
    nm = re.search(r"NAME:\s*['\"]([^'\"]+)['\"]", text)
    group_name = nm.group(1) if nm else "메뉴"
    menus: list[tuple[str, str]] = []
    for m in re.finditer(
        r"name:\s*['\"]([^'\"]+)['\"][\s\S]*?className:\s*['\"]([^'\"]+)['\"]",
        text,
    ):
        menus.append((m.group(1), m.group(2)))
    return group_name, menus


def gnb_steps(group_label: str, ul_id: str, route_class: str) -> list[dict[str, Any]]:
    return [
        {"action": "wait", "selector": "#gnb .gnb-main-trigger", "timeout_ms": 30000},
        {"action": "click_has_text", "selector": ".gnb-main-trigger", "text": group_label},
        {"action": "wait", "selector": f"ul#{ul_id} a.{route_class}", "timeout_ms": 15000},
        {"action": "click", "selector": f"ul#{ul_id} a.{route_class}"},
        {"action": "wait", "selector": ".section-wrap", "timeout_ms": 45000},
    ]


def shell_candidates() -> list[ScenarioCandidate]:
    return [
        ScenarioCandidate(
            state_id="main_shell",
            label="홈 (GNB·푸터)",
            description="비로그인 메인 — skip link, GNB, footer",
            kind="page",
            recommended=True,
            selectable=True,
            confidence="high",
            source_files=["MenuTree.js"],
            evidence="O2 SPA shell",
            ready_selector="#container",
            steps=[
                {"action": "wait", "selector": "#gnb .gnb-main-trigger", "timeout_ms": 30000},
                {"action": "wait", "selector": "#footer", "timeout_ms": 10000},
                {"action": "wait", "selector": "#krds-skip-link a", "timeout_ms": 5000},
            ],
            access="public",
        ),
        ScenarioCandidate(
            state_id="login_form",
            label="로그인 화면",
            description="ID/PW 입력 폼",
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
        ),
    ]


def _menu_candidate(
    *,
    state_id: str,
    label: str,
    group_label: str,
    ul_id: str,
    route_class: str,
    access: str,
) -> ScenarioCandidate:
    return ScenarioCandidate(
        state_id=state_id,
        label=label,
        description=(
            f"{group_label} › {label} (비로그인 가능)"
            if access == "public"
            else f"{group_label} › {label} (로그인·권한 필요)"
        ),
        kind="page",
        recommended=True,
        selectable=True,
        confidence="high",
        source_files=["MenuTree.js"],
        evidence=f"GNB ul#{ul_id} a.{route_class}",
        ready_selector=".section-wrap",
        steps=gnb_steps(group_label, ul_id, route_class),
        access=access,
    )


def sort_o2_candidates(candidates: list[ScenarioCandidate]) -> list[ScenarioCandidate]:
    """공개(비로그인) 메뉴를 로그인 메뉴 앞에 — ipms_online.py 프리셋과 동일 UX."""
    shells: list[ScenarioCandidate] = []
    public_menus: list[ScenarioCandidate] = []
    auth_menus: list[ScenarioCandidate] = []
    for c in candidates:
        if c.state_id in ("main_shell", "login_form"):
            shells.append(c)
            continue
        tier = (getattr(c, "access", "") or "public").lower()
        if tier == "auth":
            auth_menus.append(c)
        else:
            public_menus.append(c)
    shell_order = {sid: i for i, sid in enumerate(["main_shell", "login_form"])}
    shells.sort(key=lambda c: shell_order.get(c.state_id, 99))
    return shells + public_menus + auth_menus


def build_candidates_from_parsed(
    *,
    group_configs: list[GroupConfig],
    import_map: ImportMap,
    config_loader: Callable[[str, str], str | None],
    disabled_guest: set[str],
    guest_declared: bool = True,
    inline_groups: list[tuple[str, str, list[tuple[str, str]]]] | None = None,
) -> tuple[list[ScenarioCandidate], list[str]]:
    warnings: list[str] = []
    out = shell_candidates()
    menu_count = 0

    for ul_id, alias in group_configs:
        rel = import_map.get(alias)
        if not rel:
            warnings.append(f"Config import 없음: ulId={ul_id} alias={alias}")
            continue
        config_text = config_loader(ul_id, rel)
        if not config_text:
            warnings.append(f"Config 파일 없음: {rel} (ulId={ul_id})")
            continue
        group_label, menus = parse_config_menus(config_text)
        if not menus:
            warnings.append(f"CHILDMENU 없음: {rel}")
            continue
        access = resolve_o2_menu_access(ul_id, disabled_guest, guest_declared=guest_declared)
        prefix = "auth" if access == "auth" else "pub"
        for name, route_class in menus:
            menu_count += 1
            out.append(
                _menu_candidate(
                    state_id=f"{prefix}_{ul_id}_{route_class}",
                    label=name,
                    group_label=group_label,
                    ul_id=ul_id,
                    route_class=route_class,
                    access=access,
                )
            )

    for ul_id, group_label, menus in inline_groups or []:
        access = resolve_o2_menu_access(ul_id, disabled_guest, guest_declared=guest_declared)
        prefix = "auth" if access == "auth" else "pub"
        for name, route_class in menus:
            menu_count += 1
            out.append(
                _menu_candidate(
                    state_id=f"{prefix}_{ul_id}_{route_class}",
                    label=name,
                    group_label=group_label,
                    ul_id=ul_id,
                    route_class=route_class,
                    access=access,
                )
            )

    if menu_count == 0:
        return [], warnings + ["CHILDMENU 기반 화면을 찾지 못했습니다."]
    return sort_o2_candidates(out), warnings


def _resolve_config_path(root: Path, menutree_dir: Path, rel: str) -> Path | None:
    direct = (menutree_dir / rel).resolve()
    if direct.is_file():
        return direct
    fname = Path(rel.replace("\\", "/")).name
    matches = sorted(root.rglob(fname), key=lambda p: len(p.parts))
    return matches[0] if matches else None


def extract_o2_spa_from_root(root: Path) -> tuple[list[ScenarioCandidate], list[str], dict[str, Any]]:
    menutree_path = find_menutree_path(root)
    if not menutree_path:
        return [], ["MenuTree.js를 ZIP/폴더에서 찾지 못했습니다."], {}

    text = menutree_path.read_text(encoding="utf-8", errors="replace")
    import_map = parse_import_map(text)
    group_configs = parse_group_configs(text)
    inline_groups = parse_inline_group_menus(text)
    disabled = parse_disabled_for_guest(text)
    guest_declared = menutree_declares_guest_set(text)
    menutree_dir = menutree_path.parent

    def loader(_ul_id: str, rel: str) -> str | None:
        path = _resolve_config_path(root, menutree_dir, rel)
        if not path:
            return None
        return path.read_text(encoding="utf-8", errors="replace")

    candidates, warnings = build_candidates_from_parsed(
        group_configs=group_configs,
        import_map=import_map,
        config_loader=loader,
        disabled_guest=disabled,
        guest_declared=guest_declared,
        inline_groups=inline_groups,
    )
    meta = {
        "menutree_path": str(menutree_path.relative_to(root)) if menutree_path.is_relative_to(root) else str(menutree_path),
        "menu_groups": len(group_configs),
    }
    return candidates, warnings, meta


def extract_o2_spa_from_zip(zip_bytes: bytes) -> tuple[list[ScenarioCandidate], list[str], dict[str, Any]]:
    import tempfile

    tmp = tempfile.mkdtemp(prefix="wq_o2_spa_")
    root = Path(tmp) / "src"
    root.mkdir(parents=True)
    try:
        with zipfile.ZipFile(BytesIO(zip_bytes), "r") as zf:
            zf.extractall(root)
        return extract_o2_spa_from_root(root)
    finally:
        import shutil

        shutil.rmtree(tmp, ignore_errors=True)


def extract_o2_spa_from_base_url(base_url: str) -> tuple[list[ScenarioCandidate], list[str], dict[str, Any]]:
    base = (base_url or "").strip()
    if not base:
        return [], ["base_url이 비어 있습니다."], {}
    if not base.endswith("/"):
        base += "/"

    errors: list[str] = []
    for rel in MENUTREE_REL_PATHS:
        menutree_url = urljoin(base, rel)
        try:
            text = _fetch_text(menutree_url)
        except Exception as e:
            errors.append(f"{menutree_url}: {e}")
            continue

        import_map = parse_import_map(text)
        group_configs = parse_group_configs(text)
        inline_groups = parse_inline_group_menus(text)
        disabled = parse_disabled_for_guest(text)
        guest_declared = menutree_declares_guest_set(text)
        menutree_base = menutree_url.rsplit("/", 1)[0] + "/"

        def loader(_ul_id: str, rel_import: str) -> str | None:
            config_url = urljoin(menutree_base, rel_import)
            try:
                return _fetch_text(config_url)
            except Exception:
                return None

        candidates, warnings = build_candidates_from_parsed(
            group_configs=group_configs,
            import_map=import_map,
            config_loader=loader,
            disabled_guest=disabled,
            guest_declared=guest_declared,
            inline_groups=inline_groups,
        )
        if candidates:
            meta = {
                "menutree_url": menutree_url,
                "menu_groups": len(group_configs) + len(inline_groups),
            }
            return candidates, warnings, meta
        errors.extend(warnings)
        if not group_configs and not inline_groups:
            errors.append(
                f"{menutree_url}: MenuTree.js GROUP_CONFIGS 형식을 인식하지 못했습니다 "
                "(ulId·config 패턴 확인)."
            )

    return [], errors or ["접속 URL에서 MenuTree.js를 가져오지 못했습니다."], {}


def menu_candidate_count(candidates: list[ScenarioCandidate]) -> int:
    skip = {"main_shell", "login_form"}
    return sum(1 for c in candidates if c.state_id not in skip)
