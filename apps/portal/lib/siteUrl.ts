/**
 * Canonical public site URL (sitemap · robots · OG · canonical 링크).
 *
 * 우선순위: NEXT_PUBLIC_PORTAL_URL(자체 도메인) → Vercel 운영 도메인 → 배포별 주소 → localhost
 * 자체 도메인을 연결하면 NEXT_PUBLIC_PORTAL_URL 을 그 주소로 설정하세요.
 */
export function getSiteUrl(): string {
  const portal = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (portal) return portal.replace(/\/$/, "");

  // Vercel 시스템 변수 — 미리보기 배포에서도 운영 도메인을 가리킴
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

/**
 * 검색엔진 색인 허용 여부 — Vercel 미리보기(Preview) 배포는 색인 금지.
 * Vercel 밖(로컬·기타 호스팅)에서는 허용.
 */
export function isIndexableDeployment(): boolean {
  if (process.env.VERCEL) return process.env.VERCEL_ENV === "production";
  return true;
}

/** 사이트 기준 절대 URL */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p === "/" ? `${getSiteUrl()}/` : `${getSiteUrl()}${p}`;
}
