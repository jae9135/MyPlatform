import { blogError, blogJson, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { createBlogPostTarget, listBlogPostTargets } from "@/lib/blog";
import { validateCreateBlogTarget, BlogValidationError, isUuid } from "@/lib/blogShared";
type Ctx = { params: { id: string } };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: Ctx) {
 const denied = await requireBlogAdmin(request); if (denied) return denied;
 try { if (!isUuid(params.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); return blogJson(await listBlogPostTargets(params.id)); } catch (e) { return blogError(e); }
}
export async function POST(request: Request, { params }: Ctx) {
 const denied = await requireBlogAdmin(request, true); if (denied) return denied;
 try { if (!isUuid(params.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); const body = await readJsonObject(request); if (body.post_id && body.post_id !== params.id) throw new BlogValidationError("경로 원고 ID와 본문 원고 ID가 다릅니다.", "post_id"); return blogJson(await createBlogPostTarget(validateCreateBlogTarget({ ...body, post_id: params.id })), 201); } catch (e) { return blogError(e); }
}
