import { BLOG_IMAGE_LIMIT, blogError, blogJson, queryInt, readBytes, requireBlogAdmin } from "@/lib/adminBlogApi";
import { deleteBlogImage, listBlogImages, uploadBlogImage, assertImageMime } from "@/lib/blogStorage";
import { BlogValidationError, isUuid } from "@/lib/blogShared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const d = await requireBlogAdmin(request); if (d) return d;
 try { const p = new URL(request.url).searchParams; return blogJson(await listBlogImages(queryInt(p.get("limit"), 100, 1, 200, "limit"), queryInt(p.get("offset"), 0, 0, 1000000, "offset"))); } catch (e) { return blogError(e); }
}
export async function POST(request: Request) {
 const d = await requireBlogAdmin(request, true); if (d) return d;
 try {
  assertImageMime(request.headers.get("content-type"));
  const bytes = await readBytes(request, BLOG_IMAGE_LIMIT);
  const p = new URL(request.url).searchParams;
  const fileName = p.get("fileName") ?? "image";
  const altText = p.get("altText");
  if (fileName.length > 255 || (altText?.length ?? 0) > 1000) throw new BlogValidationError("파일명 또는 대체 텍스트가 너무 깁니다.");
  const asset = await uploadBlogImage(bytes, request.headers.get("content-type")!.split(";")[0].trim().toLowerCase(), fileName, altText);
  return blogJson(asset, 201);
 } catch (e) { return blogError(e); }
}
export async function DELETE(request: Request) {
 const d = await requireBlogAdmin(request, true); if (d) return d;
 try { const id = new URL(request.url).searchParams.get("id"); if (!isUuid(id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", "id"); await deleteBlogImage(id); return blogJson({ deleted: true }); } catch (e) { return blogError(e); }
}
