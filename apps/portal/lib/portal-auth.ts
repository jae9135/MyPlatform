export const PORTAL_COOKIE = "mp_portal";

const TOKEN_PREFIX = "myplatform.portal.v1:";

export async function tokenFromPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${TOKEN_PREFIX}${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function getPortalPassword(): string {
  return process.env.PORTAL_PASSWORD?.trim() ?? "";
}

export function isPortalPasswordConfigured(): boolean {
  return Boolean(getPortalPassword());
}

/** Only same-origin relative paths. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/";
  }
  return path;
}
