/**
 * 포털 접근 모드 스위치.
 *
 * - NEXT_PUBLIC_PORTAL_AUTH_REQUIRED 미설정/false → 공개 모드 (로그인 없이 모든 도구 사용)
 * - NEXT_PUBLIC_PORTAL_AUTH_REQUIRED=true        → 기존처럼 /login 암호·코드 필요
 *
 * 공개 모드에서도 /admin(관리자)과 IPMS 진단(정식 로그인 + 2차 암호)은 계속 보호됩니다.
 * NEXT_PUBLIC_ 값은 빌드 시점에 반영되므로, 바꾼 뒤에는 dev 서버 재시작 / Vercel 재배포가 필요합니다.
 */
export function isPortalAuthRequired(): boolean {
  const v = (process.env.NEXT_PUBLIC_PORTAL_AUTH_REQUIRED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/** "베타 프로그램" 진입 링크 — 공개 모드면 바로 이동, 보호 모드면 /login 경유 */
export function betaEntryHref(next?: string): string {
  if (isPortalAuthRequired()) {
    return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  }
  return next || "/workspace";
}
