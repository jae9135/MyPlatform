import { readJsonResponse } from "@/lib/formUpload";
import { fetchScanApi, postScanMultipart } from "@/lib/localScanApi";

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

type SessionValidateResponse = { ok?: boolean; valid?: boolean; message?: string };

function sessionOk(res: Response, j: SessionValidateResponse): boolean {
  if (j.valid !== undefined) return Boolean(res.ok && j.valid);
  return Boolean(res.ok && j.ok);
}

/** 브라우저 job 세션 검증 — IPMS / 포털 / 외부 URL 자동 분기 */
export async function validateWqSessionJob(jobId: string, baseUrl: string): Promise<boolean> {
  const id = jobId.trim();
  const url = baseUrl.trim();
  if (!id || !url) return false;
  try {
    const q = new URLSearchParams({ base_url: url });
    if (isIpmsDeployUrl(url)) {
      const res = await fetchScanApi(`v1/web-quality/ipms/session/${id}/validate?${q}`);
      const j = (await readJsonResponse(res)) as SessionValidateResponse;
      return sessionOk(res, j);
    }
    if (isPortalLocalBaseUrl(url)) {
      q.set("job_id", id);
      const res = await fetchScanApi(`v1/perf-test/session/validate?${q}`);
      const j = (await readJsonResponse(res)) as SessionValidateResponse;
      return sessionOk(res, j);
    }
    const res = await fetchScanApi(`v1/web-quality/session/${id}/validate?${q}`);
    const j = (await readJsonResponse(res)) as SessionValidateResponse;
    return sessionOk(res, j);
  } catch {
    return false;
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
