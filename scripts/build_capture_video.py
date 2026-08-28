#!/usr/bin/env python3
"""Build MP4 promo from real portal screenshots in docs/이미지_재욱캡처."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import imageio.v3 as iio
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CAPTURE_DIR = ROOT / "docs" / "이미지_재욱캡처"
OUT_DIR = ROOT / "docs" / "marketing-assets" / "videos"

VIDEO_W, VIDEO_H = 1920, 1088
FPS = 30
SECONDS_PER_SLIDE = 4.0

# Narrative order for the walkthrough
SLIDE_ORDER = [
    ("메인.jpg", "프로젝트 자동화 Platform"),
    ("도구모음메인.jpg", "베타 프로그램 · 도구 모음"),
    ("소스코드보안진단.jpg", "소스코드·보안 진단"),
    ("웹품질진단.jpg", "웹 품질 진단"),
    ("DB표준점검도구.jpg", "DB 표준 점검"),
    ("DB관리.jpg", "DBManager"),
    ("ER모델러.jpg", "ER Modeler"),
    ("산출물관리.jpg", "DeliverableManager"),
    ("마이간트.jpg", "MyGantt"),
]

BG = "#f4f7fb"
TEXT = "#0f172a"
ACCENT = "#2563eb"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    p = Path(r"C:\Windows\Fonts\malgunbd.ttf") if bold else Path(r"C:\Windows\Fonts\malgun.ttf")
    if p.exists():
        return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore


def slide_from_capture(path: Path, caption: str) -> Image.Image:
    img = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", (VIDEO_W, VIDEO_H), hex_rgb(BG))
    draw = ImageDraw.Draw(canvas)

    margin_x, margin_top, margin_bottom = 48, 72, 48
    title_h = 44
    avail_w = VIDEO_W - margin_x * 2
    avail_h = VIDEO_H - margin_top - margin_bottom - title_h

    iw, ih = img.size
    scale = min(avail_w / iw, avail_h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)

    x = (VIDEO_W - nw) // 2
    y = margin_top + title_h + (avail_h - nh) // 2

    # shadow
    shadow = Image.new("RGB", (nw + 8, nh + 8), hex_rgb(BG))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((4, 4, nw + 4, nh + 4), 10, fill=(200, 210, 225))
    canvas.paste(shadow, (x - 4, y - 2))

    # frame
    frame = Image.new("RGB", (nw, nh), (255, 255, 255))
    frame.paste(resized, (0, 0))
    frame_draw = ImageDraw.Draw(frame)
    frame_draw.rounded_rectangle((0, 0, nw - 1, nh - 1), 8, outline=(203, 213, 225), width=2)
    canvas.paste(frame, (x, y))

    draw.text((margin_x, 28), caption, fill=hex_rgb(TEXT), font=font(32, True))
    draw.text((margin_x, 68), "실제 화면 캡처", fill=hex_rgb(ACCENT), font=font(14))

    return canvas


def ken_burns_frame(img: Image.Image, t: float) -> np.ndarray:
    iw, ih = img.size
    scale = 1.0 + 0.06 * t
    crop_w = min(int(VIDEO_W * scale), iw)
    crop_h = min(int(VIDEO_H * scale), ih)
    x = int((iw - crop_w) * (0.08 + 0.12 * t))
    y = int((ih - crop_h) * 0.04 * t)
    crop = img.crop((x, y, x + crop_w, y + crop_h)).resize((VIDEO_W, VIDEO_H), Image.Resampling.LANCZOS)
    return np.array(crop)


def build_video(slides: list[Image.Image], path: Path) -> dict:
    frames: list[np.ndarray] = []
    fade = int(FPS * 0.5)
    per = int(FPS * SECONDS_PER_SLIDE)

    for idx, slide in enumerate(slides):
        for f in range(per):
            t = f / max(per - 1, 1)
            frame = ken_burns_frame(slide, t)
            if f < fade and idx > 0:
                prev = ken_burns_frame(slides[idx - 1], 1.0)
                a = f / fade
                frame = (frame.astype(np.float32) * a + prev.astype(np.float32) * (1 - a)).astype(np.uint8)
            frames.append(frame)

    path.parent.mkdir(parents=True, exist_ok=True)
    iio.imwrite(path, frames, fps=FPS, codec="libx264", quality=8, pixelformat="yuv420p")
    return {
        "path": str(path),
        "frames": len(frames),
        "duration_sec": round(len(frames) / FPS, 1),
        "bytes": path.stat().st_size,
        "mb": round(path.stat().st_size / (1024 * 1024), 2),
    }


def main() -> None:
    if not CAPTURE_DIR.is_dir():
        raise SystemExit(f"폴더 없음: {CAPTURE_DIR}")

    slides: list[Image.Image] = []
    used: list[str] = []
    for fname, caption in SLIDE_ORDER:
        p = CAPTURE_DIR / fname
        if not p.exists():
            raise SystemExit(f"파일 없음: {p}")
        slides.append(slide_from_capture(p, caption))
        used.append(fname)

    out_main = OUT_DIR / "04-promo-jaewook-captures.mp4"
    out_copy = CAPTURE_DIR / "프로젝트자동화Platform-화면소개.mp4"

    info = build_video(slides, out_main)
    build_video(slides, out_copy)

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_dir": str(CAPTURE_DIR),
        "slides": [{"file": f, "caption": c} for f, c in SLIDE_ORDER],
        "outputs": [str(out_main), str(out_copy)],
        **info,
    }
    meta_path = CAPTURE_DIR / "video-manifest.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print(f"\nOK - {info['duration_sec']}s, {info['mb']} MB")


if __name__ == "__main__":
    main()
