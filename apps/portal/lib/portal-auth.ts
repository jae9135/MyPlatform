export const PORTAL_COOKIE = "mp_portal";
export const IPMS_UNLOCK_COOKIE = "mp_ipms_unlock";

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

export function passwordMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  return input.length === expected.length && timingSafeEqual(input, expected);
}

export function getPortalPassword(): string {
  return process.env.PORTAL_PASSWORD?.trim() ?? "";
}

export function getIpmsUnlockPassword(): string {
  return process.env.IPMS_UNLOCK_PASSWORD?.trim() ?? "";
}

export function isPortalPasswordConfigured(): boolean {
  return Boolean(getPortalPassword());
}

export function cookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function isPortalAuthedFromCookies(
  get: (name: string) => { value?: string } | undefined,
): Promise<boolean> {
  const password = getPortalPassword();
  if (!password) return false;
  const cookie = get(PORTAL_COOKIE)?.value ?? "";
  if (!cookie) return false;
  const expected = await tokenFromPassword(password);
  return timingSafeEqual(cookie, expected);
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
