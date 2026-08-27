#!/usr/bin/env python3
"""Convert docs/manual/*.md to Word (.docx) via pandoc."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUAL = ROOT / "docs" / "manual"
OUT = MANUAL / "word"

FILES = [
    ("README.md", "00-MyPlatform-매뉴얼-목차.docx"),
    ("00-MyPlatform-공통.md", "00-MyPlatform-공통.docx"),
    ("01-소스코드-보안-진단.md", "01-소스코드-보안-진단.docx"),
    ("02-웹-품질-진단.md", "02-웹-품질-진단.docx"),
    ("03-DB-표준-점검.md", "03-DB-표준-점검.docx"),
    ("04-DBManager.md", "04-DBManager.docx"),
    ("05-ER-Modeler.md", "05-ER-Modeler.docx"),
    ("06-DeliverableManager.md", "06-DeliverableManager.docx"),
    ("07-ReceiptToPDF.md", "07-ReceiptToPDF.docx"),
    ("08-MyGantt.md", "08-MyGantt.docx"),
]

COMBINED = "MyPlatform-사용자매뉴얼-전체.docx"


def run_pandoc(sources: list[Path], dest: Path) -> None:
    cmd = ["pandoc", *[str(s) for s in sources], "-o", str(dest), "--from", "markdown", "--to", "docx"]
    subprocess.run(cmd, cwd=MANUAL, check=True)


def main() -> int:
    if shutil.which("pandoc") is None:
        print("pandoc not found in PATH", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)

    # Remove old docx (including mojibake names)
    for p in OUT.glob("*.docx"):
        p.unlink()

    sources: list[Path] = []
    for md_name, docx_name in FILES:
        src = MANUAL / md_name
        if not src.is_file():
            print(f"missing: {src}", file=sys.stderr)
            return 1
        dest = OUT / docx_name
        run_pandoc([src], dest)
        print(f"OK: {dest.relative_to(ROOT)}")

    for md_name, _ in FILES[1:]:  # skip README for body-only order
        sources.append(MANUAL / md_name)

    combined_src = [MANUAL / FILES[0][0], *sources]
    combined_dest = OUT / COMBINED
    run_pandoc(combined_src, combined_dest)
    print(f"OK: {combined_dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
