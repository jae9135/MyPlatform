import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminAuthed } from "@/lib/admin-auth";
import { deleteAdminPost, isBoardConfigured, listAdminPosts, updateAdminPost } from "@/lib/board";
import { isBoardStatus } from "@/lib/boardShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(): Promise<NextResponse | null> {
  const jar = cookies();
  if (!(await isAdminAuthed((name) => jar.get(name)))) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!isBoardConfigured()) {
    return NextResponse.json({ detail: "Supabase not configured" }, { status: 503 });
  }
  return null;
}

/** 전체 글 (?status=pending|published|hidden) */
export async function GET(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const statusRaw = new URL(req.url).searchParams.get("status") ?? "";
  try {
    const rows = await listAdminPosts(isBoardStatus(statusRaw) ? statusRaw : undefined);
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}

/** 상태 변경·답변 저장: { id, status?, answer? } */
export async function PATCH(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  let body: { id?: string; status?: string; answer?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "invalid_body" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!UUID_RE.test(id)) return NextResponse.json({ detail: "invalid_id" }, { status: 400 });
  const status = body.status && isBoardStatus(body.status) ? body.status : undefined;
  if (body.status && !status) return NextResponse.json({ detail: "invalid_status" }, { status: 400 });
  const answer = body.answer === undefined ? undefined : body.answer === null ? null : String(body.answer);
  if (!status && answer === undefined) {
    return NextResponse.json({ detail: "nothing_to_update" }, { status: 400 });
  }
  try {
    const row = await updateAdminPost(id, { status, answer });
    return NextResponse.json({ row });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}

/** 영구 삭제: ?id= */
export async function DELETE(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ detail: "invalid_id" }, { status: 400 });
  try {
    await deleteAdminPost(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}
