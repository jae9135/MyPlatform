import { readJsonResponse } from "@/lib/formUpload";
import { fetchScanApi, isLocalPortalHost, postScanMultipart } from "@/lib/localScanApi";

/** 배포 API — headed 로그인 창 불가 시 안내 (IPMS · 외부 · Java 배포 URL) */
export const DEPLOY_SESSION_UPLOAD_HINT =
  "배포 API에서는 로그인 창을 띄울 수 없습니다. PC에서 세션 JSON을 생성한 뒤 「세션 JSON 업로드」를 사용하세요.";

/** 배포 API — Vercel 포털 URL headless 자동 로그인 안내 */
export const DEPLOY_PORTAL_AUTO_LOGIN_HINT =
  "Vercel 등 배포 포털 URL은 API가 포털 암호(PORTAL_PASSWORD)로 자동 로그인합니다. 이 PC에 Chromium 창은 뜨지 않습니다.";

export function isIpmsDeployUrl(url: string): boolean {
  return url.trim().toLowerCase().includes("ipms.online");
}

/** 로컬 MyPlatform 포털(127.0.0.1:3000 등) */
export function isPortalLocalBaseUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const host = parsed.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return false;
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    if (port !== "3000") return false;
    const path = (parsed.pathname || "/").replace(/\/+$/, "") || "/";
    return path === "/";
  } catch {
    return false;
  }
}

export function isPortalLikeBaseUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw.includes("://") ? raw : `http://${raw}`).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

/**
 * 로컬 Portal+API 또는 배포 포털 URL(Vercel) — 「로그인 창 띄움」/포털 자동 로그인 가능.
 * IPMS·외부 사이트·배포 API에서는 false → 세션 JSON 업로드만.
 */
export function isHeadedBrowserSessionAvailable(targetUrl: string): boolean {
  if (isLocalPortalHost()) return true;
  return isPortalLikeBaseUrl(targetUrl.trim());
}

type SessionValidateResponse = { ok?: boolean; valid?: boolean; message?: string };

function sessionOk(res: Response, j: SessionValidateResponse): boolean {
  if (j.valid !== undefined) return Boolean(res.ok && j.valid);
  return Boolean(res.ok && j.ok);
}

/** 브라우저 job 세션 검증 — IPMS / 포털 / 외부 URL 자동 분기 */
export async function validateWqSessionJob(jobId: string, baseUrl: string): Promise<boolean> {
  const result = await validateWqSessionJobDetailed(jobId, baseUrl);
  return result.ok;
}

/** validateWqSessionJob + API message (배포 포털 자동 로그인 실패 안내용) */
export async function validateWqSessionJobDetailed(
  jobId: string,
  baseUrl: string,
): Promise<{ ok: boolean; message: string }> {
  const id = jobId.trim();
  const url = baseUrl.trim();
  if (!id || !url) return { ok: false, message: "세션 job_id와 URL이 필요합니다." };
  try {
    const q = new URLSearchParams({ base_url: url });
    let res: Response;
    if (isIpmsDeployUrl(url)) {
      res = await fetchScanApi(`v1/web-quality/ipms/session/${id}/validate?${q}`);
    } else if (isPortalLocalBaseUrl(url)) {
      q.set("job_id", id);
      res = await fetchScanApi(`v1/perf-test/session/validate?${q}`);
    } else {
      res = await fetchScanApi(`v1/web-quality/session/${id}/validate?${q}`);
    }
    const j = (await readJsonResponse(res)) as SessionValidateResponse;
    const ok = sessionOk(res, j);
    return {
      ok,
      message: String(j.message || (ok ? "로그인 완료" : "로그인 실패")),
    };
  } catch (e) {
    return { ok: false, message: String((e as Error).message || "로그인 실패") };
  }
}

/** storage_state JSON 업로드 검증 */
export async function validateWqSessionUpload(
  file: File,
  baseUrl: string,
): Promise<{ ok: boolean; message: string }> {
  const url = baseUrl.trim();
  if (!url) return { ok: false, message: "URL이 필요합니다." };
  try {
    const fd = new FormData();
    fd.append("base_url", url);
    fd.append("session_storage", file);
    let res: Response;
    if (isIpmsDeployUrl(url)) {
      res = await postScanMultipart("v1/web-quality/ipms/session/validate", fd);
    } else if (isPortalLocalBaseUrl(url)) {
      res = await postScanMultipart("v1/perf-test/session/validate", fd);
    } else {
      res = await postScanMultipart("v1/web-quality/session/validate", fd);
    }
    const j = (await readJsonResponse(res)) as SessionValidateResponse;
    const ok = sessionOk(res, j);
    return {
      ok,
      message: String(j.message || (ok ? "로그인 완료" : "로그인 실패")),
    };
  } catch (e) {
    return { ok: false, message: String((e as Error).message || "로그인 실패") };
  }
}
