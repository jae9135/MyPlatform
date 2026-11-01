#!/usr/bin/env python3
"""Build the user manuals as Word files from docs/manual Markdown sources."""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

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
    ("09-성능-진단.md", "09-성능-진단.docx"),
]
COMBINED = "MyPlatform-사용자매뉴얼-전체.docx"
INLINE_TOKEN = re.compile(r"(\*\*.+?\*\*|`.+?`|\*.+?\*|\[[^\]]+\]\([^)]+\))")


def set_font(run, name: str = "Malgun Gothic", size: float | None = None) -> None:
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)


def style_document(doc: Document) -> None:
    section = doc.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)
    section.top_margin = Inches(0.62)
    section.bottom_margin = Inches(0.62)
    section.left_margin = Inches(0.58)
    section.right_margin = Inches(0.58)

    for name, size, color in [
        ("Normal", 9.5, "243247"),
        ("Title", 22, "172B4D"),
        ("Heading 1", 15, "1E4F91"),
        ("Heading 2", 12, "285F9E"),
        ("Heading 3", 10.5, "384B63"),
    ]:
        style = doc.styles[name]
        style.font.name = "Malgun Gothic"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.font.bold = name != "Normal"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Malgun Gothic")
        style.paragraph_format.space_after = Pt(6 if name == "Normal" else 5)
        if name != "Normal":
            style.paragraph_format.keep_with_next = True
    doc.styles["Normal"].paragraph_format.line_spacing = 1.13


def add_inline(paragraph, text: str, size: float | None = None) -> None:
    pos = 0
    for match in INLINE_TOKEN.finditer(text):
        if match.start() > pos:
            run = paragraph.add_run(text[pos : match.start()])
            set_font(run, size=size)
        token = match.group(0)
        if token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith("` ") or token.startswith("`"):
            run = paragraph.add_run(token[1:-1])
            run.font.name = "Consolas"
            run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "Malgun Gothic")
            run.font.color.rgb = RGBColor.from_string("4B5563")
        elif token.startswith("*"):
            run = paragraph.add_run(token[1:-1])
            run.italic = True
        else:
            link = re.match(r"\[([^\]]+)\]\(([^)]+)\)", token)
            label, target = link.groups() if link else (token, "")
            run = paragraph.add_run(label)
            run.font.color.rgb = RGBColor.from_string("1769AA")
            if target:
                suffix = paragraph.add_run(f" ({target})")
                suffix.font.color.rgb = RGBColor.from_string("64748B")
                set_font(suffix, size=size)
        set_font(run, size=size)
        pos = match.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        set_font(run, size=size)


def parse_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def set_cell_shading(cell, fill: str) -> None:
    tcpr = cell._tc.get_or_add_tcPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill)
    tcpr.append(shading)


def set_repeat_table_header(row) -> None:
    trpr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    trpr.append(header)


def render_table(doc: Document, rows: list[list[str]]) -> None:
    columns = max(len(row) for row in rows)
    table = doc.add_table(rows=len(rows), cols=columns)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    table.style = "Table Grid"
    set_repeat_table_header(table.rows[0])
    for rindex, row in enumerate(rows):
        for cindex in range(columns):
            cell = table.cell(rindex, cindex)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            cell.text = ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, row[cindex] if cindex < len(row) else "", size=8.2)
            if rindex == 0:
                set_cell_shading(cell, "E8F0FA")
                for run in p.runs:
                    run.bold = True
                    run.font.color.rgb = RGBColor.from_string("173A63")
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def render_markdown(doc: Document, source: Path) -> None:
    lines = source.read_text(encoding="utf-8").splitlines()
    index = 0
    in_code = False
    code_lines: list[str] = []
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if stripped.startswith("```"):
            if in_code:
                for code_line in code_lines:
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Inches(0.16)
                    p.paragraph_format.space_after = Pt(1)
                    run = p.add_run(code_line or " ")
                    set_font(run, "Consolas", 8)
                    run.font.color.rgb = RGBColor.from_string("334155")
                code_lines.clear()
                in_code = False
            else:
                in_code = True
            index += 1
            continue
        if in_code:
            code_lines.append(line)
            index += 1
            continue
        if not stripped or stripped == "---":
            index += 1
            continue
        if stripped.startswith("|"):
            block: list[list[str]] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                row = parse_table_row(lines[index])
                if not all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in row):
                    block.append(row)
                index += 1
            if block:
                render_table(doc, block)
            continue
        image = re.fullmatch(r"!\[([^\]]*)\]\(([^)]+)\)", stripped)
        if image:
            alt, relative = image.groups()
            image_path = (source.parent / relative).resolve()
            if image_path.is_file():
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.keep_with_next = True
                p.add_run().add_picture(str(image_path), width=Inches(7.0))
                if alt:
                    caption = doc.add_paragraph()
                    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    caption.paragraph_format.space_after = Pt(8)
                    run = caption.add_run(alt)
                    set_font(run, size=8)
                    run.italic = True
                    run.font.color.rgb = RGBColor.from_string("64748B")
            index += 1
            continue
        heading = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading:
            level = len(heading.group(1))
            p = doc.add_paragraph(style="Title" if level == 1 else f"Heading {level - 1}")
            add_inline(p, heading.group(2))
            index += 1
            continue
        bullet = re.match(r"^\s*[-*]\s+(.+)$", line)
        number = re.match(r"^\s*\d+[.)]\s+(.+)$", line)
        if bullet or number:
            p = doc.add_paragraph(style="List Bullet" if bullet else "List Number")
            p.paragraph_format.space_after = Pt(3)
            add_inline(p, (bullet or number).group(1))
            index += 1
            continue
        p = doc.add_paragraph()
        add_inline(p, stripped)
        index += 1
    if in_code:
        for code_line in code_lines:
            p = doc.add_paragraph()
            run = p.add_run(code_line or " ")
            set_font(run, "Consolas", 8)


def build_docx(sources: list[Path], destination: Path, page_breaks: bool = False) -> None:
    doc = Document()
    style_document(doc)
    for pos, source in enumerate(sources):
        if pos and page_breaks:
            doc.add_page_break()
        render_markdown(doc, source)
    doc.core_properties.title = sources[0].stem if len(sources) == 1 else "MyPlatform 사용자 매뉴얼 전체"
    doc.save(destination)


def build_with_pandoc(sources: list[Path], destination: Path) -> None:
    cmd = ["pandoc", *[str(s) for s in sources], "-o", str(destination), "--from", "markdown", "--to", "docx"]
    subprocess.run(cmd, cwd=MANUAL, check=True)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    sources = [MANUAL / filename for filename, _ in FILES]
    missing = [source for source in sources if not source.is_file()]
    if missing:
        print("missing: " + ", ".join(str(path) for path in missing), file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory(prefix="word-build-", dir=MANUAL) as temp_dir:
        stage = Path(temp_dir)
        try:
            for (md_name, docx_name), source in zip(FILES, sources):
                destination = stage / docx_name
                if shutil.which("pandoc"):
                    build_with_pandoc([source], destination)
                else:
                    build_docx([source], destination)
                print(f"OK: {docx_name}")

            body_sources = sources[1:]
            combined_sources = [sources[0], *body_sources]
            combined_dest = stage / COMBINED
            if shutil.which("pandoc"):
                build_with_pandoc(combined_sources, combined_dest)
            else:
                build_docx(combined_sources, combined_dest, page_breaks=True)
            print(f"OK: {COMBINED}")

            for staged in stage.glob("*.docx"):
                shutil.copy2(staged, OUT / staged.name)
        except Exception as exc:
            print(f"Word build failed; existing manuals were preserved: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
