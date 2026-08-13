import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  PORTAL_COOKIE,
  getPortalPassword,
  timingSafeEqual,
  tokenFromPassword,
} from "@/lib/portal-auth";

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/login";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const password = getPortalPassword();
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? "";
  const expected = password ? await tokenFromPassword(password) : "";
  const authed = Boolean(expected && cookie && timingSafeEqual(cookie, expected));

  if (isPublicPath(pathname)) {
    if (authed && pathname === "/login") {
      return NextResponse.redirect(new URL("/", req.url));
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
