"use client";

import { usePathname } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { isPortalAuthRequired } from "@/lib/authMode";

/** /apps/<도구 id>/... 에서 도구 id 추출 */
function toolFromPath(pathname: string | null): string {
  const m = /^\/apps\/([^/?#]+)/.exec(pathname ?? "");
  return m ? m[1]! : "";
}

export function PortalNav({
  home = false,
  showLogout = isPortalAuthRequired(),
}: {
  home?: boolean;
  /** false면 로그아웃 버튼 숨김 (로그인·공개 화면). 기본값: 보호 모드일 때만 표시 */
  showLogout?: boolean;
}) {
  const pathname = usePathname();
  const tool = toolFromPath(pathname);
  const communityHref = tool
    ? `/community?tool=${encodeURIComponent(tool)}&write=1`
    : "/community?write=1";

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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!home ? (
          <a
            className="btn ghost"
            href={communityHref}
            target="_blank"
            rel="noopener"
            title="사용 후기나 궁금한 점을 남겨 주세요 (새 탭)"
          >
            후기·질문 남기기
          </a>
        ) : null}
        {showLogout ? (
          <form action="/api/logout" method="post">
            <button className="btn ghost" type="submit">
              로그아웃
            </button>
          </form>
        ) : null}
      </div>
    </nav>
  );
}
