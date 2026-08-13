import { NextResponse } from "next/server";
import {
  PORTAL_COOKIE,
  getPortalPassword,
  safeNextPath,
  timingSafeEqual,
  tokenFromPassword,
} from "@/lib/portal-auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const expected = getPortalPassword();

  const fail = NextResponse.redirect(
    new URL(
      expected ? "/login?error=1" : "/login?error=setup",
      req.url,
    ),
    303,
  );

  if (!expected || !password) return fail;
  const ok =
    password.length === expected.length && timingSafeEqual(password, expected);
  if (!ok) return fail;

  const token = await tokenFromPassword(expected);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
