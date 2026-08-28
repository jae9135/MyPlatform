import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPortalAuthed } from "@/lib/portal-auth";
import { isPublicPath } from "@/lib/publicPaths";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    "/((?!_next/static|_next/image|favicon.ico|marketing/).*)",
  ],
};
