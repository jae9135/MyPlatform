import { NextResponse } from "next/server";
import {
  checkCommentRateLimit,
  clientIpFromHeaders,
  createComment,
  getPublishedPostBrief,
  hashClientIp,
  isBoardConfigured,
  listPublishedComments,
  parseNewComment,
} from "@/lib/board";
import { boardToolLabel } from "@/lib/boardShared";
import { notifyAdmin, previewText } from "@/lib/notify";
import { absoluteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_MESSAGE: Record<string, string> = {
  invalid_body: "요청 형식이 올바르지 않습니다.",
  invalid_post: "댓글을 달 글을 찾을 수 없습니다.",
  post_not_found: "댓글을 달 글을 찾을 수 없습니다.",
  required_comment_fields: "닉네임과 댓글 내용을 입력하세요.",
  comment_too_short: "댓글을 2자 이상 입력하세요.",
  reserved_nickname: "'운영자'·'관리자' 같은 닉네임은 사용할 수 없습니다.",
  comment_too_fast: "잠시 후 다시 작성해 주세요. (30초에 1건)",
  comment_daily_limit: "오늘 작성 가능한 댓글 수를 넘었습니다. 내일 다시 이용해 주세요.",
};

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error, detail: ERROR_MESSAGE[error] ?? error }, { status });
}

/** 게시된 댓글 목록 ?post=<글 id> */
export async function GET(req: Request) {
  if (!isBoardConfigured()) return fail("not_configured", 503);
  const postId = new URL(req.url).searchParams.get("post") ?? "";
  if (!UUID_RE.test(postId)) return fail("invalid_post", 400);
  try {
    const rows = await listPublishedComments(postId);
    return NextResponse.json({ ok: true, rows }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "list_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** 댓글 작성 { post_id, nickname, body, website(숨김칸) } — 링크가 있으면 승인 대기 */
export async function POST(req: Request) {
  if (!isBoardConfigured()) return fail("not_configured", 503);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_body", 400);
  }
  // 봇 차단: 숨김 칸이 채워져 있으면 저장하지 않고 성공처럼 응답
  if (body && typeof body === "object" && String((body as Record<string, unknown>).website ?? "")) {
    return NextResponse.json({ ok: true, status: "pending", message: "접수되었습니다." });
  }
  const parsed = parseNewComment(body);
  if (!parsed.ok) return fail(parsed.error, 400);

  try {
    const post = await getPublishedPostBrief(parsed.value.post_id);
    if (!post) return fail("post_not_found", 404);
    const ipHash = hashClientIp(clientIpFromHeaders(req.headers));
    const limited = await checkCommentRateLimit(ipHash);
    if (limited) return fail(limited, 429);

    const saved = await createComment(parsed.value, ipHash);
    await notifyAdmin({
      subject: `${saved.status === "pending" ? "[승인 필요] " : ""}새 댓글: ${post.title}`,
      lines: [
        `프로그램: ${boardToolLabel(post.tool)}`,
        `작성자: ${parsed.value.nickname}`,
        `상태: ${saved.status === "published" ? "바로 게시됨" : "승인 대기 (링크 포함)"}`,
        "",
        previewText(parsed.value.body),
      ],
      links: [
        { label: "글 보기", url: `${absoluteUrl("/community")}?tool=${post.tool ?? "general"}#post-${post.id}` },
        { label: "관리 화면 (숨김·삭제·답글)", url: absoluteUrl("/admin") },
      ],
    });
    return NextResponse.json({
      ok: true,
      id: saved.id,
      status: saved.status,
      message:
        saved.status === "published"
          ? "댓글이 등록되었습니다."
          : "링크가 포함된 댓글은 스팸 방지를 위해 관리자 확인 후 게시됩니다.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "submit_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
