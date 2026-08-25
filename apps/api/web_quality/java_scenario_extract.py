from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from web_quality.scenario_extract import ScenarioCandidate

VIEW_SUFFIXES = (".jsp", ".jspf", ".html", ".htm")
SKIP_DIR_PARTS = (
    "/target/",
    "/build/",
    "/node_modules/",
    "/.git/",
    "/test/",
    "/tests/",
    "/__tests__/",
)
FRAGMENT_PATH_PARTS = (
    "/include/",
    "/inc/",
    "/layout/",
    "/common/",
    "/fragment/",
    "/fragments/",
    "/templates/include/",
)

GET_MAPPING_RE = re.compile(
    r"@GetMapping\s*\(\s*(?:value\s*=\s*)?(?:\{\s*)?[\"']([^\"']+)[\"']",
    re.MULTILINE,
)
METHOD_MAPPING_RE = re.compile(
    r"@(GetMapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?(?:\{\s*)?[\"']([^\"']+)[\"']",
    re.MULTILINE,
)
CLASS_MAPPING_RE = re.compile(
    r"@RequestMapping\s*\(\s*(?:value\s*=\s*)?[\"']([^\"']+)[\"']",
    re.MULTILINE,
)
RETURN_VIEW_RE = re.compile(r"return\s+[\"']([^\"']+)[\"']\s*;")
MODAL_RE = re.compile(
    r'(?:role\s*=\s*["\']dialog["\']|class\s*=\s*["\'][^"\']*modal[^"\']*["\']|id\s*=\s*["\'][^"\']*[Mm]odal[^"\']*["\'])',
    re.IGNORECASE,
)
TITLE_RE = re.compile(r"<title[^>]*>([^<]{1,80})</title>", re.IGNORECASE)
H1_RE = re.compile(r"<h1[^>]*>([^<]{1,80})</h1>", re.IGNORECASE)
FILE_INPUT_RE = re.compile(r'<input[^>]+type\s*=\s*["\']file["\']', re.IGNORECASE)
CONFIRM_RE = re.compile(r"\bconfirm\s*\(", re.IGNORECASE)


@dataclass
class SpringMapping:
    url_path: str
    view_name: str
    java_file: str
    http_method: str = "GET"


def _rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def _is_skipped(rel: str) -> bool:
    low = f"/{rel.lower()}/"
    return any(part in low for part in SKIP_DIR_PARTS)


def _is_view_fragment(rel: str, content: str = "") -> bool:
    low = rel.lower().replace("\\", "/")
    name = Path(low).name
    if any(part in f"/{low}/" for part in FRAGMENT_PATH_PARTS):
        return True
    if name.endswith("_inc.jsp") or name.endswith("_inc.jspf"):
        return True
    if "_inc." in name or name.startswith("inc_"):
        return True
    # include 조각: html/body/root 없이 fragment만 있는 경우
    if content and "<html" not in content.lower() and "<body" not in content.lower():
        if "include/" in low or "/inc/" in low or name.endswith("_inc.jsp"):
            return True
    return False


def _slug(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip("/").replace(".", "_"))
    s = re.sub(r"_+", "_", s).strip("_").lower()
    return s or "page"


def _join_url(base: str, path: str) -> str:
    b = base.rstrip("/")
    p = path if path.startswith("/") else f"/{path}"
    return f"{b}{p}" if b else p


def discover_view_files(root: Path) -> list[Path]:
    out: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        rel = _rel(root, p)
        if _is_skipped(rel):
            continue
        if p.suffix.lower() in VIEW_SUFFIXES:
            out.append(p)
    return sorted(out, key=lambda x: x.as_posix())


def _view_path_candidates(view_name: str) -> list[str]:
    vn = view_name.replace("\\", "/").strip("/")
    if vn.endswith((".jsp", ".html", ".htm")):
        return [vn]
    return [
        f"{vn}.jsp",
        f"{vn}.html",
        f"WEB-INF/views/{vn}.jsp",
        f"WEB-INF/view/{vn}.jsp",
        f"webapp/WEB-INF/views/{vn}.jsp",
        f"src/main/webapp/WEB-INF/views/{vn}.jsp",
        f"templates/{vn}.html",
        f"src/main/resources/templates/{vn}.html",
        f"webapp/{vn}.jsp",
        f"src/main/webapp/{vn}.jsp",
    ]


def _match_view_file(view_name: str, view_index: dict[str, Path], root: Path) -> Path | None:
    for cand in _view_path_candidates(view_name):
        key = cand.lower()
        if key in view_index:
            return view_index[key]
        alt = cand.split("/")[-1].lower()
        for k, p in view_index.items():
            if k.endswith(alt):
                return p
    tail = view_name.replace("\\", "/").split("/")[-1].lower()
    for k, p in view_index.items():
        if k.endswith(f"{tail}.jsp") or k.endswith(f"{tail}.html"):
            return p
    return None


def parse_spring_mappings(java_files: list[Path], root: Path) -> list[SpringMapping]:
    mappings: list[SpringMapping] = []
    seen: set[tuple[str, str]] = set()

    for jpath in java_files:
        rel = _rel(root, jpath)
        if _is_skipped(rel):
            continue
        try:
            text = jpath.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "@Controller" not in text:
            continue
        if "@RestController" in text and "@Controller" not in text:
            continue

        class_base = ""
        for m in CLASS_MAPPING_RE.finditer(text):
            class_base = m.group(1).strip("/")
            break

        for m in METHOD_MAPPING_RE.finditer(text):
            annot = m.group(1)
            sub = m.group(2).strip()
            start = m.end()
            block = text[start : start + 800]
            if "@ResponseBody" in block[:200]:
                continue
            if annot == "RequestMapping":
                head = text[m.start() : m.end() + 120]
                if "method" in head and "GET" not in head and "GetMapping" not in head:
                    continue
            url = _join_url(class_base, sub) if class_base else sub
            if not url.startswith("/"):
                url = f"/{url}"
            view_m = RETURN_VIEW_RE.search(block)
            if not view_m:
                continue
            key = (url, view_m.group(1))
            if key in seen:
                continue
            seen.add(key)
            mappings.append(
                SpringMapping(
                    url_path=url,
                    view_name=view_m.group(1),
                    java_file=rel,
                )
            )
    return mappings


def _page_label(path: Path, content: str) -> str:
    for pat in (TITLE_RE, H1_RE):
        m = pat.search(content)
        if m:
            t = re.sub(r"\s+", " ", m.group(1)).strip()
            if t:
                return t
    return path.stem


def _extract_modals_from_view(
    path: Path,
    rel: str,
    content: str,
    parent_url: str,
) -> list[ScenarioCandidate]:
    if not MODAL_RE.search(content):
        return []
    out: list[ScenarioCandidate] = []
    for m in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', content, re.IGNORECASE):
        mid = m.group(1)
        if "modal" not in mid.lower() and "dialog" not in mid.lower() and "layer" not in mid.lower():
            continue
        sid = _slug(f"{rel}_{mid}")
        steps: list[dict[str, Any]] = []
        if parent_url:
            steps.append({"action": "goto", "path": parent_url})
        steps.append({"action": "wait", "selector": f"#{mid}"})
        out.append(
            ScenarioCandidate(
                state_id=sid,
                label=f"모달 {mid}",
                description=f"{rel} — id=#{mid}",
                kind="dialog",
                recommended=False,
                selectable=bool(parent_url),
                skip_reason="" if parent_url else "부모 URL 미확인 — 수동 확인",
                confidence="low",
                source_files=[rel],
                evidence=f"id=\"{mid}\"",
                ready_selector="body",
                steps=steps,
            )
        )
    return out


def extract_java_scenarios(root: Path, java_files: list[Path]) -> tuple[list[ScenarioCandidate], list[str]]:
    warnings: list[str] = []
    views = discover_view_files(root)
    view_index: dict[str, Path] = {}
    for vp in views:
        rel = _rel(root, vp).lower()
        view_index[rel] = vp
        view_index[rel.split("/")[-1]] = vp

    mappings = parse_spring_mappings(java_files, root)
    candidates: list[ScenarioCandidate] = []
    mapped_views: set[str] = set()

    for mp in mappings:
        vfile = _match_view_file(mp.view_name, view_index, root)
        vrel = _rel(root, vfile) if vfile else mp.view_name
        if vfile:
            mapped_views.add(_rel(root, vfile).lower())
        try:
            vcontent = vfile.read_text(encoding="utf-8", errors="replace") if vfile else ""
        except OSError:
            vcontent = ""
        sid = _slug(mp.url_path or mp.view_name)
        label = _page_label(vfile, vcontent) if vfile else mp.view_name
        risk: list[str] = []
        selectable = True
        skip_reason = ""
        if vcontent and FILE_INPUT_RE.search(vcontent):
            risk.append("file_input")
        if vcontent and CONFIRM_RE.search(vcontent):
            risk.append("confirm")
        steps = [
            {"action": "goto", "path": mp.url_path},
            {"action": "wait", "selector": "body"},
        ]
        candidates.append(
            ScenarioCandidate(
                state_id=sid,
                label=label,
                description=f"{mp.url_path} → {mp.view_name}",
                kind="page",
                recommended=True,
                selectable=selectable,
                skip_reason=skip_reason,
                risk=risk,
                confidence="high" if vfile else "medium",
                source_files=[vrel, mp.java_file],
                evidence=f"@GetMapping {mp.url_path}",
                ready_selector="body",
                steps=steps,
            )
        )
        if vfile and vcontent:
            candidates.extend(
                _extract_modals_from_view(vfile, vrel, vcontent, mp.url_path)
            )

    for vp in views:
        rel = _rel(root, vp)
        if rel.lower() in mapped_views:
            continue
        if _is_skipped(rel):
            continue
        try:
            content = vp.read_text(encoding="utf-8", errors="replace")
        except OSError:
            warnings.append(f"읽기 실패: {rel}")
            continue
        if _is_view_fragment(rel, content):
            continue
        if FILE_INPUT_RE.search(content) and "enctype" in content.lower():
            continue
        # URL 없는 단독 JSP는 시나리오 목록에 넣지 않음 — 정적 스캔 대상으로만 처리

    static_view_count = sum(
        1
        for vp in views
        if not _is_skipped(_rel(root, vp)) and not _is_view_fragment(_rel(root, vp))
    )
    fragment_count = len(views) - static_view_count

    if not candidates:
        if static_view_count:
            warnings.append(
                f"Spring URL 매핑은 없으나 JSP/HTML {static_view_count}개는 정적 진단 대상입니다."
                + (f" (include 조각 {fragment_count}개 제외)" if fragment_count else "")
            )
        else:
            warnings.append(
                "Java/JSP 화면 후보를 찾지 못했습니다. Spring @Controller + @RequestMapping 또는 JSP/HTML을 확인하세요."
            )
    elif not mappings:
        warnings.append(
            f"@RequestMapping URL 매핑 없음 — JSP/HTML {static_view_count}개는 정적 진단만 가능합니다."
            + " 화면 캡처는 Controller 매핑이 있거나 배포 URL을 알 때 가능합니다."
        )

    # dedupe state_id
    seen: set[str] = set()
    unique: list[ScenarioCandidate] = []
    for c in candidates:
        if c.state_id in seen:
            continue
        seen.add(c.state_id)
        unique.append(c)

    return unique, warnings


def extract_java_zip_scenarios(zip_bytes: bytes) -> dict[str, Any]:
    from source_scan.zip_ingest import cleanup_ingest, ingest_zip, validate_zip_bytes

    v = validate_zip_bytes(zip_bytes)
    if not v.get("can_run"):
        return {"ok": False, "message": v.get("message", "ZIP 검증 실패")}

    ing = ingest_zip(zip_bytes)
    try:
        if not ing.java_files and ing.primary_language != "java":
            jsp_count = len(discover_view_files(ing.root))
            if jsp_count == 0:
                return {
                    "ok": False,
                    "message": "Java/JSP/HTML 파일을 찾지 못했습니다.",
                    "warnings": ing.warnings,
                }
        candidates, warnings = extract_java_scenarios(ing.root, ing.java_files)
        defaults = [c.state_id for c in candidates if c.recommended and c.selectable]
        static_views = [
            _rel(ing.root, vp)
            for vp in discover_view_files(ing.root)
            if not _is_skipped(_rel(ing.root, vp))
            and not _is_view_fragment(_rel(ing.root, vp))
        ]
        return {
            "ok": True,
            "target": "java-upload",
            "target_name": "Java ZIP",
            "extractable": True,
            "primary_language": ing.primary_language or "java",
            "file_stats": {
                "java": len(ing.java_files),
                "views": len(discover_view_files(ing.root)),
                "static_views": len(static_views),
                "zip_mb": ing.zip_size_bytes // (1024 * 1024),
            },
            "candidates": [c.to_dict() for c in candidates],
            "defaults_selected": defaults,
            "warnings": warnings + ing.warnings,
            "static_only_hint": (
                f"JSP/HTML {len(static_views)}개는 URL 없이도 정적 진단됩니다."
                if static_views
                else ""
            ),
        }
    finally:
        cleanup_ingest(ing)
