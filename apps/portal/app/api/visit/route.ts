import { NextResponse } from "next/server";
import { normalizeVisitPath, recordPageView } from "@/lib/visitStats";
import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["/", "/contact", "/customize"]);

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const path = normalizeVisitPath(String(body.path ?? "/"));
  if (!ALLOWED.has(path)) {
    return NextResponse.json({ ok: false, error: "path_not_allowed" }, { status: 400 });
  }

  try {
    await recordPageView(path);
    return NextResponse.json({ ok: true, path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
