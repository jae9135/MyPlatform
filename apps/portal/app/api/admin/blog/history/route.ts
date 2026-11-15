import { blogError, blogJson, queryInt, readJson, requireBlogAdmin } from "@/lib/adminBlogApi";
import { listBlogPublishHistory, recordBlogPublish } from "@/lib/blog";
import { isBlogPublishResult, isUuid, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const d = await requireBlogAdmin(request); if (d) return d;
 try { const p = new URL(request.url).searchParams; const rawResult = p.get("result"); if (rawResult && !isBlogPublishResult(rawResult)) throw new BlogValidationError("게시 결과 값이 올바르지 않습니다.", "result"); const result = rawResult && isBlogPublishResult(rawResult) ? rawResult : undefined; const postId = p.get("postId"); const accountId = p.get("accountId"); if (postId && !isUuid(postId)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "postId"); if (accountId && !isUuid(accountId)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "accountId"); return blogJson(await listBlogPublishHistory({ postId: postId || undefined, accountId: accountId || undefined, result, limit: queryInt(p.get("limit"), 100, 1, 500, "limit"), offset: queryInt(p.get("offset"), 0, 0, 1000000, "offset") })); } catch (e) { return blogError(e); }
}
/** History is append-only; this route intentionally has no PATCH or DELETE. */
export async function POST(request: Request) {
 const d = await requireBlogAdmin(request, true); if (d) return d;
 try {
  const key = request.headers.get("idempotency-key");
  if (!isUuid(key)) throw new BlogValidationError("Idempotency-Key 헤더는 UUID여야 합니다.", "Idempotency-Key");
  const result = await recordBlogPublish(await readJson(request), key);
  return blogJson(result.history, result.replayed ? 200 : 201);
 } catch (e) { return blogError(e); }
}
