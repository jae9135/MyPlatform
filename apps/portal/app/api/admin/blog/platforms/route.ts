import { blogError, blogJson, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { listBlogPlatforms, updateBlogPlatform } from "@/lib/blog";
import { isUuid, validateUpdateBlogPlatform, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await requireBlogAdmin(request); if (denied) return denied;
  try { return blogJson(await listBlogPlatforms()); } catch (error) { return blogError(error); }
}
export async function PATCH(request: Request) {
  const denied = await requireBlogAdmin(request, true); if (denied) return denied;
  try { const body = await readJsonObject(request); if (!isUuid(body.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); return blogJson(await updateBlogPlatform(body.id, validateUpdateBlogPlatform(body))); }
  catch (error) { return blogError(error); }
}
