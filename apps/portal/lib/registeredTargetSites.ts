import registry from "../../../config/registered-target-sites.json";

export type RegisteredSiteMatch = "host" | "host_suffix" | "origin_prefix";

export type RegisteredTargetSiteEntry = {
  id: string;
  label?: string;
  match: RegisteredSiteMatch;
  value: string;
};

export const REGISTERED_TARGET_SITE_MESSAGE =
  registry.contact_message ||
  "등록되지 않은 사이트입니다. 접속 URL 등록은 관리자에게 문의하세요.";

export const REGISTERED_TARGET_SITES: RegisteredTargetSiteEntry[] = registry.entries || [];

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
  for (const entry of REGISTERED_TARGET_SITES) {
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
