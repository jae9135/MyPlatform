import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  IPMS_UNLOCK_COOKIE,
  cookieBaseOptions,
  getIpmsUnlockPassword,
  ipmsUnlockToken,
  isIpmsEligible,
  passwordMatches,
  resolvePortalAuth,
} from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/** IPMS 해제 유지 시간 */
const IPMS_UNLOCK_MAX_AGE = 60 * 60 * 8;

/** 연속 실패 지연 (무차별 대입 완화) */
async function failDelay() {
  await new Promise((r) => setTimeout(r, 800));
}

export async function POST(req: Request) {
  const jar = cookies();
  const auth = await resolvePortalAuth((name) => jar.get(name));
  if (!auth.ok || !isIpmsEligible(auth.kind)) {
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
    await failDelay();
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(IPMS_UNLOCK_COOKIE, await ipmsUnlockToken(), {
    ...cookieBaseOptions(),
    maxAge: IPMS_UNLOCK_MAX_AGE,
  });
  return res;
}
