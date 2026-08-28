import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminAuthed } from "@/lib/admin-auth";
import { listContactInquiries, requestTypeLabel, toolLabel } from "@/lib/contactInquiries";
import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

async function requireAdmin() {
  const jar = cookies();
  const ok = await isAdminAuthed((name) => jar.get(name));
  if (!ok) return false;
  return true;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ detail: "Supabase not configured" }, { status: 503 });
  }

  try {
    const rows = await listContactInquiries(200);
    return NextResponse.json({
      rows: rows.map((r) => ({
        ...r,
        tool_label: toolLabel(r.tool),
        request_type_label: requestTypeLabel(r.request_type),
      })),
    });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}
