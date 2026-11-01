/** 게시판(후기·Q&A) 서버 로직 — Supabase service role 전용. 브라우저에서 import 하지 마세요. */
import { createHash } from "node:crypto";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import {
  BOARD_LIMITS,
  boardToolLabel,
  isBoardPostType,
  isBoardTool,
  isReservedNickname,
  type BoardAdminComment,
  type BoardAdminPost,
  type BoardPublicComment,
  type BoardPostType,
  type BoardPublicPost,
  type BoardStats,
  type BoardStatus,
} from "@/lib/boardShared";

const TABLE = "board_posts";
const COMMENT_TABLE = "board_comments";
const COMMENT_PUBLIC_COLUMNS = "id, post_id, body, nickname, is_admin, created_at";
const PUBLIC_COLUMNS =
  "id, post_type, tool, rating, title, body, nickname, answer, answered_at, created_at";
const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, status, updated_at`;

/** 같은 작성자(IP 해시)의 연속 작성 간격 */
const MIN_POST_INTERVAL_SEC = 60;
/** 같은 작성자의 하루 최대 작성 수 */
const MAX_POSTS_PER_DAY = 10;

export function isBoardConfigured(): boolean {
  return isSupabaseAdminConfigured();
}

/**
 * 기본(미설정·post) → 바로 게시. 단, 링크가 들어간 글만 승인 대기 (광고 스팸 방지)
 * BOARD_MODERATION=pre → 모든 글 관리자 승인 후 게시
 */
export function isPreModeration(): boolean {
  return (process.env.BOARD_MODERATION ?? "").trim().toLowerCase() === "pre";
}

type Row = {
  id: string;
  post_type: BoardPostType;
  tool: string | null;
  rating: number | null;
  title: string;
  body: string;
  nickname: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  status?: BoardStatus;
  updated_at?: string;
};

function toPublic(r: Row): BoardPublicPost {
  return {
    id: r.id,
    post_type: r.post_type,
    tool: r.tool,
    tool_label: boardToolLabel(r.tool),
    rating: r.rating,
    title: r.title,
    body: r.body,
    nickname: r.nickname,
    answer: r.answer,
    answered_at: r.answered_at,
    created_at: r.created_at,
  };
}

function toAdmin(r: Row): BoardAdminPost {
  return {
    ...toPublic(r),
    status: (r.status ?? "pending") as BoardStatus,
    updated_at: r.updated_at ?? r.created_at,
  };
}

export type ListPublicOptions = {
  type?: BoardPostType;
  tool?: string;
  limit?: number;
  offset?: number;
};

export async function listPublishedPosts(
  opts: ListPublicOptions = {},
): Promise<{ rows: BoardPublicPost[]; total: number }> {
  const sb = getSupabaseAdmin();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  let q = sb
    .from(TABLE)
    .select(PUBLIC_COLUMNS, { count: "exact" })
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (opts.type) q = q.eq("post_type", opts.type);
  if (opts.tool) q = q.eq("tool", opts.tool);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Row[]).map(toPublic);
  await attachCommentCounts(rows);
  return { rows, total: count ?? 0 };
}

/** 글 목록에 게시된 댓글 수를 붙임. 댓글 테이블이 아직 없으면(마이그레이션 전) 조용히 건너뜀. */
async function attachCommentCounts(rows: BoardPublicPost[]): Promise<void> {
  if (!rows.length) return;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(COMMENT_TABLE)
    .select("post_id")
    .eq("status", "published")
    .in(
      "post_id",
      rows.map((r) => r.id),
    )
    .limit(5000);
  if (error) return;
  const counts = new Map<string, number>();
  for (const c of (data ?? []) as { post_id: string }[]) {
    counts.set(c.post_id, (counts.get(c.post_id) ?? 0) + 1);
  }
  for (const r of rows) r.comment_count = counts.get(r.id) ?? 0;
}

/** 도구별 게시된 후기 개수·평균 별점 */
export async function getReviewStats(tool: string): Promise<BoardStats> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(TABLE)
    .select("rating")
    .eq("status", "published")
    .eq("post_type", "review")
    .eq("tool", tool)
    .limit(2000);
  if (error) throw new Error(error.message);
  const ratings = ((data ?? []) as { rating: number | null }[])
    .map((r) => r.rating)
    .filter((v): v is number => typeof v === "number");
  const count = (data ?? []).length;
  const average = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;
  return { count, average };
}

/**
 * 서버 렌더링용 — 도구별 최근 후기 + 평점. 게시판 미설정·DB 오류면 null (페이지는 정상 표시).
 */
export async function loadToolReviews(
  tool: string,
  limit = 3,
): Promise<{ rows: BoardPublicPost[]; stats: BoardStats } | null> {
  if (!isBoardConfigured()) return null;
  try {
    const [list, stats] = await Promise.all([
      listPublishedPosts({ type: "review", tool, limit }),
      getReviewStats(tool),
    ]);
    return { rows: list.rows, stats };
  } catch {
    return null;
  }
}

/** 서버 렌더링용 — 커뮤니티 첫 화면 목록. 실패하면 null (브라우저에서 다시 불러옴). */
export async function loadInitialBoard(
  opts: ListPublicOptions,
): Promise<{ rows: BoardPublicPost[]; total: number } | null> {
  if (!isBoardConfigured()) return null;
  try {
    return await listPublishedPosts(opts);
  } catch {
    return null;
  }
}

// ---------- 작성 ----------

export type NewPostInput = {
  post_type: BoardPostType;
  tool: string | null;
  rating: number | null;
  title: string;
  body: string;
  nickname: string;
};

export type ParseResult = { ok: true; value: NewPostInput } | { ok: false; error: string };

function clean(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

export function parseNewPost(body: unknown): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;

  const type = String(b.post_type ?? "");
  if (!isBoardPostType(type)) return { ok: false, error: "invalid_type" };

  const toolRaw = String(b.tool ?? "").trim();
  const tool = toolRaw && isBoardTool(toolRaw) ? toolRaw : null;
  if (toolRaw && !tool) return { ok: false, error: "invalid_tool" };

  let rating: number | null = null;
  if (type === "review") {
    const n = Number(b.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: "invalid_rating" };
    rating = n;
  }

  const title = clean(b.title, BOARD_LIMITS.title);
  const text = clean(b.body, BOARD_LIMITS.body);
  const nickname = clean(b.nickname, BOARD_LIMITS.nickname);
  if (!title || !text || !nickname) return { ok: false, error: "required_fields" };
  if (text.length < 5) return { ok: false, error: "body_too_short" };
  if (isReservedNickname(nickname)) return { ok: false, error: "reserved_nickname" };

  return { ok: true, value: { post_type: type, tool, rating, title, body: text, nickname } };
}

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|kr|io|xyz|ru|top|shop|link)\b)/i;

export function containsLink(input: NewPostInput): boolean {
  return LINK_RE.test(`${input.title}\n${input.body}\n${input.nickname}`);
}

export function hashClientIp(ip: string): string {
  const salt =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    "myplatform-board";
  return createHash("sha256").update(`board:v1:${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIpFromHeaders(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** 도배 방지: 직전 글과 간격, 하루 작성 수 확인. 통과하면 null */
export async function checkRateLimit(ipHash: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from(TABLE)
    .select("created_at")
    .eq("ip_hash", ipHash)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_POSTS_PER_DAY);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { created_at: string }[];
  if (rows.length >= MAX_POSTS_PER_DAY) return "daily_limit";
  const last = rows[0]?.created_at;
  if (last && Date.now() - new Date(last).getTime() < MIN_POST_INTERVAL_SEC * 1000) {
    return "too_fast";
  }
  return null;
}

export async function createPost(
  input: NewPostInput,
  ipHash: string,
): Promise<{ id: string; status: BoardStatus }> {
  const sb = getSupabaseAdmin();
  const status: BoardStatus = isPreModeration() || containsLink(input) ? "pending" : "published";
  const { data, error } = await sb
    .from(TABLE)
    .insert({ ...input, status, ip_hash: ipHash })
    .select("id, status")
    .single();
  if (error) throw new Error(error.message);
  const row = data as { id: string; status: BoardStatus };
  return { id: row.id, status: row.status };
}

// ---------- 관리자 ----------

export async function listAdminPosts(
  status?: BoardStatus,
  limit = 200,
): Promise<BoardAdminPost[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from(TABLE)
    .select(ADMIN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toAdmin);
}

export async function updateAdminPost(
  id: string,
  patch: { status?: BoardStatus; answer?: string | null },
): Promise<BoardAdminPost> {
  const sb = getSupabaseAdmin();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) update.status = patch.status;
  if (patch.answer !== undefined) {
    const answer = patch.answer ? patch.answer.trim().slice(0, BOARD_LIMITS.answer) : "";
    update.answer = answer || null;
    update.answered_at = answer ? new Date().toISOString() : null;
  }
  const { data, error } = await sb
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .select(ADMIN_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toAdmin(data as Row);
}

export async function deleteAdminPost(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}


// ---------- 댓글 ----------

/** 같은 작성자의 연속 댓글 간격 / 하루 최대 댓글 수 */
const MIN_COMMENT_INTERVAL_SEC = 30;
const MAX_COMMENTS_PER_DAY = 30;

type CommentRow = BoardPublicComment & { status?: BoardStatus };

function toPublicComment(r: CommentRow): BoardPublicComment {
  return {
    id: r.id,
    post_id: r.post_id,
    body: r.body,
    nickname: r.nickname,
    is_admin: Boolean(r.is_admin),
    created_at: r.created_at,
  };
}

export async function listPublishedComments(postId: string): Promise<BoardPublicComment[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(COMMENT_TABLE)
    .select(COMMENT_PUBLIC_COLUMNS)
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as CommentRow[]).map(toPublicComment);
}

/** 댓글을 달 수 있는 글인지 (게시된 글만). 있으면 알림용 정보 반환 */
export async function getPublishedPostBrief(
  postId: string,
): Promise<{ id: string; title: string; tool: string | null; post_type: BoardPostType } | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, title, tool, post_type")
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string; title: string; tool: string | null; post_type: BoardPostType } | null) ?? null;
}

export type NewCommentInput = { post_id: string; body: string; nickname: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseNewComment(
  body: unknown,
): { ok: true; value: NewCommentInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const postId = String(b.post_id ?? "");
  if (!UUID_RE.test(postId)) return { ok: false, error: "invalid_post" };
  const text = clean(b.body, BOARD_LIMITS.comment);
  const nickname = clean(b.nickname, BOARD_LIMITS.nickname);
  if (!text || !nickname) return { ok: false, error: "required_comment_fields" };
  if (text.length < 2) return { ok: false, error: "comment_too_short" };
  if (isReservedNickname(nickname)) return { ok: false, error: "reserved_nickname" };
  return { ok: true, value: { post_id: postId, body: text, nickname } };
}

export function commentContainsLink(c: NewCommentInput): boolean {
  return LINK_RE.test(`${c.body}\n${c.nickname}`);
}

export async function checkCommentRateLimit(ipHash: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from(COMMENT_TABLE)
    .select("created_at")
    .eq("ip_hash", ipHash)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_COMMENTS_PER_DAY);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { created_at: string }[];
  if (rows.length >= MAX_COMMENTS_PER_DAY) return "comment_daily_limit";
  const last = rows[0]?.created_at;
  if (last && Date.now() - new Date(last).getTime() < MIN_COMMENT_INTERVAL_SEC * 1000) {
    return "comment_too_fast";
  }
  return null;
}

export async function createComment(
  input: NewCommentInput,
  ipHash: string,
): Promise<{ id: string; status: BoardStatus }> {
  const sb = getSupabaseAdmin();
  const status: BoardStatus = commentContainsLink(input) ? "pending" : "published";
  const { data, error } = await sb
    .from(COMMENT_TABLE)
    .insert({ ...input, status, ip_hash: ipHash, is_admin: false })
    .select("id, status")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; status: BoardStatus };
}

// 관리자

export async function listAdminComments(postIds?: string[]): Promise<BoardAdminComment[]> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from(COMMENT_TABLE)
    .select(`${COMMENT_PUBLIC_COLUMNS}, status`)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (postIds?.length) q = q.in("post_id", postIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as CommentRow[]).map((r) => ({
    ...toPublicComment(r),
    status: (r.status ?? "published") as BoardStatus,
  }));
}

export async function createAdminComment(postId: string, body: string): Promise<BoardAdminComment> {
  const sb = getSupabaseAdmin();
  const text = clean(body, BOARD_LIMITS.comment);
  if (!text) throw new Error("empty_comment");
  const { data, error } = await sb
    .from(COMMENT_TABLE)
    .insert({ post_id: postId, body: text, nickname: "운영자", is_admin: true, status: "published" })
    .select(`${COMMENT_PUBLIC_COLUMNS}, status`)
    .single();
  if (error) throw new Error(error.message);
  const r = data as CommentRow;
  return { ...toPublicComment(r), status: (r.status ?? "published") as BoardStatus };
}

export async function updateAdminComment(id: string, status: BoardStatus): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from(COMMENT_TABLE).update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAdminComment(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from(COMMENT_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
