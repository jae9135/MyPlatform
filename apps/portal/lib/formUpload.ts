import { API_BASE } from "@/lib/apiBase";
import { isLocalPortalHost, type LocalFetchErrorOpts, wrapScanFetchError } from "@/lib/localScanApi";

/** Vercel serverless proxy body limit (~4.5MB). Stay under for safety. */
export const PROXY_SAFE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ZIP_MAX_BYTES = 200 * 1024 * 1024;
export const ZIP_WARN_BYTES = 50 * 1024 * 1024;

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

type DesignCheckResult = { ok: boolean; message: string; warnings: string[] };

type DirectApiConfig = { apiBase: string; apiKey: string };

let directConfigPromise: Promise<DirectApiConfig | null> | null = null;

async function loadDirectApiConfig(): Promise<DirectApiConfig | null> {
  const res = await fetch("/api/backend/direct-api");
  if (!res.ok) return null;
  const j = await readJsonResponse(res);
  const apiBase = String(j.apiBase || "").trim().replace(/\/$/, "");
  const apiKey = String(j.apiKey || "").trim();
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
    mode: "cors",
  });
}

export async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      if (res.status === 502 || res.status === 504) {
        throw new Error(
          `API 오류 (HTTP ${res.status}) — Render 대용량 ZIP 처리 실패. localhost:3000 로컬 포털 또는 Render 재배포를 확인하세요.`
        );
      }
      throw new Error(`API 오류 (HTTP ${res.status}) — 응답 본문 없음`);
    }
    return {};
  }
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

/** Large ZIP: upload to /staging on Render, then /run with staging_id via portal proxy. */
export async function stageLargeZip(file: File): Promise<{ staging_id: string; size_bytes: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await postMultipart("v1/source-scan/staging", fd, file);
  const j = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(String(j.detail || `ZIP 업로드 실패 (HTTP ${res.status})`));
  }
  const staging_id = String(j.staging_id || "");
  if (!staging_id) {
    throw new Error("ZIP 업로드 응답에 staging_id 없음 — Render API 재배포 후 다시 시도하세요.");
  }
  return { staging_id, size_bytes: Number(j.size_bytes || file.size) };
}

export function wrapFetchError(e: unknown, _opts?: LocalFetchErrorOpts): Error {
  return wrapScanFetchError(e);
}

/** Large ZIP: skip cloud validate upload; check size client-side only. */
export function clientSideZipValidate(file: File, localMode = false): DesignCheckResult {
  if (file.size > ZIP_MAX_BYTES) {
    return {
      ok: false,
      message: `ZIP 용량 초과 (${formatMb(file.size)}MB · 최대 ${formatMb(ZIP_MAX_BYTES)}MB)`,
      warnings: [],
    };
  }
  const warnings: string[] = [];
  if (file.size > ZIP_WARN_BYTES) {
    warnings.push(
      `대용량 ZIP (${formatMb(file.size)}MB) — 업로드·진단에 수 분 걸릴 수 있습니다.`
    );
  }
  const cloudHint =
    localMode || isLocalPortalHost()
      ? `진단 가능 — ZIP ${formatMb(file.size)}MB`
      : `진단 가능 — ZIP ${formatMb(file.size)}MB (실행 시 Render로 직접 업로드)`;
  return {
    ok: true,
    message: cloudHint,
    warnings,
  };
}
