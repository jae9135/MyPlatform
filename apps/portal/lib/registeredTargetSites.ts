import registry from "../config/registered-target-sites.json";

export type RegisteredSiteMatch = "host" | "host_suffix" | "origin_prefix";

export type RegisteredTargetSiteEntry = {
  id: string;
  label?: string;
  match: RegisteredSiteMatch;
  value: string;
  /** 로컬 개발 전용 (localhost 등) — 배포 사이트에서 열었을 때는 무시 */
  localOnly?: boolean;
};

export const REGISTERED_TARGET_SITE_MESSAGE =
  registry.contact_message ||
  "등록되지 않은 사이트입니다. 접속 URL 등록은 관리자에게 문의하세요.";

export const REGISTERED_TARGET_SITES: RegisteredTargetSiteEntry[] = (
  registry.entries || []
).map((entry: { id: string; label?: string; match: string; value: string; local_only?: boolean }) => ({
  id: entry.id,
  label: entry.label,
  match: entry.match as RegisteredSiteMatch,
  value: entry.value,
  localOnly: Boolean(entry.local_only),
}));

function isLocalPortal(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

function parseHttpUrl(url: string): URL | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

export function isRegisteredTargetUrl(url: string): boolean {
  const u = parseHttpUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  const origin = u.origin.toLowerCase();
  const local = isLocalPortal();
  for (const entry of REGISTERED_TARGET_SITES) {
    if (entry.localOnly && !local) continue;
    const value = (entry.value || "").trim().toLowerCase();
    if (!value) continue;
    if (entry.match === "host" && host === value.replace(/\/+$/, "")) return true;
    if (entry.match === "host_suffix") {
      const suffix = value.startsWith(".") ? value : `.${value}`;
      if (host === suffix.slice(1) || host.endsWith(suffix)) return true;
    }
    if (entry.match === "origin_prefix" && origin.startsWith(value.replace(/\/+$/, ""))) {
      return true;
    }
  }
  return false;
}

/** 등록되지 않은 URL이면 안내 문구, 아니면 null */
export function registeredTargetUrlError(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!parseHttpUrl(trimmed)) return null;
  return isRegisteredTargetUrl(trimmed) ? null : REGISTERED_TARGET_SITE_MESSAGE;
}

/**
 * 이 플랫폼 포털 자신의 주소인지 (포털 자동 로그인·세션 판단용).
 * 지금 열려 있는 사이트 주소 + 등록된 배포 주소(project-auto-platform.vercel.app)만 인정 — *.vercel.app 전체 X.
 */
export function isOwnPortalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (typeof window !== "undefined" && window.location.hostname.toLowerCase() === h) return true;
  return REGISTERED_TARGET_SITES.some((e) => e.id === "portal-vercel" && e.value.toLowerCase() === h);
}
