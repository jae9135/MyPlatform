"""
Build public test shells from the local study manifest (read-only).

Does not copy real hwp/xlsx. Writes tiny .txt files named {lastFolder}_{output}.txt
plus catalog.json under ./out/

Usage:
  python build_placeholders.py
  python build_placeholders.py --manifest "D:\\path\\data\\manifest.json"
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
DEFAULT_MANIFEST = Path(
    r"C:\Mywork\AI\cursor\09 독자 제공용 파일\study\DeliverableManager\data\manifest.json"
)
KINDS = ("deliverable", "template", "reference")
REFERENCE_SITES = (
    {"id": "site-a", "label": "공공 유사사업", "folder": "site-a"},
    {"id": "site-b", "label": "민간 유사사업", "folder": "site-b"},
)
ASCII_KEY = re.compile(r"^[A-Za-z0-9._-]+$")


def ascii_id(text: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", (text or "").strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-._")
    return cleaned or "item"


def display_filename(dir_parts: list[str], output: str) -> str:
    last = dir_parts[-1] if dir_parts else "item"
    name = f"{last}_{output}.txt".replace(" ", "_")
    return re.sub(r"[\\/:*?\"<>|]+", "_", name)


def object_path_for(kind: str, item_id: str, site_id: str | None = None) -> str:
    safe_id = ascii_id(item_id)
    if kind == "reference":
        return f"reference/{ascii_id(site_id or 'site')}/{safe_id}.txt"
    return f"{kind}/{safe_id}.txt"


def match_dir_parts(item: dict) -> list[str] | None:
    matches = item.get("matches") or {}
    for kind in KINDS:
        for row in matches.get(kind) or []:
            raw = str(row.get("path") or "").replace("\\", "/").strip("/")
            if not raw or ".." in raw.split("/"):
                continue
            parts = [p for p in raw.split("/") if p]
            if not parts:
                continue
            if row.get("type") == "dir":
                return parts
            return parts[:-1] if len(parts) > 1 else parts
    return None


def write_shell(
    used_paths: set[str],
    item_id: str,
    kind: str,
    dir_parts: list[str],
    output: str,
    site_id: str | None = None,
    label: str | None = None,
    line: str | None = None,
) -> tuple[dict, int]:
    object_path = object_path_for(kind, item_id, site_id)
    collisions = 0
    if object_path in used_paths:
        stem = Path(object_path).stem
        object_path = f"{Path(object_path).parent.as_posix()}/{stem}-dup.txt"
        collisions = 1
    used_paths.add(object_path)
    dest = OUT / object_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    folder_label = "/".join(dir_parts)
    if site_id:
        site_label = next(
            (s["label"] for s in REFERENCE_SITES if s["id"] == site_id), site_id
        )
        folder_label = f"{site_label}/{folder_label}"
    dest.write_text((line or f"{folder_label} / {output}") + "\n", encoding="utf-8")
    record = {
        "path": object_path,
        "name": display_filename(dir_parts, output),
        "folder": folder_label,
        "label": label or output,
    }
    return record, collisions


def build(manifest_path: Path) -> dict:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    tabs = data.get("tabs") or {}
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    catalog_tabs: dict[str, list] = {}
    files_written = 0
    collisions = 0
    used_paths: set[str] = set()

    for tab, items in tabs.items():
        catalog_items = []
        for item in items:
            dir_parts = match_dir_parts(item)
            if not dir_parts:
                prefix = "1000.사업관리" if tab == "biz" else "2000.개발관리"
                dir_parts = [prefix, ascii_id(item.get("id") or "item")]
            output = str(item.get("output") or item.get("id") or "산출물")
            item_id = str(item.get("id") or "item")
            files: dict[str, list] = {}
            for kind in ("deliverable", "template"):
                record, hit = write_shell(
                    used_paths, item_id, kind, dir_parts, output, label=output
                )
                collisions += hit
                files_written += 1
                files[kind] = [record]
            ref_files = []
            for site in REFERENCE_SITES:
                record, hit = write_shell(
                    used_paths,
                    item_id,
                    "reference",
                    dir_parts,
                    output,
                    site_id=site["id"],
                    label=site["label"],
                    line=f"{site['label']} / {'/'.join(dir_parts)} / {output}",
                )
                collisions += hit
                files_written += 1
                ref_files.append(record)
            files["reference"] = ref_files

            catalog_items.append(
                {
                    "id": item.get("id"),
                    "tab": tab,
                    "phase": item.get("phase") or "",
                    "code": item.get("code") or "",
                    "activity": item.get("activity") or "",
                    "task": item.get("task") or "",
                    "output": output,
                    "size_large": item.get("size_large"),
                    "size_medium": item.get("size_medium"),
                    "size_small": item.get("size_small"),
                    "files": files,
                }
            )
        catalog_tabs[tab] = catalog_items

    catalog = {
        "version": 1,
        "public": True,
        "placeholder": True,
        "bucket": "samples",
        "prefix": "deliverable-manager",
        "kinds": {
            "deliverable": "관련 산출물",
            "template": "양식",
            "reference": "타사이트 참고자료",
        },
        "reference_sites": [
            {"id": site["id"], "label": site["label"], "folder": site["folder"]}
            for site in REFERENCE_SITES
        ],
        "tabs": catalog_tabs,
        "stats": {
            "items": sum(len(v) for v in catalog_tabs.values()),
            "files": files_written,
            "collisions": collisions,
        },
    }
    (OUT / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return catalog


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if not args.manifest.is_file():
        raise SystemExit(f"manifest not found (read-only source): {args.manifest}")

    catalog = build(args.manifest)
    stats = catalog["stats"]
    print(f"Manifest: {args.manifest}")
    print(f"Out: {OUT}")
    print(f"Items: {stats['items']}")
    print(f"Placeholder files: {stats['files']}")
    print(f"Name collisions renamed: {stats['collisions']}")
    bad = [
        p.relative_to(OUT).as_posix()
        for p in OUT.rglob("*")
        if p.is_file()
        and p.name != "catalog.json"
        and not ASCII_KEY.match(p.relative_to(OUT).as_posix().replace("/", ""))
    ]
    if bad:
        raise SystemExit(f"Non-ASCII storage keys: {bad[:5]}")
    print("Real documents were not copied.")


if __name__ == "__main__":
    main()
