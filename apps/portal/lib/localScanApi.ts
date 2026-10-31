/** Portal → API: localhost uses /api/backend proxy; Vercel uses Render direct when configured. */

import { API_BASE } from "@/lib/apiBase";

const FETCH_TIMEOUT_MS = 20000;
const ENV_FETCH_TIMEOUT_MS = 60000;
const ENV_FETCH_TIMEOUT_LOCAL_MS = 12000;
const JOB_POLL_TIMEOUT_MS = 45000;
const MULTIPART_UPLOAD_TIMEOUT_MS = 180000;
const ENV_FETCH_RETRIES = 2;
const ENV_FETCH_RETRY_DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTimeoutError(e: unknown): boolean {
  const msg = String((e as Error).message || e);
  return msg.includes("aborted") || msg.includes("timeout");
}

/** Render 직접 호출 설정 — 마스터 API 키 대신 포털이 발급한 단기 업로드 토큰 사용 */
type DirectApiConfig = { apiBase: string; uploadToken: string; expiresAt: number };

let directConfigPromise: Promise<DirectApiConfig | null> | null = null;
let directConfigCache: DirectApiConfig | null = null;
/** direct-api 미설정(503 등)일 때 매 요청마다 다시 묻지 않도록 잠시 프록시 경로로 고정 */
let directConfigUnavailableUntil = 0;

/** 만료 60초 전부터는 새 토큰을 받습니다. */
const TOKEN_REFRESH_MARGIN_SEC = 60;

/** IPMS 2차 암호 통과 직후 호출 — 다음 요청부터 IPMS 권한이 들어간 새 토큰을 받음 */
export function resetDirectScanApiConfig(): void {
  directConfigCache = null;
  directConfigPromise = null;
  directConfigUnavailableUntil = 0;
}

export function isLocalPortalHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export async function getDirectScanApiConfig(): Promise<DirectApiConfig | null> {
  if (isLocalPortalHost()) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (directConfigCache && directConfigCache.expiresAt - TOKEN_REFRESH_MARGIN_SEC > nowSec) {
    return directConfigCache;
  }
  if (!directConfigCache && directConfigUnavailableUntil > nowSec) return null;
  if (!directConfigPromise) {
    directConfigPromise = (async () => {
      const res = await fetch("/api/backend/direct-api", { cache: "no-store" });
      if (!res.ok) return null;
      const j = (await res.json()) as { apiBase?: string; uploadToken?: string; expiresAt?: number };
      const apiBase = String(j.apiBase || "").trim().replace(/\/$/, "");
      const uploadToken = String(j.uploadToken || "").trim();
      const expiresAt = Number(j.expiresAt || 0);
      if (!apiBase || !uploadToken || !expiresAt) return null;
      return { apiBase, uploadToken, expiresAt };
    })()
      .catch(() => null)
      .then((cfg) => {
        directConfigCache = cfg;
        directConfigPromise = null;
        if (!cfg) directConfigUnavailableUntil = Math.floor(Date.now() / 1000) + 300;
        return cfg;
      });
  }
  return directConfigPromise;
}

async function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init ?? {}), signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function resolveScanApiUrl(
  apiPath: string,
  init?: RequestInit,
  opts?: { forceProxy?: boolean },
): Promise<{ url: string; init: RequestInit }> {
  const path = apiPath.replace(/^\//, "");
  if (!opts?.forceProxy) {
    const direct = await getDirectScanApiConfig();
    if (direct) {
      const headers = new Headers(init?.headers);
      headers.set("X-Upload-Token", direct.uploadToken);
      return {
        url: `${direct.apiBase}/${path}`,
        init: { ...init, headers, mode: "cors" },
      };
    }
  }
  return { url: `${API_BASE}/${path}`, init: { ...(init ?? {}), credentials: "include" } };
}

export async function fetchScanApi(
  apiPath: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
  opts?: { forceProxy?: boolean },
): Promise<Response> {
  const { url, init: resolved } = await resolveScanApiUrl(apiPath, init, opts);
  return fetchWithTimeout(url, resolved, timeoutMs);
}

/** Environment probe — always Vercel 프록시 (/api/backend) 사용 (CORS·설정 오류 방지). */
export async function fetchScanEnvApi(apiPath: string, init?: RequestInit): Promise<Response> {
  const timeoutMs = isLocalPortalHost() ? ENV_FETCH_TIMEOUT_LOCAL_MS : ENV_FETCH_TIMEOUT_MS;
  return fetchScanApi(apiPath, init, timeoutMs, { forceProxy: true });
}

export async function fetchScanEnvWithRetry(
  apiPath: string,
  init?: RequestInit,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= ENV_FETCH_RETRIES; attempt += 1) {
    try {
      return await fetchScanEnvApi(apiPath, init);
    } catch (e) {
      lastErr = e;
      if (!isTimeoutError(e) || attempt >= ENV_FETCH_RETRIES) break;
      await sleep(ENV_FETCH_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Job status polling — longer timeout for Render cold start. */
export async function fetchScanJobApi(apiPath: string, init?: RequestInit): Promise<Response> {
  return fetchScanApi(apiPath, init, JOB_POLL_TIMEOUT_MS);
}

export async function postScanMultipart(apiPath: string, fd: FormData): Promise<Response> {
  return fetchScanApi(apiPath, { method: "POST", body: fd }, MULTIPART_UPLOAD_TIMEOUT_MS);
}

export function wrapScanFetchError(e: unknown, opts?: { scanBusy?: boolean; envProbe?: boolean }): Error {
  const msg = String((e as Error).message || e);
  const timedOut = isTimeoutError(e);
  if (msg === "Failed to fetch" || msg.includes("NetworkError") || timedOut) {
    if (opts?.envProbe && opts.scanBusy && timedOut) {
      return new Error(
        "환경 조회 지연 — Render가 진단 중이라 응답이 느릸습니다. 진단 진행은 계속됩니다. 완료 후 「환경 다시 확인」을 누르세요.",
      );
    }
    if (opts?.envProbe && timedOut) {
      if (isLocalPortalHost()) {
        return new Error(
          "환경 API 응답 지연 — .\\scripts\\start-api-source-scan.ps1 실행 여부를 확인한 뒤 「환경 다시 확인」을 누르세요.",
        );
      }
      return new Error(
        "환경 API 응답 지연 — Render cold start·부하일 수 있습니다. 「환경 다시 확인」을 누르거나 1~2분 후 새로고침하세요.",
      );
    }
    if (isLocalPortalHost()) {
      return new Error(
        timedOut
          ? "API 응답 시간 초과 — ZIP 업로드·진단에 시간이 걸릴 수 있습니다. API(start-local-scan.bat) 실행 여부를 확인하고 다시 시도하세요."
          : "API 연결 실패 — start-local-scan.bat 실행 후 포털을 새로고침하세요."
      );
    }
    return new Error(
      timedOut
        ? "Render API 응답 시간 초과 — cold start·진단 중일 수 있습니다. 1~2분 후 재시도하거나 localhost:3000 로컬 포털을 사용하세요."
        : "Render API 연결 실패 — Vercel에 NEXT_PUBLIC_API_BASE_URL·API_ACCESS_KEY 설정, Render API 재배포(업로드 토큰 지원) 여부를 확인하세요. (로컬: start-local-scan.bat)"
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

export function isEnvProbeSoftError(message: string): boolean {
  return message.startsWith("환경 조회 지연") || message.startsWith("환경 API 응답 지연");
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
