import { blogError, blogJson, readJson, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { createBlogAccount, deleteBlogAccount, listBlogAccounts, updateBlogAccount } from "@/lib/blog";
import { isUuid, validateCreateBlogAccount, validateUpdateBlogAccount, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await requireBlogAdmin(request); if (denied) return denied;
  try { const p = new URL(request.url).searchParams; const platformId = p.get("platformId") ?? undefined; if (platformId && !isUuid(platformId)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "platformId"); return blogJson(await listBlogAccounts(platformId)); } catch (error) { return blogError(error); }
}
export async function POST(request: Request) {
  const denied = await requireBlogAdmin(request, true); if (denied) return denied;
  try { return blogJson(await createBlogAccount(validateCreateBlogAccount(await readJson(request))), 201); } catch (error) { return blogError(error); }
}
export async function PATCH(request: Request) {
  const denied = await requireBlogAdmin(request, true); if (denied) return denied;
  try { const body = await readJsonObject(request); if (!isUuid(body.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); return blogJson(await updateBlogAccount(body.id, validateUpdateBlogAccount(body))); } catch (error) { return blogError(error); }
}
export async function DELETE(request: Request) {
  const denied = await requireBlogAdmin(request, true); if (denied) return denied;
  try { const id = new URL(request.url).searchParams.get("id"); if (!isUuid(id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); await deleteBlogAccount(id); return blogJson({ deleted: true }); } catch (error) { return blogError(error); }
}
