/**
 * IPMS 대상 요청 판별 — 포털 프록시(/api/backend)에서 2차 암호 통과 여부를 서버 측으로 확인할 때 사용.
 * apps/api/main.py `_is_ipms_request()` 와 같은 규칙:
 *   - 경로에 /ipms/ 포함 (IPMS 세션 등)
 *   - target = ipms-online, mode = ipms-*, detect = ipms
 *   - base_url / page_url 에 ipms.online 포함 (외부 URL 탭으로 우회 방지)
 */

const IPMS_FIELDS = ["target", "mode", "detect", "base_url", "page_url"] as const;

function valueIsIpms(field: string, raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return false;
  if (field === "target") return v === "ipms-online";
  if (field === "mode") return v.startsWith("ipms");
  if (field === "detect") return v === "ipms";
  return v.includes("ipms.online");
}

function recordIsIpms(get: (k: string) => string | null | undefined): boolean {
  return IPMS_FIELDS.some((f) => valueIsIpms(f, String(get(f) ?? "")));
}

export async function isIpmsApiRequest(
  path: string,
  search: URLSearchParams,
  contentType: string,
  body: ArrayBuffer | null,
): Promise<boolean> {
  if (/(^|\/)ipms(\/|$)/i.test(path)) return true;
  if (recordIsIpms((k) => search.get(k))) return true;
  if (!body || body.byteLength === 0) return false;

  const ct = contentType.toLowerCase();
  try {
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const fd = await new Response(body, { headers: { "content-type": contentType } }).formData();
      return recordIsIpms((k) => {
        const v = fd.get(k);
        return typeof v === "string" ? v : null;
      });
    }
    if (ct.includes("application/json")) {
      const j = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
      if (j && typeof j === "object") {
        return recordIsIpms((k) => (typeof j[k] === "string" ? (j[k] as string) : null));
      }
    }
  } catch {
    /* 본문 해석 실패 → 일반 요청으로 처리 (API 쪽 검사가 한 번 더 있음) */
  }
  return false;
}

export const IPMS_LOCKED_DETAIL =
  "IPMS 진단은 2차 암호 확인이 필요합니다. 화면에서 IPMS 메뉴를 눌러 암호를 입력하세요.";
