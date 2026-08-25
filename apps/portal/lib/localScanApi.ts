/** Local API (127.0.0.1:8001) for ZIP scans — source-scan & web-quality share settings. */

export const DEFAULT_LOCAL_SCAN_API = "http://127.0.0.1:8001";

const USE_LOCAL_KEY = "localScanUseLocal";
const LOCAL_API_KEY = "localScanLocalApi";
const LEGACY_USE_LOCAL_KEY = "sourceScanUseLocal";
const LEGACY_LOCAL_API_KEY = "sourceScanLocalApi";

export function isLocalScanEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v =
    window.localStorage.getItem(USE_LOCAL_KEY) ??
    window.localStorage.getItem(LEGACY_USE_LOCAL_KEY);
  return v === "1";
}

export function setLocalScanEnabled(on: boolean): void {
  const val = on ? "1" : "0";
  window.localStorage.setItem(USE_LOCAL_KEY, val);
  window.localStorage.setItem(LEGACY_USE_LOCAL_KEY, val);
}

export function getLocalScanApiBase(): string {
  if (typeof window === "undefined") return DEFAULT_LOCAL_SCAN_API;
  const v =
    window.localStorage.getItem(LOCAL_API_KEY)?.trim() ||
    window.localStorage.getItem(LEGACY_LOCAL_API_KEY)?.trim();
  return (v || DEFAULT_LOCAL_SCAN_API).replace(/\/$/, "");
}

export function setLocalScanApiBase(url: string): void {
  const normalized = url.trim().replace(/\/$/, "") || DEFAULT_LOCAL_SCAN_API;
  window.localStorage.setItem(LOCAL_API_KEY, normalized);
  window.localStorage.setItem(LEGACY_LOCAL_API_KEY, normalized);
}

export function localApiBase(useLocal: boolean, proxyBase = "/api/backend"): string {
  if (useLocal) return getLocalScanApiBase();
  return proxyBase.replace(/\/$/, "");
}

export function localApiUrl(useLocal: boolean, apiPath: string, proxyBase = "/api/backend"): string {
  const path = apiPath.replace(/^\//, "");
  return `${localApiBase(useLocal, proxyBase)}/${path}`;
}

export async function fetchLocalApi(
  useLocal: boolean,
  apiPath: string,
  init?: RequestInit,
  proxyBase = "/api/backend"
): Promise<Response> {
  const url = localApiUrl(useLocal, apiPath, proxyBase);
  return fetch(url, {
    ...init,
    mode: useLocal ? "cors" : init?.mode,
  });
}

export async function postLocalMultipart(
  useLocal: boolean,
  apiPath: string,
  fd: FormData,
  proxyBase = "/api/backend"
): Promise<Response> {
  return fetchLocalApi(useLocal, apiPath, { method: "POST", body: fd }, proxyBase);
}

/** @deprecated use fetchLocalApi */
export const fetchSourceScan = fetchLocalApi;

/** @deprecated use postLocalMultipart */
export const postSourceScanMultipart = postLocalMultipart;

/** @deprecated use localApiBase */
export const sourceScanApiBase = localApiBase;

/** @deprecated use localApiUrl */
export const sourceScanApiUrl = localApiUrl;
