import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminAuthed } from "@/lib/admin-auth";
import { getVisitSummary } from "@/lib/visitStats";
import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

async function requireAdmin() {
  const jar = cookies();
  return isAdminAuthed((name) => jar.get(name));
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ detail: "Supabase not configured" }, { status: 503 });
  }

  try {
    const summary = await getVisitSummary("/");
    return NextResponse.json({ ok: true, path: "/", ...summary });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}
