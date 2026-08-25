import { API_BASE } from "@/lib/apiBase";

/** Vercel serverless proxy body limit (~4.5MB). Stay under for safety. */
export const PROXY_SAFE_UPLOAD_BYTES = 4 * 1024 * 1024;

type DirectApiConfig = { apiBase: string; apiKey: string };

let directConfigPromise: Promise<DirectApiConfig | null> | null = null;

async function loadDirectApiConfig(): Promise<DirectApiConfig | null> {
  const res = await fetch("/api/backend/direct-api");
  if (!res.ok) return null;
  const j = (await res.json()) as { apiBase?: string; apiKey?: string };
  const apiBase = j.apiBase?.trim().replace(/\/$/, "");
  const apiKey = j.apiKey?.trim();
  if (!apiBase || !apiKey) return null;
  return { apiBase, apiKey };
}

function getDirectConfig(): Promise<DirectApiConfig | null> {
  if (!directConfigPromise) {
    directConfigPromise = loadDirectApiConfig().catch(() => null);
  }
  return directConfigPromise;
}

export function shouldUploadDirect(file: File | null | undefined): boolean {
  return Boolean(file && file.size > PROXY_SAFE_UPLOAD_BYTES);
}

/** POST multipart — large files bypass Vercel proxy and go to Render directly. */
export async function postMultipart(
  apiPath: string,
  fd: FormData,
  file?: File | null
): Promise<Response> {
  const path = apiPath.replace(/^\//, "");
  if (!shouldUploadDirect(file)) {
    return fetch(`${API_BASE}/${path}`, { method: "POST", body: fd });
  }
  const cfg = await getDirectConfig();
  if (!cfg) {
    return fetch(`${API_BASE}/${path}`, { method: "POST", body: fd });
  }
  return fetch(`${cfg.apiBase}/${path}`, {
    method: "POST",
    headers: { "X-Api-Key": cfg.apiKey },
    body: fd,
  });
}

export async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (res.status === 413 || /request entity too large/i.test(text)) {
      throw new Error(
        "ZIP 용량이 포털 업로드 한계(~4.5MB)를 초과합니다. Render API 직접 업로드 설정(direct-api)을 확인하세요."
      );
    }
    throw new Error(text.length > 240 ? `${text.slice(0, 240)}…` : text);
  }
}
