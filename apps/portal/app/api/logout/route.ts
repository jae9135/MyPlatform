import { NextResponse } from "next/server";
import {
  PORTAL_COOKIE,
  TRIAL_COOKIE,
  TRIAL_KIND_COOKIE,
  CODE_SESSION_COOKIE,
  CODE_KIND_COOKIE,
  IPMS_UNLOCK_COOKIE,
  cookieBaseOptions,
} from "@/lib/portal-auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  const base = cookieBaseOptions();
  res.cookies.set(PORTAL_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(TRIAL_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(TRIAL_KIND_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(CODE_SESSION_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(CODE_KIND_COOKIE, "", { ...base, maxAge: 0 });
  return res;
}
