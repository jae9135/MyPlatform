import { blogError, blogJson, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { deleteBlogPostTarget, listBlogPostTargets, updateBlogPostTarget } from "@/lib/blog";
import { validateUpdateBlogTarget, BlogValidationError, isUuid } from "@/lib/blogShared";
type Ctx = { params: { id: string; targetId: string } };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function assertParent(postId: string, targetId: string) { if (!isUuid(postId) || !isUuid(targetId)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); if (!(await listBlogPostTargets(postId)).some((item) => item.id === targetId)) throw new BlogValidationError("게시 대상이 해당 원고에 속하지 않습니다.", "targetId"); }
export async function PATCH(request: Request, { params }: Ctx) {
 const denied = await requireBlogAdmin(request, true); if (denied) return denied;
 try { await assertParent(params.id, params.targetId); return blogJson(await updateBlogPostTarget(params.targetId, validateUpdateBlogTarget(await readJsonObject(request)))); } catch (e) { return blogError(e); }
}
export async function DELETE(request: Request, { params }: Ctx) {
 const denied = await requireBlogAdmin(request, true); if (denied) return denied;
 try { await assertParent(params.id, params.targetId); await deleteBlogPostTarget(params.targetId); return blogJson({ deleted: true }); } catch (e) { return blogError(e); }
}
