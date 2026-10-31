import { NextResponse } from "next/server";
import { clearPortalAuthCookies } from "@/lib/portal-auth";
import { isPortalAuthRequired } from "@/lib/authMode";

export async function POST(req: Request) {
  const dest = isPortalAuthRequired() ? "/login" : "/";
  const res = NextResponse.redirect(new URL(dest, req.url), 303);
  clearPortalAuthCookies(res);
  return res;
}
