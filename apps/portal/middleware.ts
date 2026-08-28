import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPortalAuthed } from "@/lib/portal-auth";
import { isPublicPath } from "@/lib/publicPaths";

/** matcher 밖에서 처리 — path-to-regexp negative lookahead 복잡 패턴은 Vercel 빌드 오류 유발 */
function bypassPortalAuth(pathname: string): boolean {
  if (pathname.startsWith("/marketing/")) return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;
  if (/^\/(google|naver)[a-z0-9]+\.html$/i.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (bypassPortalAuth(pathname)) {
    return NextResponse.next();
  }

  // /admin 은 서버 컴포넌트·API에서 별도 검증 (Edge에서 env/crypto 이슈 회피)
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  const authed = await isPortalAuthed((name) => req.cookies.get(name));

  if (isPublicPath(pathname)) {
    if (authed && pathname === "/login") {
      return NextResponse.redirect(new URL("/workspace", req.url));
    }
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  const next = `${pathname}${req.nextUrl.search}`;
  if (next && next !== "/") {
    login.searchParams.set("next", next);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Next.js 기본 패턴만 사용 (복잡 negative lookahead는 invalid-route-source).
     * robots·sitemap·인증 HTML·marketing 정적 파일은 bypassPortalAuth()에서 제외.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
