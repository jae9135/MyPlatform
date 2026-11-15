import { blogError, blogJson, queryInt, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { listBlogImagesCleanup, retryBlogStorageCleanup } from "@/lib/blogStorage";
import { isUuid, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await requireBlogAdmin(request); if (denied) return denied;
  try { return blogJson(await listBlogImagesCleanup(queryInt(new URL(request.url).searchParams.get("limit"), 100, 1, 200, "limit"))); }
  catch (error) { return blogError(error); }
}
export async function POST(request: Request) {
  const denied = await requireBlogAdmin(request, true); if (denied) return denied;
  try {
    const body = await readJsonObject(request);
    if (!isUuid(body.id)) throw new BlogValidationError("유효한 cleanup 작업 UUID가 필요합니다.", "id");
    await retryBlogStorageCleanup(body.id);
    return blogJson({ retried: true });
  } catch (error) { return blogError(error); }
}
