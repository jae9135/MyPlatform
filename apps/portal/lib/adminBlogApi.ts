import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { ADMIN_COOKIE, isAdminAuthed } from "@/lib/admin-auth";
import { BlogDataError } from "@/lib/blog";
import { BlogStorageError, BlogValidationError } from "@/lib/blogShared";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
export const BLOG_JSON_LIMIT = 512 * 1024;
export const BLOG_IMAGE_LIMIT = 10 * 1024 * 1024;

export class BlogApiInputError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = "BlogApiInputError"; }
}

export function blogJson(data: unknown, status = 200): Response {
  return Response.json({ data }, { status, headers: NO_STORE });
}

export function blogError(error: unknown): Response {
  let status = 500;
  let code = "internal_error";
  let message = "요청을 처리하지 못했습니다.";
  if (error instanceof BlogApiInputError) ({ status, code, message } = { status: error.status, code: error.code, message: error.message });
  else if (error instanceof BlogValidationError) ({ status, code, message } = { status: 400, code: "invalid_input", message: error.message });
  else if (error instanceof BlogDataError) {
    code = error.code;
    status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "invalid_data" ? 400 : error.code === "not_configured" ? 503 : 500;
    message = status >= 500 ? "블로그 데이터 저장소를 사용할 수 없습니다." : error.message;
  } else if (error instanceof BlogStorageError) {
    code = error.code;
    status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "invalid_file" ? 400 : error.code === "not_configured" ? 503 : 500;
    message = error.message;
  } else if (error instanceof SyntaxError) ({ status, code, message } = { status: 400, code: "invalid_json", message: "JSON 요청 본문이 올바르지 않습니다." });
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/** Authenticate before parsing request bodies or calling any DB/Storage code. */
function cookieFromHeader(header: string | null, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const rawValue = part.slice(separator + 1).trim();
    try { return decodeURIComponent(rawValue); } catch { return rawValue; }
  }
  return "";
}

export async function requireBlogAdmin(request: Request, write = false): Promise<Response | null> {
  const jar = await cookies();
  // Next request cookie store를 우선 사용하고, 런타임/프록시에서 cookie store가 비어 있을 때만
  // 동일 요청의 Cookie 헤더에서 관리자 쿠키를 읽습니다. 서명 토큰 검증은 기존 isAdminAuthed 그대로 수행합니다.
  const headerAdminCookie = cookieFromHeader(request.headers.get("cookie"), ADMIN_COOKIE);
  const authenticated = await isAdminAuthed((name) => {
    const cookie = jar.get(name)?.value;
    if (cookie) return { value: cookie };
    return name === ADMIN_COOKIE && headerAdminCookie ? { value: headerAdminCookie } : undefined;
  });
  if (!authenticated) {
    return Response.json({ error: { code: "unauthorized", message: "관리자 인증이 필요합니다." } }, { status: 401, headers: NO_STORE });
  }
  if (write) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return Response.json({ error: { code: "invalid_origin", message: "요청 출처를 확인할 수 없습니다." } }, { status: 403, headers: NO_STORE });
    }
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return Response.json({ error: { code: "cross_site_request", message: "교차 사이트 요청은 허용되지 않습니다." } }, { status: 403, headers: NO_STORE });
    }
  }
  return null;
}

/** Returns a server-derived principal; clients cannot submit an approval identity. */
export async function requireBlogAdminPrincipal(request: Request, write = false): Promise<{ principal: string } | Response> {
  const denied = await requireBlogAdmin(request, write);
  if (denied) return denied;
  const jar = await cookies();
  const cookie = jar.get("mp_admin")?.value ?? "";
  return { principal: `admin-session:${createHash("sha256").update(cookie).digest("hex").slice(0, 24)}` };
}

export async function readBytes(request: Request, maxBytes = BLOG_JSON_LIMIT): Promise<Uint8Array> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new BlogApiInputError("요청 본문이 허용 크기를 초과했습니다.", 413, "body_too_large");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BlogApiInputError("요청 본문이 허용 크기를 초과했습니다.", 413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readJson(request: Request, maxBytes = BLOG_JSON_LIMIT): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new BlogApiInputError("Content-Type은 application/json이어야 합니다.", 415, "unsupported_media_type");
  const bytes = await readBytes(request, maxBytes);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (error) {
    if (error instanceof BlogApiInputError) throw error;
    throw new BlogApiInputError("JSON 요청 본문이 올바르지 않습니다.", 400, "invalid_json");
  }
}

export async function readJsonObject(request: Request, maxBytes = BLOG_JSON_LIMIT): Promise<Record<string, unknown>> {
  const body = await readJson(request, maxBytes);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BlogValidationError("요청 본문은 객체여야 합니다.");
  return body as Record<string, unknown>;
}

export function queryInt(value: string | null, fallback: number, min: number, max: number, field: string): number {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new BlogValidationError(`${field} 값이 올바르지 않습니다.`, field);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new BlogValidationError(`${field} 값은 ${min}~${max} 범위여야 합니다.`, field);
  return parsed;
}
