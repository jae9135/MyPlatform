import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  IPMS_UNLOCK_COOKIE,
  isPortalAuthedFromCookies,
} from "@/lib/portal-auth";

export async function GET() {
  const jar = cookies();
  const authed = await isPortalAuthedFromCookies((name) => jar.get(name));
  const ipmsUnlocked = authed && jar.get(IPMS_UNLOCK_COOKIE)?.value === "1";
  return NextResponse.json({
    ok: authed,
    ipmsEnabled: authed,
    ipmsUnlocked,
  });
}
