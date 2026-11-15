import { blogError, blogJson, readJson, requireBlogAdmin } from "@/lib/adminBlogApi";
import { createBlogMetric, listBlogMetrics } from "@/lib/blog";
import { isUuid, validateCreateBlogMetric, BlogValidationError } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const d = await requireBlogAdmin(request); if (d) return d; try { const historyId = new URL(request.url).searchParams.get("historyId"); if (!isUuid(historyId)) throw new BlogValidationError("유효한 historyId가 필요합니다.", "historyId"); return blogJson(await listBlogMetrics(historyId)); } catch (e) { return blogError(e); } }
export async function POST(request: Request) { const d = await requireBlogAdmin(request, true); if (d) return d; try { return blogJson(await createBlogMetric(validateCreateBlogMetric(await readJson(request))), 201); } catch (e) { return blogError(e); } }
