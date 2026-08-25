#!/usr/bin/env python3
"""IPMS 로그인 세션을 Playwright storage_state JSON으로 저장.

npx playwright codegen 은 Node Playwright 브라우저를 쓰므로,
API와 동일한 Python Playwright 환경을 사용하세요.

Usage (apps/api):
  python -m playwright install chromium
  python scripts/save_ipms_session.py
  python scripts/save_ipms_session.py --url http://14.35.194.178:12000/ipms.online/ -o ipms-session.json
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_URL = "http://14.35.194.178:12000/ipms.online/"


def main() -> int:
    parser = argparse.ArgumentParser(description="Save IPMS Playwright storage_state JSON")
    parser.add_argument("--url", default=DEFAULT_URL, help="IPMS base URL")
    parser.add_argument(
        "-o",
        "--output",
        default="ipms-session.json",
        help="Output JSON path (default: ipms-session.json)",
    )
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright 미설치: pip install playwright", file=sys.stderr)
        return 1

    out = Path(args.output).resolve()
    url = args.url.strip()
    if not url.endswith("/"):
        url += "/"

    print(f"URL: {url}")
    print(f"저장 경로: {out}")
    print()
    print("1) 열리는 Chromium에서 로그인 + 공동인증서(2단계)까지 완료")
    print("2) 터미널로 돌아와 Enter")
    print()

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(headless=False)
            except Exception as e:
                if "Executable doesn't exist" in str(e):
                    print(
                        "Chromium 미설치. 먼저 실행:\n"
                        "  python -m playwright install chromium",
                        file=sys.stderr,
                    )
                    return 1
                raise
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            input("로그인 완료 후 Enter… ")
            context.storage_state(path=str(out))
            browser.close()
    except KeyboardInterrupt:
        print("\n취소됨.")
        return 130

    if out.is_file():
        print(f"저장 완료: {out}")
        print("웹 품질 진단 → IPMS 로그인 탭 → 세션 JSON 업로드")
        return 0

    print("저장 실패", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
