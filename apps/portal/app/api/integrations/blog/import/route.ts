import { createHmac, timingSafeEqual } from "node:crypto";
import { readBytes, blogError, blogJson, BlogApiInputError } from "@/lib/adminBlogApi";
import { registerBlogImport, toBlogImportPublicResult } from "@/lib/blogImport";
import { BlogValidationError, validateBlogImportPayload } from "@/lib/blogShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPORT_BODY_LIMIT = 50 * 1024 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;

function unauthorized(message = "승인된 가져오기 요청이 아닙니다."): Response {
  return Response.json({ error: { code: "unauthorized", message } }, {
    status: 401,
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" },
  });
}

function verifySignature(request: Request, rawBody: Uint8Array): void {
  const secret = process.env.BLOG_IMPORT_SHARED_SECRET;
  if (!secret) throw new BlogApiInputError("블로그 가져오기 연동이 설정되지 않았습니다.", 503, "not_configured");
  const timestamp = request.headers.get("x-blog-import-timestamp");
  const provided = request.headers.get("x-blog-import-signature")?.replace(/^sha256=/i, "");
  if (!timestamp || !/^\d{10,13}$/.test(timestamp) || !provided || !/^[a-f0-9]{64}$/i.test(provided)) throw new Error("signature");
  const timestampMs = timestamp.length === 13 ? Number(timestamp) : Number(timestamp) * 1000;
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_SECONDS * 1000) throw new Error("timestamp");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${Buffer.from(rawBody).toString("utf8")}`).digest("hex");
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

function decodeBase64(value: string, field: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new BlogValidationError("이미지 데이터가 올바른 Base64가 아닙니다.", field);
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length) throw new BlogValidationError("빈 이미지 데이터입니다.", field);
  return new Uint8Array(bytes);
}

function sanitizeImportedHtml(value: string): string {
  return value
    .replace(/<(script|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:src|href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");
}

export async function POST(request: Request) {
  try {
    if (!process.env.BLOG_IMPORT_SHARED_SECRET) {
      return blogError(new BlogApiInputError("블로그 가져오기 연동이 설정되지 않았습니다.", 503, "not_configured"));
    }
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new BlogApiInputError("Content-Type은 application/json이어야 합니다.", 415, "unsupported_media_type");
    }
    const rawBody = await readBytes(request, IMPORT_BODY_LIMIT);
    try { authorizeImport(request, rawBody); } catch { return unauthorized(); }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); }
    catch { throw new BlogApiInputError("JSON 요청 본문이 올바르지 않습니다.", 400, "invalid_json"); }
    const payload = validateBlogImportPayload(input);
    const result = await registerBlogImport({
      source_type: "json",
      external_id: payload.external_id,
      title: payload.title,
      excerpt: payload.excerpt,
      body_markdown: payload.body_markdown,
      body_html: sanitizeImportedHtml(payload.body_html),
      images: (payload.images ?? []).map((image) => ({ ...image, bytes: decodeBase64(image.data_base64, `images.${image.source_id}.data_base64`) })),
      metadata: {
        ...(payload.metadata ?? {}),
        ...(payload.platform !== undefined ? { platform: payload.platform } : {}),
        ...(payload.category !== undefined ? { category: payload.category } : {}),
        ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
        ...(payload.account_id !== undefined ? { account_id: payload.account_id } : {}),
        ...(payload.category_id !== undefined ? { category_id: payload.category_id } : {}),
      },
    });
    return blogJson(toBlogImportPublicResult(result), result.created ? 201 : 200);
  } catch (error) {
    return blogError(error);
  }
}

export async function GET() {
  return blogJson({ endpoint: "/api/integrations/blog/import", method: "POST", authentication: "X-Blog-Import-Timestamp + X-Blog-Import-Signature", approval: "ChatGPT 승인 후 사용", images: "base64 임시 업로드 후 비공개 Storage에서 게시 지원 화면으로 복사" });
}
