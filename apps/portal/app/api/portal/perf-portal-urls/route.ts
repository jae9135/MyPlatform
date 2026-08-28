import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/portal-auth";
import { perfPortalUrlsPayload } from "@/lib/perfTestPortalUrls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const password = process.env.PORTAL_PASSWORD?.trim();
  if (password && !(await isPortalAuthed((name) => req.cookies.get(name)))) {
    return NextResponse.json(
      { detail: "포털 로그인이 필요합니다." },
      { status: 401 },
    );
  }
  return NextResponse.json(perfPortalUrlsPayload());
}
