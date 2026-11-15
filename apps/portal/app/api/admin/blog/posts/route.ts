import { blogError, blogJson, queryInt, readJson, requireBlogAdmin } from "@/lib/adminBlogApi";
import { createBlogPost, listBlogPosts } from "@/lib/blog";
import { isBlogPostEditStatus, validateCreateBlogPost, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await requireBlogAdmin(request); if (denied) return denied;
  try { const p = new URL(request.url).searchParams; const rawStatus = p.get("editStatus"); if (rawStatus && !isBlogPostEditStatus(rawStatus)) throw new BlogValidationError("허용되지 않은 상태 값입니다.", "editStatus"); const editStatus = rawStatus && isBlogPostEditStatus(rawStatus) ? rawStatus : undefined; return blogJson(await listBlogPosts({ editStatus, search: p.get("search") || undefined, limit: queryInt(p.get("limit"), 50, 1, 200, "limit"), offset: queryInt(p.get("offset"), 0, 0, 1000000, "offset") })); } catch (error) { return blogError(error); }
}
export async function POST(request: Request) {
  const denied = await requireBlogAdmin(request, true); if (denied) return denied;
  try { return blogJson(await createBlogPost(validateCreateBlogPost(await readJson(request))), 201); } catch (error) { return blogError(error); }
}
