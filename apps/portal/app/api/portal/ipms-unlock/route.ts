import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  IPMS_UNLOCK_COOKIE,
  cookieBaseOptions,
  getIpmsUnlockPassword,
  isPortalAuthedFromCookies,
  passwordMatches,
} from "@/lib/portal-auth";

export async function POST(req: Request) {
  const jar = cookies();
  const authed = await isPortalAuthedFromCookies((name) => jar.get(name));
  if (!authed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const expected = getIpmsUnlockPassword();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: string };
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (!passwordMatches(password, expected)) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const base = cookieBaseOptions();
  res.cookies.set(IPMS_UNLOCK_COOKIE, "1", { ...base, maxAge: 60 * 60 * 8 });
  return res;
}
