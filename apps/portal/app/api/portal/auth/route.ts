import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveDbUnlocked, resolveIpmsUnlocked, resolvePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = cookies();
  const get = (name: string) => jar.get(name);
  const auth = await resolvePortalAuth(get);
  const ipms = await resolveIpmsUnlocked(get);
  const db = await resolveDbUnlocked(get);
  return NextResponse.json(
    {
      ok: auth.ok,
      kind: auth.kind,
      /** IPMS 메뉴 표시 여부 (클릭 시 2차 암호) */
      ipmsEnabled: ipms.eligible,
      /** 2차 암호 통과 여부 */
      ipmsUnlocked: ipms.unlocked,
      /** DBManager 운영 DB 기능 잠금 해제 여부 */
      dbUnlocked: db.unlocked,
      /** 서버에 DB_UNLOCK_PASSWORD 설정 여부 (없으면 DB 기능 항상 잠김) */
      dbUnlockConfigured: db.configured,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
