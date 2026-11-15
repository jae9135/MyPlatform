import { blogError, blogJson, readJson, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { createBlogCategory, deleteBlogCategory, listBlogCategories, updateBlogCategory } from "@/lib/blog";
import { isUuid, validateCreateBlogCategory, validateUpdateBlogCategory, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const d = await requireBlogAdmin(request); if (d) return d; try { const id = new URL(request.url).searchParams.get("accountId"); if (!isUuid(id)) throw new BlogValidationError("유효한 accountId가 필요합니다.", "accountId"); return blogJson(await listBlogCategories(id)); } catch (e) { return blogError(e); } }
export async function POST(request: Request) { const d = await requireBlogAdmin(request, true); if (d) return d; try { return blogJson(await createBlogCategory(validateCreateBlogCategory(await readJson(request))), 201); } catch (e) { return blogError(e); } }
export async function PATCH(request: Request) { const d = await requireBlogAdmin(request, true); if (d) return d; try { const b = await readJsonObject(request); if (!isUuid(b.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); return blogJson(await updateBlogCategory(b.id, validateUpdateBlogCategory(b))); } catch (e) { return blogError(e); } }
export async function DELETE(request: Request) { const d = await requireBlogAdmin(request, true); if (d) return d; try { const id = new URL(request.url).searchParams.get("id"); if (!isUuid(id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); await deleteBlogCategory(id); return blogJson({ deleted: true }); } catch (e) { return blogError(e); } }
