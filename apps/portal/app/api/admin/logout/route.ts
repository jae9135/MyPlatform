import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieBaseOptions } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/admin/login", req.url), 303);
  const base = adminCookieBaseOptions();
  res.cookies.set(ADMIN_COOKIE, "", { ...base, maxAge: 0 });
  return res;
}
