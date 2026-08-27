import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createAccessCode,
  kindLabel,
  listAccessCodes,
  revokeAccessCode,
  type AccessCodeKind,
} from "@/lib/accessCodes";
import { isAdminAuthed } from "@/lib/admin-auth";
import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

async function requireAdmin() {
  const jar = cookies();
  const ok = await isAdminAuthed((name) => jar.get(name));
  if (!ok) return null;
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
    const rows = await listAccessCodes();
    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindLabel: kindLabel(r.kind),
        label: r.label,
        max_uses: r.max_uses,
        use_count: r.use_count,
        expires_at: r.expires_at,
        revoked: r.revoked,
        created_at: r.created_at,
        last_used_at: r.last_used_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ detail: "Supabase not configured" }, { status: 503 });
  }

  let body: { kind?: AccessCodeKind; label?: string; expiresAt?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind;
  if (kind !== "full" && kind !== "day" && kind !== "once") {
    return NextResponse.json({ detail: "kind must be full|day|once" }, { status: 400 });
  }

  try {
    const { row, plainCode } = await createAccessCode({
      kind,
      label: body.label,
      expiresAt: body.expiresAt ?? null,
    });
    return NextResponse.json({
      plainCode,
      row: {
        id: row.id,
        kind: row.kind,
        kindLabel: kindLabel(row.kind),
        label: row.label,
        max_uses: row.max_uses,
        use_count: row.use_count,
        expires_at: row.expires_at,
        revoked: row.revoked,
        created_at: row.created_at,
      },
    });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ detail: "Supabase not configured" }, { status: 503 });
  }

  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id || body.action !== "revoke") {
    return NextResponse.json({ detail: "id and action=revoke required" }, { status: 400 });
  }

  try {
    await revokeAccessCode(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}
