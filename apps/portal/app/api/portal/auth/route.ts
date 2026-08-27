import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  IPMS_UNLOCK_COOKIE,
  isFullPortalAuth,
  resolvePortalAuth,
} from "@/lib/portal-auth";

export async function GET() {
  const jar = cookies();
  const auth = await resolvePortalAuth((name) => jar.get(name));
  const full = isFullPortalAuth(auth.kind);
  const ipmsUnlocked = full && jar.get(IPMS_UNLOCK_COOKIE)?.value === "1";
  return NextResponse.json({
    ok: auth.ok,
    kind: auth.kind,
    ipmsEnabled: full,
    ipmsUnlocked,
  });
}
