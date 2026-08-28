#!/usr/bin/env python3
"""
Open Graph 이미지 생성 스크립트
1200×630px, 브랜드 컬러 그라데이션 + 도구 아이콘 + 핵심 문구
"""

from PIL import Image, ImageDraw, ImageFont
import os

# 설정
WIDTH = 1200
HEIGHT = 630
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "apps", "portal", "public", "marketing", "og-image.jpg")

# 컬러
BG_START = (37, 99, 235)  # #2563eb
BG_END = (29, 78, 216)    # #1d4ed8
TEXT_WHITE = (255, 255, 255)
TEXT_LIGHT = (239, 246, 255)  # #eff6ff
ACCENT = (96, 165, 250)  # #60a5fa

def create_og_image():
    # 캔버스 생성
    img = Image.new('RGB', (WIDTH, HEIGHT), BG_END)
    draw = ImageDraw.Draw(img)
    
    # 그라데이션 배경 (상단 → 하단)
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(BG_START[0] + (BG_END[0] - BG_START[0]) * ratio)
        g = int(BG_START[1] + (BG_END[1] - BG_START[1]) * ratio)
        b = int(BG_START[2] + (BG_END[2] - BG_START[2]) * ratio)
        draw.rectangle([(0, y), (WIDTH, y+1)], fill=(r, g, b))
    
    # 장식 요소 (좌상단 원형)
    draw.ellipse([(-100, -100), (250, 250)], fill=(*ACCENT, 30))
    draw.ellipse([(WIDTH-200, HEIGHT-200), (WIDTH+100, HEIGHT+100)], fill=(*ACCENT, 30))
    
    try:
        # 폰트 (시스템 폰트 또는 기본)
        try:
            font_title = ImageFont.truetype("arial.ttf", 72)
            font_sub = ImageFont.truetype("arial.ttf", 36)
            font_tools = ImageFont.truetype("arial.ttf", 28)
        except:
            font_title = ImageFont.load_default()
            font_sub = ImageFont.load_default()
            font_tools = ImageFont.load_default()
        
        # 메인 문구
        title_text = "프로젝트 자동화 Platform"
        title_bbox = draw.textbbox((0, 0), title_text, font=font_title)
        title_w = title_bbox[2] - title_bbox[0]
        title_x = (WIDTH - title_w) // 2
        title_y = 180
        
        # 그림자 효과
        draw.text((title_x+3, title_y+3), title_text, font=font_title, fill=(0, 0, 0, 128))
        draw.text((title_x, title_y), title_text, font=font_title, fill=TEXT_WHITE)
        
        # 부제
        subtitle = "웹 품질·소스코드·DB·ERD 자동 진단"
        sub_bbox = draw.textbbox((0, 0), subtitle, font=font_sub)
        sub_w = sub_bbox[2] - sub_bbox[0]
        sub_x = (WIDTH - sub_w) // 2
        sub_y = title_y + 90
        draw.text((sub_x, sub_y), subtitle, font=font_sub, fill=TEXT_LIGHT)
        
        # 도구 개수
        tools_text = "8가지 도구 · 무료 베타 체험"
        tools_bbox = draw.textbbox((0, 0), tools_text, font=font_tools)
        tools_w = tools_bbox[2] - tools_bbox[0]
        tools_x = (WIDTH - tools_w) // 2
        tools_y = sub_y + 70
        
        # 배지 스타일 배경
        badge_padding = 20
        badge_rect = [
            tools_x - badge_padding,
            tools_y - 12,
            tools_x + tools_w + badge_padding,
            tools_y + 40
        ]
        draw.rounded_rectangle(badge_rect, radius=8, fill=(*TEXT_WHITE, 40))
        draw.text((tools_x, tools_y), tools_text, font=font_tools, fill=TEXT_WHITE)
        
        # 하단 URL
        url = "myplatform-demo.vercel.app"
        url_bbox = draw.textbbox((0, 0), url, font=font_tools)
        url_w = url_bbox[2] - url_bbox[0]
        url_x = (WIDTH - url_w) // 2
        url_y = HEIGHT - 80
        draw.text((url_x, url_y), url, font=font_tools, fill=TEXT_LIGHT)
        
    except Exception as e:
        print(f"폰트 렌더링 오류 (기본 폰트 사용): {e}")
        # 기본 폰트로 단순 텍스트
        draw.text((100, 250), "프로젝트 자동화 Platform", fill=TEXT_WHITE)
        draw.text((100, 320), "8가지 도구 · 무료 베타 체험", fill=TEXT_LIGHT)
    
    # 저장
    output_dir = os.path.dirname(OUTPUT_PATH)
    os.makedirs(output_dir, exist_ok=True)
    img.save(OUTPUT_PATH, quality=90, optimize=True)
    print(f"[OK] OG image created: {OUTPUT_PATH}")
    print(f"     Size: {WIDTH}x{HEIGHT}px")
    
    return OUTPUT_PATH

if __name__ == "__main__":
    create_og_image()
