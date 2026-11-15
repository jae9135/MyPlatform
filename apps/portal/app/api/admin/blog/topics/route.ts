import { blogError, blogJson, readJson, readJsonObject, requireBlogAdmin } from "@/lib/adminBlogApi";
import { createBlogTopic, deleteBlogTopic, listBlogTopics, updateBlogTopic } from "@/lib/blog";
import { isUuid, validateCreateBlogTopic, validateUpdateBlogTopic, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const d = await requireBlogAdmin(request); if (d) return d; try { return blogJson(await listBlogTopics(new URL(request.url).searchParams.get("activeOnly") === "true")); } catch (e) { return blogError(e); } }
export async function POST(request: Request) { const d = await requireBlogAdmin(request, true); if (d) return d; try { return blogJson(await createBlogTopic(validateCreateBlogTopic(await readJson(request))), 201); } catch (e) { return blogError(e); } }
export async function PATCH(request: Request) { const d = await requireBlogAdmin(request, true); if (d) return d; try { const b = await readJsonObject(request); if (!isUuid(b.id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); return blogJson(await updateBlogTopic(b.id, validateUpdateBlogTopic(b))); } catch (e) { return blogError(e); } }
export async function DELETE(request: Request) { const d = await requireBlogAdmin(request, true); if (d) return d; try { const id = new URL(request.url).searchParams.get("id"); if (!isUuid(id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); await deleteBlogTopic(id); return blogJson({ deleted: true }); } catch (e) { return blogError(e); } }
