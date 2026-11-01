#!/usr/bin/env python3
"""
Open Graph(공유 미리보기) 이미지 생성 — 1200×630 JPG
네이버 블로그·카카오톡·페이스북 등에 링크를 붙였을 때 보이는 썸네일입니다.

한글 폰트가 없으면 글자가 □□□ 로 깨지므로, 한글 폰트를 찾지 못하면 실패로 끝냅니다.
  Windows: 맑은 고딕 (C:\\Windows\\Fonts\\malgunbd.ttf)
  macOS:   Apple SD Gothic Neo
  Linux:   Noto Sans CJK (fonts-noto-cjk)
직접 지정: OG_FONT_BOLD=경로 OG_FONT_REGULAR=경로

사용: python scripts/generate_og_image.py
     (도메인 변경 시 OG_SITE_HOST=example.com)
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1200, 630
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "apps", "portal", "public")
OUTPUT_PATH = os.path.join(PUBLIC_DIR, "marketing", "og-image-v2.jpg")
SHOT_PATH = os.path.join(PUBLIC_DIR, "marketing", "screens", "std-home.webp")
SITE_HOST = os.environ.get("OG_SITE_HOST", "project-auto-platform.vercel.app")

BG_TOP = (30, 64, 175)  # #1e40af
BG_BOTTOM = (15, 23, 42)  # #0f172a
WHITE = (255, 255, 255)
LIGHT = (203, 213, 225)  # #cbd5e1
ACCENT = (96, 165, 250)  # #60a5fa

BOLD_CANDIDATES = [
    os.environ.get("OG_FONT_BOLD", ""),
    r"C:\Windows\Fonts\malgunbd.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]
REGULAR_CANDIDATES = [
    os.environ.get("OG_FONT_REGULAR", ""),
    r"C:\Windows\Fonts\malgun.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]


def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if not path or not os.path.exists(path):
            continue
        # .ttc 는 index 1 이 KR 인 경우가 많음 (Noto CJK: 0=JP,1=KR)
        indices = [1, 0] if path.endswith(".ttc") and "Noto" in path else [0]
        for idx in indices:
            try:
                return ImageFont.truetype(path, size, index=idx)
            except OSError:
                continue
    sys.exit("한글 폰트를 찾지 못했습니다. OG_FONT_BOLD / OG_FONT_REGULAR 로 경로를 지정하세요.")


def check_korean(font: ImageFont.FreeTypeFont) -> None:
    """'가'와 미지원 문자(□)의 모양이 같으면 한글 미지원 폰트"""
    a = font.getmask("가").getbbox()
    b = font.getmask("\uffff").getbbox()
    if a is None or a == b:
        sys.exit(f"선택된 폰트가 한글을 지원하지 않습니다: {font.path}")


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=radius, fill=255)
    out = Image.new("RGBA", img.size)
    out.paste(img.convert("RGBA"), (0, 0), mask)
    return out


def create_og_image() -> str:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_BOTTOM)
    draw = ImageDraw.Draw(img)
    for y in range(HEIGHT):
        t = y / HEIGHT
        c = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        draw.line([(0, y), (WIDTH, y)], fill=c)

    f_eyebrow = load_font(BOLD_CANDIDATES, 22)
    f_title = load_font(BOLD_CANDIDATES, 58)
    f_sub = load_font(REGULAR_CANDIDATES, 28)
    f_badge = load_font(BOLD_CANDIDATES, 24)
    f_url = load_font(REGULAR_CANDIDATES, 22)
    for f in (f_title, f_sub):
        check_korean(f)

    # 오른쪽: 실제 프로그램 화면 (DB 표준 점검 결과)
    if os.path.exists(SHOT_PATH):
        shot = Image.open(SHOT_PATH).convert("RGB")
        sw = 560
        shot = shot.resize((sw, round(shot.height * sw / shot.width)), Image.LANCZOS)
        shot = shot.crop((0, 0, sw, min(shot.height, 400)))
        card = rounded(shot, 14)
        sx, sy = WIDTH - sw - 50, 120
        shadow = Image.new("RGBA", (card.width + 60, card.height + 60), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([30, 36, card.width + 30, card.height + 36], 18, fill=(0, 0, 0, 120))
        shadow = shadow.filter(ImageFilter.GaussianBlur(16))
        img.paste(shadow, (sx - 30, sy - 30), shadow)
        img.paste(card, (sx, sy), card)

    # 왼쪽: 문구
    x = 64
    draw.text((x, 120), "PROJECT AUTOMATION", font=f_eyebrow, fill=ACCENT)
    draw.text((x, 165), "프로젝트 자동화", font=f_title, fill=WHITE)
    draw.text((x, 238), "Platform", font=f_title, fill=WHITE)
    draw.text((x, 335), "소스코드 · 웹 품질 · DB 표준", font=f_sub, fill=LIGHT)
    draw.text((x, 377), "ERD · 성능 진단 도구", font=f_sub, fill=LIGHT)

    badge = "8가지 도구 · 무료 베타"
    bb = draw.textbbox((0, 0), badge, font=f_badge)
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    by = 450
    draw.rounded_rectangle([x, by, x + bw + 40, by + bh + 28], radius=24, fill=(37, 99, 235))
    draw.text((x + 20, by + 14 - bb[1]), badge, font=f_badge, fill=WHITE)

    draw.text((x, HEIGHT - 62), SITE_HOST, font=f_url, fill=LIGHT)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    img.save(OUTPUT_PATH, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"[OK] {OUTPUT_PATH} ({WIDTH}x{HEIGHT}, {os.path.getsize(OUTPUT_PATH) // 1024} KB)")
    return OUTPUT_PATH


if __name__ == "__main__":
    create_og_image()
