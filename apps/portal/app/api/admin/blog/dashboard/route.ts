import { blogError, blogJson, requireBlogAdmin } from "@/lib/adminBlogApi";
import { getBlogDashboardSummary } from "@/lib/blog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await requireBlogAdmin(request);
  if (denied) return denied;
  try { return blogJson(await getBlogDashboardSummary()); } catch (error) { return blogError(error); }
}
