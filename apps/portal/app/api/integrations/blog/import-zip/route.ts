import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { unzipSync } from "fflate";
import { readBytes, blogError, blogJson, BlogApiInputError } from "@/lib/adminBlogApi";
import { registerBlogImport, toBlogImportPublicResult } from "@/lib/blogImport";
import { BlogValidationError } from "@/lib/blogShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 60;
const MAX_CLOCK_SKEW_SECONDS = 300;
const IMAGE_MIMES = new Map<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif">([[".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"], [".gif", "image/gif"]]);

function unauthorized(): Response {
  return Response.json({ error: { code: "unauthorized", message: "승인된 가져오기 요청이 아닙니다." } }, { status: 401, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function verifySignature(request: Request, rawBody: Uint8Array): void {
  const secret = process.env.BLOG_IMPORT_SHARED_SECRET;
  if (!secret) throw new BlogApiInputError("블로그 가져오기 연동이 설정되지 않았습니다.", 503, "not_configured");
  const timestamp = request.headers.get("x-blog-import-timestamp");
  const provided = request.headers.get("x-blog-import-signature")?.replace(/^sha256=/i, "");
  if (!timestamp || !/^\d{10,13}$/.test(timestamp) || !provided || !/^[a-f0-9]{64}$/i.test(provided)) throw new Error("signature");
  const timestampMs = timestamp.length === 13 ? Number(timestamp) : Number(timestamp) * 1000;
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_SECONDS * 1000) throw new Error("timestamp");
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))) throw new Error("signature");
}

function authorizeImport(request: Request, rawBody: Uint8Array): void {
  const configuredKey = process.env.BLOG_ACTION_API_KEY || process.env.BLOG_IMPORT_SHARED_SECRET;
  const authorization = request.headers.get("authorization");
  if (configuredKey && authorization?.startsWith("Bearer ")) {
    const provided = authorization.slice("Bearer ".length);
    const expected = Buffer.from(configuredKey, "utf8");
    const actual = Buffer.from(provided, "utf8");
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return;
  }
  verifySignature(request, rawBody);
}

function text(value: Uint8Array): string { return new TextDecoder("utf-8", { fatal: true }).decode(value); }
function safePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === "..")) throw new BlogValidationError("ZIP 내부 경로가 안전하지 않습니다.", "zip");
  return normalized;
}
function extension(path: string): string { const dot = path.lastIndexOf("."); return dot >= 0 ? path.slice(dot).toLowerCase() : ""; }
function plainTitle(html: string): string {
  const match = html.match(/<(?:h1|title)\b[^>]*>([\s\S]*?)<\/(?:h1|title)>/i);
  return (match?.[1] ?? "가져온 블로그 원고").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "가져온 블로그 원고";
}
function sanitizeHtml(value: string): string {
  return value.replace(/<(script|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/\s(?:src|href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");
}
function fileMime(path: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const mime = IMAGE_MIMES.get(extension(path));
  if (!mime) throw new BlogValidationError("ZIP에는 JPEG, PNG, WebP, GIF 이미지만 포함할 수 있습니다.", "zip");
  return mime;
}

function originalFileName(request: Request): string {
  const value = request.headers.get("x-blog-original-file-name")?.trim();
  if (!value) return "blog-import.zip";
  try {
    const decoded = decodeURIComponent(value);
    return decoded.slice(0, 255) || "blog-import.zip";
  } catch {
    return value.slice(0, 255) || "blog-import.zip";
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.BLOG_IMPORT_SHARED_SECRET) return blogError(new BlogApiInputError("블로그 가져오기 연동이 설정되지 않았습니다.", 503, "not_configured"));
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/zip") throw new BlogApiInputError("Content-Type은 application/zip이어야 합니다.", 415, "unsupported_media_type");
    const raw = await readBytes(request, MAX_ZIP_BYTES);
    try { authorizeImport(request, raw); } catch { return unauthorized(); }
    let declaredExpandedBytes = 0;
    const declaredNames = new Set<string>();
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(raw, {
        filter: (file) => {
          const safeName = safePath(file.name);
          if (safeName.endsWith("/")) return false;
          const normalizedName = safeName.toLowerCase();
          if (declaredNames.has(normalizedName)) throw new BlogValidationError("ZIP 내부 파일명 또는 경로가 중복됩니다.", "zip");
          declaredNames.add(normalizedName);
          declaredExpandedBytes += file.originalSize;
          const limit = normalizedName.endsWith("metadata.json") ? 1 * 1024 * 1024 : normalizedName.endsWith(".html") ? 5 * 1024 * 1024 : normalizedName.startsWith("images/") ? 10 * 1024 * 1024 : 512 * 1024;
          if (!Number.isSafeInteger(file.originalSize) || file.originalSize > limit || declaredExpandedBytes > MAX_ZIP_BYTES) throw new BlogValidationError("ZIP 압축 해제 크기 제한을 초과했습니다.", "zip");
          return true;
        },
      });
    } catch (error) {
      if (error instanceof BlogValidationError) throw error;
      throw new BlogValidationError("ZIP 파일을 읽을 수 없습니다.", "zip");
    }
    const entries = Object.entries(files).map(([name, bytes]) => ({ name: safePath(name), bytes })).filter(({ name }) => !name.endsWith("/"));
    if (entries.length === 0 || entries.length > MAX_FILES) throw new BlogValidationError(`ZIP 파일은 1~${MAX_FILES}개 파일만 포함할 수 있습니다.`, "zip");
    const normalizedNames = new Set<string>();
    let expandedBytes = 0;
    for (const entry of entries) {
      const normalizedName = entry.name.toLowerCase();
      if (normalizedNames.has(normalizedName)) throw new BlogValidationError("ZIP 내부 파일명 또는 경로가 중복됩니다.", "zip");
      normalizedNames.add(normalizedName);
      expandedBytes += entry.bytes.byteLength;
      if (!Number.isSafeInteger(expandedBytes) || expandedBytes > MAX_ZIP_BYTES) throw new BlogValidationError("압축 해제 후 전체 파일 크기가 50MiB를 초과합니다.", "zip");
      const limit = normalizedName.endsWith("metadata.json") ? 1 * 1024 * 1024 : normalizedName.endsWith(".html") ? 5 * 1024 * 1024 : normalizedName.startsWith("images/") ? 10 * 1024 * 1024 : 512 * 1024;
      if (entry.bytes.byteLength > limit) throw new BlogValidationError("ZIP 내부 개별 파일 크기 제한을 초과했습니다.", "zip");
    }
    const htmlEntry = entries.find(({ name }) => name.toLowerCase().endsWith(".html"));
    if (!htmlEntry) throw new BlogValidationError("ZIP 내부에 HTML 원고가 없습니다.", "zip");
    const metadataEntry = entries.find(({ name }) => name.toLowerCase().endsWith("metadata.json"));
    let metadata: Record<string, unknown> = {};
    if (metadataEntry) {
      try { const value: unknown = JSON.parse(text(metadataEntry.bytes)); if (value && typeof value === "object" && !Array.isArray(value)) metadata = value as Record<string, unknown>; }
      catch { throw new BlogValidationError("metadata.json 형식이 올바르지 않습니다.", "metadata"); }
    }
    const images = entries.filter(({ name }) => name.toLowerCase().startsWith("images/") || name.toLowerCase().includes("/images/")).filter(({ name }) => !name.endsWith("/"));
    const externalId = typeof metadata.external_id === "string" && metadata.external_id.length <= 120 ? metadata.external_id : `zip-${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
    const metadataImages = Array.isArray(metadata.images) ? metadata.images : [];
    const imageData = images.map((image, index) => {
      const source = image.name.replace(/^.*?images\//i, "");
      const imageMeta = metadataImages.find((value) => value && typeof value === "object" && !Array.isArray(value) && ((value as Record<string, unknown>).file === image.name || (value as Record<string, unknown>).file === source));
      const altText = imageMeta && typeof imageMeta === "object" && typeof (imageMeta as Record<string, unknown>).alt === "string" ? (imageMeta as Record<string, unknown>).alt as string : null;
      return { source_id: source, file_name: source, mime_type: fileMime(image.name), bytes: image.bytes, alt_text: altText, sort_order: imageMeta && typeof imageMeta === "object" && typeof (imageMeta as Record<string, unknown>).order === "number" ? (imageMeta as Record<string, unknown>).order as number : index } as const;
    });
    let bodyHtml = sanitizeHtml(text(htmlEntry.bytes));
    bodyHtml = bodyHtml.replace(/<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2[^>]*>/gi, (_full, _attrs: string, _quote: string, src: string) => {
      const cleanSrc = decodeURIComponent(src).replace(/^\.\//, "").toLowerCase();
      const source = cleanSrc.replace(/^.*?images\//, "");
      return imageData.some((image) => image.source_id.toLowerCase() === source) ? `{{image:${source}}}` : "";
    });
    const title = typeof metadata.title === "string" ? metadata.title.slice(0, 200) : plainTitle(bodyHtml);
    const excerptValue = typeof metadata.excerpt === "string" ? metadata.excerpt : typeof metadata.description === "string" ? metadata.description : null;
    const result = await registerBlogImport({
      source_type: "zip",
      original_file_name: originalFileName(request),
      checksum: createHash("sha256").update(raw).digest("hex"),
      external_id: externalId,
      title,
      excerpt: excerptValue ? excerptValue.slice(0, 1000) : null,
      body_markdown: bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      body_html: bodyHtml,
      images: imageData,
      metadata,
    });
    return blogJson(toBlogImportPublicResult(result), result.created ? 201 : 200);
  } catch (error) { return blogError(error); }
}

export async function GET() {
  return blogJson({ endpoint: "/api/integrations/blog/import-zip", method: "POST", content_type: "application/zip", format: "blog_post.html + metadata.json + images/*" });
}
