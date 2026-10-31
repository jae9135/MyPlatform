import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveIpmsUnlocked, resolvePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = cookies();
  const get = (name: string) => jar.get(name);
  const auth = await resolvePortalAuth(get);
  const ipms = await resolveIpmsUnlocked(get);
  return NextResponse.json(
    {
      ok: auth.ok,
      kind: auth.kind,
      /** IPMS 메뉴 표시 여부 (클릭 시 2차 암호) */
      ipmsEnabled: ipms.eligible,
      /** 2차 암호 통과 여부 */
      ipmsUnlocked: ipms.unlocked,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
