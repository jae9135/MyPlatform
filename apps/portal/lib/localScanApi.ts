/** Portal → API via same-origin proxy (/api/backend). Large ZIP may use direct Render upload. */

import { API_BASE } from "@/lib/apiBase";

const FETCH_TIMEOUT_MS = 20000;
const MULTIPART_UPLOAD_TIMEOUT_MS = 180000;

export function isLocalPortalHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export async function fetchScanApi(
  apiPath: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const path = apiPath.replace(/^\//, "");
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}/${path}`, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function postScanMultipart(apiPath: string, fd: FormData): Promise<Response> {
  return fetchScanApi(apiPath, { method: "POST", body: fd }, MULTIPART_UPLOAD_TIMEOUT_MS);
}

export function wrapScanFetchError(e: unknown): Error {
  const msg = String((e as Error).message || e);
  const timedOut = msg.includes("aborted") || msg.includes("timeout");
  if (msg === "Failed to fetch" || msg.includes("NetworkError") || timedOut) {
    if (isLocalPortalHost()) {
      return new Error(
        timedOut
          ? "API 응답 시간 초과 — ZIP 업로드·진단에 시간이 걸릴 수 있습니다. API(start-local-scan.bat) 실행 여부를 확인하고 다시 시도하세요."
          : "API 연결 실패 — start-local-scan.bat 실행 후 포털을 새로고침하세요."
      );
    }
    return new Error(
      "API 연결 실패. Render·Vercel 환경 변수 또는 대용량 ZIP은 localhost:3000 로컬 포털 사용."
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

/** @deprecated use fetchScanApi */
export async function fetchLocalApi(
  _useLocal: boolean,
  apiPath: string,
  init?: RequestInit,
  proxyBase = "/api/backend"
): Promise<Response> {
  void proxyBase;
  return fetchScanApi(apiPath, init);
}

/** @deprecated use postScanMultipart */
export async function postLocalMultipart(
  _useLocal: boolean,
  apiPath: string,
  fd: FormData,
  proxyBase = "/api/backend"
): Promise<Response> {
  void proxyBase;
  return postScanMultipart(apiPath, fd);
}
