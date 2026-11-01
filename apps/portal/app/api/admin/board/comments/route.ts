import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminAuthed } from "@/lib/admin-auth";
import {
  createAdminComment,
  deleteAdminComment,
  isBoardConfigured,
  listAdminComments,
  updateAdminComment,
} from "@/lib/board";
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

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const j = await req.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 전체 댓글 (모든 상태). ?post=<id> 로 한 글만 */
export async function GET(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const post = new URL(req.url).searchParams.get("post") ?? "";
  try {
    const rows = await listAdminComments(UUID_RE.test(post) ? [post] : undefined);
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}

/** 운영자 댓글 작성 { post_id, body } */
export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const b = await readJson(req);
  const postId = String(b?.post_id ?? "");
  if (!UUID_RE.test(postId)) return NextResponse.json({ detail: "invalid_post" }, { status: 400 });
  try {
    const row = await createAdminComment(postId, String(b?.body ?? ""));
    return NextResponse.json({ row });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}

/** 상태 변경 { id, status } */
export async function PATCH(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const b = await readJson(req);
  const id = String(b?.id ?? "");
  const status = String(b?.status ?? "");
  if (!UUID_RE.test(id)) return NextResponse.json({ detail: "invalid_id" }, { status: 400 });
  if (!isBoardStatus(status)) return NextResponse.json({ detail: "invalid_status" }, { status: 400 });
  try {
    await updateAdminComment(id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}

/** 삭제 { id } */
export async function DELETE(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const b = await readJson(req);
  const id = String(b?.id ?? "");
  if (!UUID_RE.test(id)) return NextResponse.json({ detail: "invalid_id" }, { status: 400 });
  try {
    await deleteAdminComment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 });
  }
}
