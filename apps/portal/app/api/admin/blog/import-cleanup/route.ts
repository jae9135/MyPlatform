import { blogError, blogJson, queryInt, requireBlogAdmin } from "@/lib/adminBlogApi";
import { listPendingBlogImportCleanup } from "@/lib/blog";
import { processPendingBlogImportCleanup } from "@/lib/blogImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireBlogAdmin(request);
  if (denied) return denied;
  try {
    return blogJson(await listPendingBlogImportCleanup(queryInt(new URL(request.url).searchParams.get("limit"), 50, 1, 100, "limit")));
  } catch (error) { return blogError(error); }
}

export async function POST(request: Request) {
  const denied = await requireBlogAdmin(request, true);
  if (denied) return denied;
  try {
    const limit = queryInt(new URL(request.url).searchParams.get("limit"), 20, 1, 50, "limit");
    return blogJson(await processPendingBlogImportCleanup(limit));
  } catch (error) { return blogError(error); }
}
