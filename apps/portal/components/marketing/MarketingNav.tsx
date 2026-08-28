"use client";

import Link from "next/link";
import { useState } from "react";
import { BRAND_NAME } from "@/lib/brand";

const NAV_LINKS: { href: string; label: string; isPage?: boolean }[] = [
  { href: "#tools", label: "도구" },
  { href: "#receipt", label: "모바일" },
  { href: "#workflow", label: "워크플로" },
  { href: "/customize", label: "맞춤 개발", isPage: true },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="mkt-header">
      <div className="mkt-wrap mkt-navbar">
        <Link className="mkt-brand" href="/">
          <span className="mkt-brand-dot" aria-hidden />
          {BRAND_NAME}
          <span className="mkt-brand-tag">DEMO</span>
        </Link>

        <nav className="mkt-links" aria-label="주요 섹션">
          {NAV_LINKS.map((item) =>
            item.isPage ? (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ) : (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            )
          )}
        </nav>

        <div className="mkt-nav-actions">
          <Link className="mkt-btn mkt-btn-ghost mkt-nav-desktop-only" href="/login">
            베타 프로그램
          </Link>
          <Link className="mkt-btn mkt-btn-primary mkt-nav-desktop-only" href="/contact">
            문의
          </Link>
          <button
            type="button"
            className="mkt-nav-toggle"
            aria-expanded={open}
            aria-controls="mkt-mobile-nav"
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mkt-mobile-nav" className="mkt-mobile-nav" aria-label="모바일 메뉴">
          <div className="mkt-wrap">
            {NAV_LINKS.map((item) =>
              item.isPage ? (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ) : (
                <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              )
            )}
            <div className="mkt-mobile-nav-actions">
              <Link className="mkt-btn" href="/login" onClick={() => setOpen(false)}>
                베타 프로그램
              </Link>
              <Link className="mkt-btn mkt-btn-primary" href="/contact" onClick={() => setOpen(false)}>
                문의
              </Link>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
