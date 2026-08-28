#!/usr/bin/env python3
"""Generate marketing images (652–2000px) and MP4 promos for 프로젝트 자동화 Platform."""

from __future__ import annotations

import json
import math
import textwrap
from datetime import datetime, timezone
from pathlib import Path

import imageio.v3 as iio
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "marketing-assets"
AI_HERO = Path(r"C:\Users\geotwo\.cursor\projects\c-Mywork-MyPlatform-2-0\assets\hero-ai-base.png")
if not AI_HERO.exists():
    AI_HERO = ROOT / "docs" / "marketing-assets" / "hero-ai-base.png"

BRAND = "프로젝트 자동화 Platform"
TAGLINE = "웹 품질·소스코드·DB·ERD를 자동으로 진단하는 프로젝트 자동화 플랫폼"
SUB = "소스코드·웹 품질·성능 진단 · DB 표준 · ERD · 산출물 · 일정 관리"

COLORS = {
    "bg": "#f4f7fb",
    "panel": "#ffffff",
    "line": "#e2e8f0",
    "text": "#0f172a",
    "dim": "#64748b",
    "accent": "#2563eb",
    "accent_dark": "#1e40af",
    "accent_dim": "#eff6ff",
    "green": "#059669",
    "teal": "#047857",
}

TOOLS = [
    ("01", "소스코드·보안 진단", "PMD · FindSecBugs · Bandit", "quality"),
    ("02", "웹 품질 진단", "Playwright · 시나리오 · 캡처", "quality"),
    ("03", "성능 진단", "Locust · TPS · 응답시간", "quality"),
    ("04", "DB 표준 점검", "용어·컬럼·테이블 규칙", "db"),
    ("05", "DBManager", "DDL · 동기화 · Supabase", "db"),
    ("06", "ER Modeler", "ERD · 관계 · 내보내기", "db"),
    ("07", "DeliverableManager", "산출물 · 상태 · 카탈로그", "pm"),
    ("08", "MyGantt", "WBS · 간트 · Excel", "pm"),
]

STEPS = ["문의", "요구사항", "데모 제작", "검수", "납품"]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path(r"C:\Windows\Fonts\malgunbd.ttf") if bold else Path(r"C:\Windows\Fonts\malgun.ttf"),
        Path(r"C:\Windows\Fonts\malgun.ttf"),
    ]
    for p in candidates:
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore


def gradient(w: int, h: int, top: str, bottom: str) -> Image.Image:
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    t = hex_rgb(top)
    b = hex_rgb(bottom)
    for y in range(h):
        r = y / max(h - 1, 1)
        c = tuple(int(t[i] + (b[i] - t[i]) * r) for i in range(3))
        draw.line([(0, y), (w, y)], fill=c)
    return img


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    radius: int,
    fill: str,
    outline: str | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_header_bar(draw: ImageDraw.ImageDraw, w: int, title: str) -> None:
    rounded_rect(draw, (0, 0, w, 56), 0, COLORS["panel"], COLORS["line"])
    draw.rectangle((0, 54, w, 56), fill=COLORS["line"])
    draw.text((24, 16), title, fill=hex_rgb(COLORS["text"]), font=font(18, True))
    draw.text((w - 180, 18), "PROJECT AUTOMATION", fill=hex_rgb(COLORS["accent"]), font=font(11))


def wrap_text(text: str, width: int) -> list[str]:
    return textwrap.wrap(text, width=width) or [text]


def hero_with_overlay(w: int, h: int, use_ai: bool = True) -> Image.Image:
    if use_ai and AI_HERO.exists():
        base = Image.open(AI_HERO).convert("RGB")
        base = base.resize((w, h), Image.Resampling.LANCZOS)
        overlay = Image.new("RGBA", (w, h), (244, 247, 251, 0))
        od = ImageDraw.Draw(overlay)
        od.rectangle((0, 0, int(w * 0.58), h), fill=(244, 247, 251, 210))
        base = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    else:
        base = gradient(w, h, COLORS["bg"], "#dbeafe")

    draw = ImageDraw.Draw(base)
    draw_header_bar(draw, w, BRAND)

    x, y = 48, 96
    draw.text((x, y), "PROJECT AUTOMATION", fill=hex_rgb(COLORS["accent"]), font=font(14))
    y += 28
    hero_lines = wrap_text(TAGLINE, 16 if w >= 1200 else 12)
    for i, line in enumerate(hero_lines[:2]):
        draw.text((x, y + i * 52), line, fill=hex_rgb(COLORS["text"]), font=font(36 if w >= 1200 else 24, True))
    y += 120 if w >= 1200 else 80
    for i, line in enumerate(wrap_text(SUB, 28 if w >= 1200 else 18)):
        draw.text((x, y + i * 26), line, fill=hex_rgb(COLORS["dim"]), font=font(16 if w >= 1200 else 13))

    badges = ["웹 브라우저 기반", "베타 프로그램", "맞춤 개발"]
    bx = x
    by = h - 72
    for b in badges:
        tw = draw.textlength(b, font=font(12))
        rounded_rect(draw, (bx, by, bx + int(tw) + 24, by + 32), 16, COLORS["accent_dim"], COLORS["accent"])
        draw.text((bx + 12, by + 7), b, fill=hex_rgb(COLORS["accent_dark"]), font=font(12))
        bx += int(tw) + 36

    return base


def tools_overview(w: int, h: int) -> Image.Image:
    img = gradient(w, h, COLORS["bg"], "#eef2ff")
    draw = ImageDraw.Draw(img)
    draw_header_bar(draw, w, "플랫폼 8종 프로그램")

    draw.text((48, 80), "한눈에 보는 도구 구성", fill=hex_rgb(COLORS["text"]), font=font(34, True))
    draw.text((48, 128), "품질 · DB·설계 · 업무 — 브라우저에서 바로 실행", fill=hex_rgb(COLORS["dim"]), font=font(16))

    cols = 4 if w >= 1200 else 2
    cw = (w - 96 - (cols - 1) * 16) // cols
    ch = 140 if h >= 900 else 120
    sx, sy = 48, 180
    cat_color = {"quality": COLORS["accent"], "db": COLORS["teal"], "pm": COLORS["green"]}

    for i, (num, name, desc, cat) in enumerate(TOOLS):
        col = i % cols
        row = i // cols
        x = sx + col * (cw + 16)
        y = sy + row * (ch + 16)
        rounded_rect(draw, (x, y, x + cw, y + ch), 14, COLORS["panel"], COLORS["line"], 2)
        draw.text((x + 16, y + 14), num, fill=hex_rgb(cat_color[cat]), font=font(22, True))
        draw.text((x + 16, y + 44), name, fill=hex_rgb(COLORS["text"]), font=font(16, True))
        for j, line in enumerate(wrap_text(desc, 14)):
            draw.text((x + 16, y + 72 + j * 18), line, fill=hex_rgb(COLORS["dim"]), font=font(12))

    return img


def workflow_slide(w: int, h: int) -> Image.Image:
    img = gradient(w, h, "#ffffff", COLORS["accent_dim"])
    draw = ImageDraw.Draw(img)
    draw_header_bar(draw, w, "맞춤 개발 프로세스")

    draw.text((48, 88), "요구사항부터 납품까지", fill=hex_rgb(COLORS["text"]), font=font(32, True))
    draw.text((48, 136), "화면/양식 변경 · 기능 추가 · 시스템 연동", fill=hex_rgb(COLORS["dim"]), font=font(16))

    n = len(STEPS)
    gap = 24
    box_w = min(220, (w - 96 - gap * (n - 1)) // n)
    start_x = (w - (box_w * n + gap * (n - 1))) // 2
    cy = h // 2 - 20

    for i, step in enumerate(STEPS):
        x = start_x + i * (box_w + gap)
        rounded_rect(draw, (x, cy, x + box_w, cy + 100), 16, COLORS["panel"], COLORS["accent"], 2)
        draw.text((x + 20, cy + 18), f"0{i + 1}", fill=hex_rgb(COLORS["accent"]), font=font(20, True))
        draw.text((x + 20, cy + 52), step, fill=hex_rgb(COLORS["text"]), font=font(22, True))
        if i < n - 1:
            ax = x + box_w + 4
            draw.polygon([(ax + 8, cy + 50), (ax + gap - 8, cy + 50), (ax + gap // 2, cy + 62)], fill=hex_rgb(COLORS["accent"]))

    cards = [
        ("화면/양식 변경", "회사 전용 Excel·보고서"),
        ("기능 추가", "진단 규칙·승인 흐름"),
        ("시스템 연동", "DB · API · 기존 업무"),
    ]
    cw = (w - 96 - 32) // 3
    for i, (t, b) in enumerate(cards):
        x = 48 + i * (cw + 16)
        y = h - 160
        rounded_rect(draw, (x, y, x + cw, y + 88), 12, COLORS["panel"], COLORS["line"])
        draw.text((x + 16, y + 16), t, fill=hex_rgb(COLORS["text"]), font=font(15, True))
        draw.text((x + 16, y + 44), b, fill=hex_rgb(COLORS["dim"]), font=font(13))

    return img


def category_slide(w: int, h: int, title: str, cats: str | list[str], accent: str) -> Image.Image:
    if isinstance(cats, str):
        cats = [cats]
    img = gradient(w, h, COLORS["bg"], COLORS["panel"])
    draw = ImageDraw.Draw(img)
    draw_header_bar(draw, w, title)
    draw.text((48, 84), title, fill=hex_rgb(COLORS["text"]), font=font(30, True))

    y = 150
    for num, name, desc, tool_cat in [t for t in TOOLS if t[3] in cats]:
        rounded_rect(draw, (48, y, w - 48, y + 96), 14, COLORS["panel"], accent, 2)
        draw.rectangle((48, y, 56, y + 96), fill=hex_rgb(accent))
        draw.text((72, y + 18), f"{num}  {name}", fill=hex_rgb(COLORS["text"]), font=font(20, True))
        draw.text((72, y + 52), desc, fill=hex_rgb(COLORS["dim"]), font=font(14))
        y += 112

    return img


def cta_slide(w: int, h: int) -> Image.Image:
    img = gradient(w, h, COLORS["accent_dark"], COLORS["accent"])
    draw = ImageDraw.Draw(img)
    draw.text((48, 48), BRAND, fill=(255, 255, 255), font=font(20, True))
    draw.text((48, h // 2 - 60), "베타 프로그램 · 맞춤 개발 문의", fill=(255, 255, 255), font=font(36, True))
    draw.text((48, h // 2), "브라우저에서 바로 체험하고, 필요한 기능은 함께 설계합니다.", fill=(230, 240, 255), font=font(18))
    rounded_rect(draw, (48, h // 2 + 48, 220, h // 2 + 96), 24, "#ffffff", None)
    draw.text((72, h // 2 + 62), "문의하기", fill=hex_rgb(COLORS["accent_dark"]), font=font(18, True))
    return img


def square_badge(size: int = 800) -> Image.Image:
    img = Image.new("RGB", (size, size), hex_rgb(COLORS["bg"]))
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (40, 40, size - 40, size - 40), 32, COLORS["panel"], COLORS["accent"], 3)
    draw.text((size // 2 - 120, 100), "PROJECT", fill=hex_rgb(COLORS["accent"]), font=font(22))
    draw.text((size // 2 - 180, 130), "AUTOMATION", fill=hex_rgb(COLORS["accent"]), font=font(22))
    lines = ["프로젝트", "자동화", "Platform"]
    for i, line in enumerate(lines):
        draw.text((size // 2 - 100, 220 + i * 56), line, fill=hex_rgb(COLORS["text"]), font=font(40 if i < 2 else 32, True))
    draw.text((size // 2 - 130, 420), "8종 웹 도구 · BETA", fill=hex_rgb(COLORS["dim"]), font=font(18))
    return img


VIDEO_W, VIDEO_H = 1920, 1088  # 16px aligned for H.264

DARK = {
    "bg": "#0f1419",
    "panel": "#161b22",
    "line": "#30363d",
    "text": "#e8eef4",
    "muted": "#8b9aab",
    "primary": "#2563eb",
    "green": "#3ecf8e",
    "amber": "#f0b429",
    "red": "#ff7b72",
}

APP_HOME_META = [
    ("source-scan", "app-01-source-scan-home.jpg", "소스코드·보안 진단", "/apps/source-scan", "PMD · FindSecBugs · Bandit/ESLint ZIP 진단"),
    ("web-quality", "app-02-web-quality-home.jpg", "웹 품질 진단", "/apps/web-quality", "KWCAG 2.2 · 웹표준/호환/접근성 · Playwright"),
    ("perf-test", "app-03-perf-test-home.jpg", "성능 진단", "/apps/perf-test", "Locust HTTP 부하 · TPS · p95 · 오류율"),
    ("chk-db-std", "app-04-chk-db-std-home.jpg", "DB 표준 점검", "/apps/chk-db-std", "행안부 공통표준 · 용어/도메인/코드 점검"),
    ("db-manager", "app-05-db-manager-home.jpg", "DBManager", "/apps/db-manager", "테이블정의서 → PostgreSQL DDL / 데이터 관리"),
    ("er-modeler", "app-06-er-modeler-home.jpg", "ER Modeler", "/apps/er-modeler", "테이블정의서 → ERD 편집 → 설계서 내보내기"),
    ("deliverable-manager", "app-07-deliverable-manager-home.jpg", "DeliverableManager", "/apps/deliverable-manager", "산출물 카탈로그 · 단계 · 상태 관리"),
    ("my-gantt", "app-08-my-gantt-home.jpg", "MyGantt", "/apps/my-gantt", "WBS · 간트 · Excel export · 공유 링크"),
]


def _mock_panel(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str) -> int:
    rounded_rect(draw, (x, y, x + w, y + h), 8, DARK["panel"], DARK["line"])
    draw.text((x + 12, y + 10), title, fill=hex_rgb(DARK["text"]), font=font(13, True))
    return y + 36


def _mock_row(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, label: str, value: str) -> int:
    draw.text((x + 12, y), label, fill=hex_rgb(DARK["muted"]), font=font(11))
    tw = draw.textlength(value, font=font(11))
    draw.text((x + w - 12 - tw, y), value, fill=hex_rgb(DARK["text"]), font=font(11))
    draw.line([(x + 12, y + 20), (x + w - 12, y + 20)], fill=hex_rgb(DARK["line"]))
    return y + 28


def _mock_btn(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, primary: bool = False) -> int:
    tw = int(draw.textlength(text, font=font(11, True))) + 24
    fill = DARK["primary"] if primary else DARK["panel"]
    outline = DARK["primary"] if primary else DARK["line"]
    rounded_rect(draw, (x, y, x + tw, y + 28), 6, fill, outline)
    fg = (255, 255, 255) if primary else hex_rgb(DARK["text"])
    draw.text((x + 12, y + 6), text, fill=fg, font=font(11, True))
    return y + 36


def _mock_tabs(draw: ImageDraw.ImageDraw, x: int, y: int, items: list[str], active: int = 0) -> int:
    cx = x
    for i, item in enumerate(items):
        tw = int(draw.textlength(item, font=font(11))) + 16
        if i == active:
            rounded_rect(draw, (cx, y, cx + tw, y + 26), 6, DARK["primary"], DARK["primary"])
            draw.text((cx + 8, y + 5), item, fill=(255, 255, 255), font=font(11))
        else:
            draw.text((cx + 8, y + 5), item, fill=hex_rgb(DARK["muted"]), font=font(11))
        cx += tw + 8
    return y + 34


def _mock_table(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, cols: list[str], rows: list[list[str]]) -> int:
    col_w = max(80, (w - 24) // len(cols))
    hy = y
    for i, c in enumerate(cols):
        draw.text((x + 12 + i * col_w, hy), c, fill=hex_rgb(DARK["muted"]), font=font(10, True))
    hy += 22
    draw.line([(x + 12, hy), (x + w - 12, hy)], fill=hex_rgb(DARK["line"]))
    hy += 8
    for row in rows:
        for i, cell in enumerate(row):
            draw.text((x + 12 + i * col_w, hy), cell, fill=hex_rgb(DARK["text"]), font=font(10))
        hy += 20
    return hy + 4


def _mock_bars(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, items: list[tuple[str, int, str]]) -> int:
    for label, pct, color in items:
        draw.text((x + 12, y), label, fill=hex_rgb(DARK["muted"]), font=font(10))
        bx, bw = x + 12, w - 24
        rounded_rect(draw, (bx, y + 16, bx + bw, y + 24), 4, DARK["line"])
        fill_w = max(4, int(bw * pct / 100))
        rounded_rect(draw, (bx, y + 16, bx + fill_w, y + 24), 4, color)
        draw.text((bx + bw - 28, y), f"{pct}%", fill=hex_rgb(DARK["text"]), font=font(10))
        y += 36
    return y


def _mock_erd(draw: ImageDraw.ImageDraw, x: int, y: int) -> int:
    boxes = [(x + 20, y, 100, 56), (x + 160, y + 30, 110, 56), (x + 320, y, 95, 56)]
    for bx, by, bw, bh in boxes:
        rounded_rect(draw, (bx, by, bx + bw, by + bh), 6, DARK["panel"], DARK["green"])
        draw.text((bx + 10, by + 10), "CUSTOMER", fill=hex_rgb(DARK["text"]), font=font(9, True))
    draw.line([(120, y + 28), (160, y + 58)], fill=hex_rgb(DARK["green"]), width=2)
    draw.line([(270, y + 58), (320, y + 28)], fill=hex_rgb(DARK["green"]), width=2)
    return y + 100


def _mock_gantt(draw: ImageDraw.ImageDraw, x: int, y: int, w: int) -> int:
    half = w // 2 - 16
    rounded_rect(draw, (x + 12, y, x + 12 + half, y + 100), 8, DARK["panel"], DARK["line"])
    for i, label in enumerate(["1.1 요구분석", "1.2 설계", "2.1 개발"]):
        draw.text((x + 20, y + 12 + i * 26), label, fill=hex_rgb(DARK["text"]), font=font(10))
    gx = x + 24 + half
    rounded_rect(draw, (gx, y, gx + half, y + 100), 8, DARK["panel"], DARK["line"])
    for top, left_pct, width_pct, color in [(24, 0, 35, DARK["green"]), (52, 10, 30, DARK["green"]), (80, 35, 40, DARK["primary"])]:
        bx = gx + 12 + int((half - 24) * left_pct / 100)
        bw = max(8, int((half - 24) * width_pct / 100))
        rounded_rect(draw, (bx, y + top, bx + bw, y + top + 12), 3, color)
    return y + 110


def _draw_app_body(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, app_id: str) -> None:
    if app_id == "source-scan":
        draw.text((x + 12, y), "소스코드·보안 진단", fill=hex_rgb(DARK["muted"]), font=font(11))
        py = _mock_panel(draw, x + 12, y + 24, w - 24, 120, "진단 실행")
        py = _mock_row(draw, x + 24, py, w - 48, "ZIP 파일", "project.zip 선택됨")
        py = _mock_row(draw, x + 24, py, w - 48, "스택", "Java + Python + TS")
        _mock_btn(draw, x + 24, py + 4, "진단 실행", primary=True)
        ty = _mock_tabs(draw, x + 12, y + 154, ["전체", "HIGH", "MED", "LOW", "Diff"])
        _mock_table(draw, x + 12, ty, w - 24, ["심각도", "파일", "메시지"], [["HIGH", "auth.py:44", "하드코딩 자격증명"]])
    elif app_id == "web-quality":
        draw.text((x + 12, y), "웹 품질 진단", fill=hex_rgb(DARK["muted"]), font=font(11))
        ty = _mock_tabs(draw, x + 12, y + 24, ["전체", "웹표준", "웹호환", "웹접근성", "캡처"])
        _mock_bars(draw, x + 12, ty + 8, w - 24, [("웹표준", 90, DARK["green"]), ("웹호환", 78, DARK["amber"]), ("웹접근성", 74, DARK["red"])])
    elif app_id == "perf-test":
        draw.text((x + 12, y), "성능 진단", fill=hex_rgb(DARK["muted"]), font=font(11))
        py = _mock_panel(draw, x + 12, y + 24, w - 24, 130, "부하 설정")
        py = _mock_row(draw, x + 24, py, w - 48, "대상", "MyGantt (포털)")
        py = _mock_row(draw, x + 24, py, w - 48, "VU", "5")
        py = _mock_row(draw, x + 24, py, w - 48, "Duration", "30초")
        _mock_btn(draw, x + 24, py + 4, "성능검사 실행", primary=True)
        _mock_bars(draw, x + 12, y + 168, w - 24, [("TPS", 82, DARK["green"]), ("p95 (ms)", 65, DARK["amber"]), ("오류율", 8, DARK["red"])])
    elif app_id == "chk-db-std":
        draw.text((x + 12, y), "DB 표준 점검", fill=hex_rgb(DARK["muted"]), font=font(11))
        ty = _mock_tabs(draw, x + 12, y + 24, ["점검", "표준용어 생성", "샘플"])
        py = _mock_panel(draw, x + 12, ty + 8, w - 24, 110, "테이블정의서 업로드")
        py = _mock_row(draw, x + 24, py, w - 48, "파일", "table_def.xlsx")
        py = _mock_row(draw, x + 24, py, w - 48, "종류", "용어 · 도메인")
        _mock_btn(draw, x + 24, py + 4, "점검 실행", primary=True)
    elif app_id == "db-manager":
        draw.text((x + 12, y), "DBManager", fill=hex_rgb(DARK["muted"]), font=font(11))
        ty = _mock_tabs(draw, x + 12, y + 24, ["DDL 생성", "DB 적용", "데이터", "역동기화"])
        py = _mock_panel(draw, x + 12, ty + 8, w - 24, 100, "테이블정의서")
        py = _mock_row(draw, x + 24, py, w - 48, "Excel", "design.xlsx · 8 tables")
        _mock_btn(draw, x + 24, py + 4, "DDL 생성", primary=True)
    elif app_id == "er-modeler":
        draw.text((x + 12, y), "ER Modeler", fill=hex_rgb(DARK["muted"]), font=font(11))
        py = _mock_panel(draw, x + 12, y + 24, w - 24, 90, "Import")
        py = _mock_row(draw, x + 24, py, w - 48, "소스", "table_def.xlsx")
        _mock_btn(draw, x + 24, py + 4, "ERD 열기", primary=True)
        _mock_erd(draw, x + 12, y + 124)
    elif app_id == "deliverable-manager":
        draw.text((x + 12, y), "DeliverableManager", fill=hex_rgb(DARK["muted"]), font=font(11))
        ty = _mock_row(draw, x + 12, y + 24, w - 24, "검색", "테이블정의서")
        _mock_table(draw, x + 12, ty + 8, w - 24, ["산출물", "단계", "유형"], [["테이블정의서", "설계", "양식"]])
    elif app_id == "my-gantt":
        draw.text((x + 12, y), "MyGantt", fill=hex_rgb(DARK["muted"]), font=font(11))
        ty = _mock_tabs(draw, x + 12, y + 24, ["WBS", "간트", "설정"])
        ty = _mock_table(draw, x + 12, ty + 8, w - 24, ["WBS", "기간", "공정율"], [["1.1 요구분석", "5일", "100%"]])
        _mock_gantt(draw, x + 12, ty + 8, w - 24)


def _draw_browser_mock(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, url: str, app_id: str) -> None:
    rounded_rect(draw, (x, y, x + w, y + h), 14, "#ffffff", COLORS["line"], 2)
    draw.rectangle((x, y, x + w, y + 44), fill="#f1f5f9")
    draw.line([(x, y + 44), (x + w, y + 44)], fill=hex_rgb(COLORS["line"]))
    for i, c in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
        draw.ellipse((x + 16 + i * 16, y + 16, x + 24 + i * 16, y + 24), fill=c)
    draw.text((x + 72, y + 14), url, fill=hex_rgb(COLORS["dim"]), font=font(12))
    draw.rectangle((x, y + 44, x + w, y + h), fill=hex_rgb(DARK["bg"]))
    _draw_app_body(draw, x, y + 56, w, app_id)


def app_home_slide(app_id: str, title: str, href: str, tagline: str, out_w: int = 1920, out_h: int = 1080) -> Image.Image:
    num = "00"
    for t in TOOLS:
        if (app_id == "source-scan" and t[0] == "01") or (app_id == "web-quality" and t[0] == "02") or (app_id == "perf-test" and t[0] == "03") or (app_id == "chk-db-std" and t[0] == "04") or (app_id == "db-manager" and t[0] == "05") or (app_id == "er-modeler" and t[0] == "06") or (app_id == "deliverable-manager" and t[0] == "07") or (app_id == "my-gantt" and t[0] == "08"):
            num = t[0]
            break

    img = gradient(out_w, out_h, COLORS["bg"], "#eef2ff")
    draw = ImageDraw.Draw(img)
    draw.text((48, 40), f"{num}  {title}", fill=hex_rgb(COLORS["text"]), font=font(36, True))
    draw.text((48, 88), "메인 화면 · 베타 프로그램", fill=hex_rgb(COLORS["dim"]), font=font(18))
    for i, line in enumerate(wrap_text(tagline, 52)):
        draw.text((48, 118 + i * 24), line, fill=hex_rgb(COLORS["dim"]), font=font(14))

    bw = min(1100, out_w - 96)
    bh = min(620, out_h - 200)
    bx = (out_w - bw) // 2
    by = out_h - bh - 48
    _draw_browser_mock(draw, bx, by, bw, bh, f"https://portal.example.com{href}", app_id)
    draw.text((48, out_h - 36), BRAND, fill=hex_rgb(COLORS["accent"]), font=font(12))
    return img


def generate_app_home_images(images_dir: Path) -> list[Image.Image]:
    apps_dir = images_dir / "apps"
    apps_dir.mkdir(exist_ok=True)
    slides: list[Image.Image] = []
    for app_id, fname, title, href, tagline in APP_HOME_META:
        img = app_home_slide(app_id, title, href, tagline, 1920, 1080)
        img.save(apps_dir / fname, "JPEG", quality=92, optimize=True)
        slides.append(img.copy())
    return slides


def make_gif(frames: list[Image.Image], path: Path, duration_ms: int = 900) -> None:
    rgb_frames = [f.convert("RGB") for f in frames]
    rgb_frames[0].save(
        path,
        save_all=True,
        append_images=rgb_frames[1:],
        duration=duration_ms,
        loop=0,
        optimize=True,
    )


def save_jpg(img: Image.Image, path: Path, quality: int = 92) -> dict:
    rgb = img.convert("RGB")
    rgb.save(path, "JPEG", quality=quality, optimize=True)
    return {"path": str(path.relative_to(ROOT)), "width": rgb.width, "height": rgb.height, "bytes": path.stat().st_size}


def save_png(img: Image.Image, path: Path) -> dict:
    img.save(path, "PNG", optimize=True)
    return {"path": str(path.relative_to(ROOT)), "width": img.width, "height": img.height, "bytes": path.stat().st_size}


def ken_burns_frame(img: Image.Image, t: float, out_w: int, out_h: int) -> np.ndarray:
    """t in [0,1] — slow zoom + pan."""
    iw, ih = img.size
    scale = 1.0 + 0.08 * t
    crop_w = int(out_w * scale)
    crop_h = int(out_h * scale)
    crop_w = min(crop_w, iw)
    crop_h = min(crop_h, ih)
    x = int((iw - crop_w) * (0.1 + 0.15 * t))
    y = int((ih - crop_h) * 0.05 * t)
    crop = img.crop((x, y, x + crop_w, y + crop_h)).resize((out_w, out_h), Image.Resampling.LANCZOS)
    return np.array(crop.convert("RGB"))


def build_video(slides: list[Image.Image], path: Path, seconds_per_slide: float = 5.0, fps: int = 30) -> dict:
    out_w, out_h = VIDEO_W, VIDEO_H
    frames: list[np.ndarray] = []
    fade = int(fps * 0.6)
    per = int(fps * seconds_per_slide)

    sized = [s.resize((out_w, out_h), Image.Resampling.LANCZOS) for s in slides]

    for idx, slide in enumerate(sized):
        for f in range(per):
            t = f / max(per - 1, 1)
            frame = ken_burns_frame(slide, t, out_w, out_h)
            if f < fade and idx > 0:
                prev = ken_burns_frame(sized[idx - 1], 1.0, out_w, out_h)
                a = f / fade
                frame = (frame.astype(np.float32) * a + prev.astype(np.float32) * (1 - a)).astype(np.uint8)
            frames.append(frame)

    iio.imwrite(path, frames, fps=fps, codec="libx264", quality=8, pixelformat="yuv420p")
    return {
        "path": str(path.relative_to(ROOT)),
        "width": out_w,
        "height": out_h,
        "frames": len(frames),
        "duration_sec": round(len(frames) / fps, 1),
        "bytes": path.stat().st_size,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    images_dir = OUT / "images"
    videos_dir = OUT / "videos"
    images_dir.mkdir(exist_ok=True)
    videos_dir.mkdir(exist_ok=True)

    manifest: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "brand": BRAND,
        "deterministic": True,
        "note": "동일 스크립트·설정으로 재실행하면 같은 결과입니다. hero-ai-base.png 또는 TOOLS/BRAND 상수를 바꾸면 달라집니다.",
        "images": [],
        "app_home_images": [],
        "videos": [],
    }

    specs = [
        ("01-hero-main.jpg", lambda: hero_with_overlay(1920, 1080), "jpg"),
        ("02-hero-medium.jpg", lambda: hero_with_overlay(1200, 675), "jpg"),
        ("03-hero-minimum.jpg", lambda: hero_with_overlay(652, 366), "jpg"),
        ("04-tools-overview.png", lambda: tools_overview(1920, 1080), "png"),
        ("05-workflow.jpg", lambda: workflow_slide(1600, 900), "jpg"),
        ("06-quality-category.jpg", lambda: category_slide(1920, 900, "품질 · 진단 도구", "quality", COLORS["accent"]), "jpg"),
        ("07-db-pm-category.jpg", lambda: category_slide(1920, 900, "DB·설계 · 업무 도구", ["db", "pm"], COLORS["teal"]), "jpg"),
        ("08-cta-contact.jpg", lambda: cta_slide(1200, 630), "jpg"),
        ("09-platform-badge.png", lambda: square_badge(800), "png"),
        ("10-tools-grid-wide.jpg", lambda: tools_overview(2000, 1125), "jpg"),
    ]

    slide_sources: list[Image.Image] = []
    for name, fn, fmt in specs:
        img = fn()
        path = images_dir / name
        if fmt == "jpg":
            info = save_jpg(img, path)
        else:
            info = save_png(img, path)
        manifest["images"].append(info)
        if "hero" in name or "tools" in name or "workflow" in name or "cta" in name:
            slide_sources.append(img.copy())

    # Per-app main menu screens
    app_slides = generate_app_home_images(images_dir)
    for app_id, fname, title, href, tagline in APP_HOME_META:
        p = images_dir / "apps" / fname
        manifest["app_home_images"].append(
            {
                "app_id": app_id,
                "title": title,
                "path": str(p.relative_to(ROOT)),
                "width": 1920,
                "height": 1080,
                "bytes": p.stat().st_size,
            }
        )

    # GIF (652 width minimum) — hero + sample apps + cta
    gif_frames = [
        hero_with_overlay(652, 366).resize((652, 366)),
        tools_overview(652, 366).resize((652, 366)),
        app_home_slide("web-quality", "웹 품질 진단", "/apps/web-quality", "KWCAG 2.2", 652, 366),
        app_home_slide("my-gantt", "MyGantt", "/apps/my-gantt", "WBS · 간트", 652, 366),
        cta_slide(652, 366),
    ]
    gif_path = images_dir / "11-animated-banner.gif"
    make_gif(gif_frames, gif_path)
    manifest["images"].append(
        {"path": str(gif_path.relative_to(ROOT)), "width": 652, "height": 366, "bytes": gif_path.stat().st_size}
    )

    # Videos — include all app main screens
    v1_slides = slide_sources[:2] + app_slides + slide_sources[2:4] + [cta_slide(1920, 1080)]
    v1 = build_video(v1_slides, videos_dir / "01-promo-overview.mp4", seconds_per_slide=4.0)
    manifest["videos"].append(v1)

    v2_slides = [tools_overview(1920, 1080)] + app_slides + [cta_slide(1920, 1080)]
    v2 = build_video(v2_slides, videos_dir / "02-promo-tools.mp4", seconds_per_slide=3.5)
    manifest["videos"].append(v2)

    v3 = build_video(app_slides + [cta_slide(1920, 1080)], videos_dir / "03-promo-app-screens.mp4", seconds_per_slide=3.5)
    manifest["videos"].append(v3)

    total_video = sum(v["bytes"] for v in manifest["videos"])
    manifest["total_video_bytes"] = total_video
    manifest["total_video_mb"] = round(total_video / (1024 * 1024), 2)

    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    for img in manifest["images"] + manifest["app_home_images"]:
        assert 652 <= img["width"] <= 2000, f"width out of range: {img}"
    assert total_video <= 500 * 1024 * 1024, f"videos exceed 500MB: {manifest['total_video_mb']} MB"
    print(f"\nOK - assets in {OUT}")


if __name__ == "__main__":
    main()
