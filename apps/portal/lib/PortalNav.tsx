"use client";

import { BRAND_NAME } from "@/lib/brand";

export function PortalNav({
  home = false,
  showLogout = true,
}: {
  home?: boolean;
  /** false면 로그아웃 버튼 숨김 (로그인·공개 화면) */
  showLogout?: boolean;
}) {
  return (
    <nav className={`portal-nav${home ? " portal-nav-home" : ""}`} aria-label="포털">
      {home ? (
        <span className="portal-nav-spacer" />
      ) : (
        <a
          className="back"
          href="/workspace"
          onClick={(e) => {
            e.preventDefault();
            window.location.assign("/workspace");
          }}
        >
          ← {BRAND_NAME} 허브
        </a>
      )}
      {showLogout ? (
        <form action="/api/logout" method="post">
          <button className="btn ghost" type="submit">
            로그아웃
          </button>
        </form>
      ) : null}
    </nav>
  );
}
