import { blogError, blogJson, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { BlogDataError, deleteBlogPost, getBlogPost, updateBlogPost } from "@/lib/blog";
import { validateUpdateBlogPost, BlogValidationError, isUuid } from "@/lib/blogShared";
type Ctx = { params: { id: string } };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: Ctx) {
 const denied = await requireBlogAdmin(request); if (denied) return denied;
 try { if (!isUuid(params.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); const post = await getBlogPost(params.id); if (!post) throw new BlogDataError("not_found", "원고를 찾을 수 없습니다."); return blogJson(post); } catch (e) { return blogError(e); }
}
export async function PATCH(request: Request, { params }: Ctx) {
 const denied = await requireBlogAdmin(request, true); if (denied) return denied;
 try { if (!isUuid(params.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); return blogJson(await updateBlogPost(params.id, validateUpdateBlogPost(await readJsonObject(request)))); } catch (e) { return blogError(e); }
}
export async function DELETE(request: Request, { params }: Ctx) {
 const denied = await requireBlogAdmin(request, true); if (denied) return denied;
 try { if (!isUuid(params.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); await deleteBlogPost(params.id); return blogJson({ deleted: true }); } catch (e) { return blogError(e); }
}
