"use client";

import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";

export function MarketingNav() {
  return (
    <header className="mkt-header">
      <div className="mkt-wrap mkt-navbar">
        <Link className="mkt-brand" href="/">
          <span className="mkt-brand-dot" aria-hidden />
          {BRAND_NAME}
          <span className="mkt-brand-tag">DEMO</span>
        </Link>
        <nav className="mkt-links" aria-label="주요 섹션">
          <a href="#tools">도구</a>
          <a href="#receipt">모바일</a>
          <a href="#workflow">워크플로</a>
          <a href="/customize">맞춤 개발</a>
        </nav>
        <div className="mkt-nav-actions">
          <Link className="mkt-btn mkt-btn-ghost" href="/login">
            베타 프로그램
          </Link>
          <Link className="mkt-btn mkt-btn-primary" href="/contact">
            문의
          </Link>
        </div>
      </div>
    </header>
  );
}
