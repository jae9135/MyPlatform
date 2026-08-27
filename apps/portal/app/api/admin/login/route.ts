import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  adminCookieBaseOptions,
  adminToken,
  getAdminPassword,
} from "@/lib/admin-auth";
import { passwordMatches } from "@/lib/portal-auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const expected = getAdminPassword();

  const fail = NextResponse.redirect(
    new URL(expected ? "/admin/login?error=1" : "/admin/login?error=setup", req.url),
    303,
  );

  if (!expected || !passwordMatches(password, expected)) return fail;

  const token = await adminToken();
  const res = NextResponse.redirect(new URL("/admin", req.url), 303);
  res.cookies.set(ADMIN_COOKIE, token, {
    ...adminCookieBaseOptions(),
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return res;
}
