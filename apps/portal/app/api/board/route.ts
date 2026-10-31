import { NextResponse } from "next/server";
import {
  checkRateLimit,
  clientIpFromHeaders,
  createPost,
  getReviewStats,
  hashClientIp,
  isBoardConfigured,
  isPreModeration,
  listPublishedPosts,
  parseNewPost,
} from "@/lib/board";
import { isBoardPostType, isBoardTool } from "@/lib/boardShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_MESSAGE: Record<string, string> = {
  invalid_body: "요청 형식이 올바르지 않습니다.",
  invalid_type: "글 종류(후기/Q&A)를 선택하세요.",
  invalid_tool: "프로그램을 다시 선택하세요.",
  invalid_rating: "별점(1~5)을 선택하세요.",
  required_fields: "닉네임·제목·내용을 모두 입력하세요.",
  body_too_short: "내용을 5자 이상 입력하세요.",
  too_fast: "잠시 후 다시 작성해 주세요. (1분에 1건)",
  daily_limit: "오늘 작성 가능한 글 수를 넘었습니다. 내일 다시 이용해 주세요.",
};

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      error: "not_configured",
      detail:
        "게시판 서버가 설정되지 않았습니다. SUPABASE_SERVICE_ROLE_KEY 와 board_posts 마이그레이션을 확인하세요.",
    },
    { status: 503 },
  );
}

/** 게시된 글 목록. ?type=review|qna &tool=<앱 id> &limit= &offset= &stats=1 */
export async function GET(req: Request) {
  if (!isBoardConfigured()) return notConfigured();
  const url = new URL(req.url);
  const typeRaw = url.searchParams.get("type") ?? "";
  const toolRaw = url.searchParams.get("tool") ?? "";
  const type = isBoardPostType(typeRaw) ? typeRaw : undefined;
  const tool = toolRaw && isBoardTool(toolRaw) ? toolRaw : undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20) || 20;
  const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
  const wantStats = url.searchParams.get("stats") === "1" && Boolean(tool);

  try {
    const [list, stats] = await Promise.all([
      listPublishedPosts({ type, tool, limit, offset }),
      wantStats && tool ? getReviewStats(tool) : Promise.resolve(null),
    ]);
    return NextResponse.json(
      {
        ok: true,
        rows: list.rows,
        total: list.total,
        stats,
        /** 글쓰기 안내 문구용: pre = 모든 글 승인 후 게시, post = 바로 게시(링크 글만 승인) */
        moderation: isPreModeration() ? "pre" : "post",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "list_failed", detail: msg }, { status: 500 });
  }
}

/** 새 글 작성 — 기본은 관리자 승인 후 게시 (BOARD_MODERATION=post 면 바로 게시) */
export async function POST(req: Request) {
  if (!isBoardConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body", detail: ERROR_MESSAGE.invalid_body },
      { status: 400 },
    );
  }

  // 봇 차단: 화면에 보이지 않는 입력칸(website)이 채워져 있으면 저장하지 않고 성공처럼 응답
  if (body && typeof body === "object" && String((body as Record<string, unknown>).website ?? "")) {
    return NextResponse.json({ ok: true, status: "pending", message: "접수되었습니다." });
  }

  const parsed = parseNewPost(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, detail: ERROR_MESSAGE[parsed.error] ?? parsed.error },
      { status: 400 },
    );
  }

  try {
    const ipHash = hashClientIp(clientIpFromHeaders(req.headers));
    const limited = await checkRateLimit(ipHash);
    if (limited) {
      return NextResponse.json(
        { ok: false, error: limited, detail: ERROR_MESSAGE[limited] },
        { status: 429 },
      );
    }
    const saved = await createPost(parsed.value, ipHash);
    return NextResponse.json({
      ok: true,
      id: saved.id,
      status: saved.status,
      message:
        saved.status === "published"
          ? "등록되었습니다. 감사합니다!"
          : isPreModeration()
            ? "접수되었습니다. 관리자 확인 후 게시됩니다."
            : "링크가 포함된 글은 스팸 방지를 위해 관리자 확인 후 게시됩니다.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "submit_failed", detail: msg }, { status: 500 });
  }
}
