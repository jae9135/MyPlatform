import { tokenFromPassword, timingSafeEqual } from "@/lib/portal-auth";

export const ADMIN_COOKIE = "mp_admin";

const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

export { ADMIN_SESSION_MAX_AGE };

export function getAdminPassword(): string {
  return (
    process.env.ADMIN_PASSWORD?.trim() ||
    process.env.PORTAL_PASSWORD?.trim() ||
    ""
  );
}

export function isAdminConfigured(): boolean {
  return Boolean(getAdminPassword());
}

export async function adminToken(): Promise<string> {
  return tokenFromPassword(`admin:v1:${getAdminPassword()}`);
}

export async function isAdminAuthed(
  get: (name: string) => { value?: string } | undefined,
): Promise<boolean> {
  const expected = getAdminPassword();
  if (!expected) return false;
  const cookie = get(ADMIN_COOKIE)?.value ?? "";
  if (!cookie) return false;
  const token = await adminToken();
  return timingSafeEqual(cookie, token);
}

export function adminCookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
