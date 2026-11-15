import { blogError, readBytes, requireBlogAdmin, BlogApiInputError } from "@/lib/adminBlogApi";
import { POST as importZip } from "@/app/api/integrations/blog/import-zip/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireBlogAdmin(request, true);
  if (denied) return denied;
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/zip") {
      throw new BlogApiInputError("Content-Type은 application/zip이어야 합니다.", 415, "unsupported_media_type");
    }
    const bytes = await readBytes(request, 50 * 1024 * 1024);
    const headers = new Headers({ "Content-Type": "application/zip" });
    const originalFileName = request.headers.get("x-blog-original-file-name");
    if (originalFileName) headers.set("x-blog-original-file-name", originalFileName);
    const actionKey = process.env.BLOG_ACTION_API_KEY || process.env.BLOG_IMPORT_SHARED_SECRET;
    if (actionKey) headers.set("Authorization", `Bearer ${actionKey}`);
    return importZip(new Request(request.url, { method: "POST", headers, body: bytes as unknown as BodyInit }));
  } catch (error) {
    return blogError(error);
  }
}
