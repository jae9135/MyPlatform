import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export const PORTAL_COOKIE = "mp_portal";
export const TRIAL_COOKIE = "mp_trial";
export const TRIAL_ONCE_FLAG = "mp_trial_once_used";
export const TRIAL_KIND_COOKIE = "mp_trial_kind";
export const CODE_SESSION_COOKIE = "mp_code_session";
export const CODE_KIND_COOKIE = "mp_code_kind";

export type TrialMode = "day" | "once";
export type PortalAuthKind = "full" | "trial-day" | "trial-once" | "code-full" | "code-day" | "code-once" | null;

const TOKEN_PREFIX = "myplatform.portal.v1:";
const FULL_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const TRIAL_DAY_MAX_AGE = 60 * 60 * 24;
const TRIAL_ONCE_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const TRIAL_ONCE_FLAG_MAX_AGE = 60 * 60 * 24 * 365 * 5;

export { FULL_SESSION_MAX_AGE, TRIAL_DAY_MAX_AGE, TRIAL_ONCE_SESSION_MAX_AGE, TRIAL_ONCE_FLAG_MAX_AGE };

export async function tokenFromPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${TOKEN_PREFIX}${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getPortalPassword(): string {
  return process.env.PORTAL_PASSWORD?.trim() ?? "";
}

export function getTrialDayPassword(): string {
  return process.env.TRIAL_DAY_PASSWORD?.trim() ?? "";
}

export function getTrialOncePassword(): string {
  return process.env.TRIAL_ONCE_PASSWORD?.trim() ?? "";
}

export function passwordMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  return input.length === expected.length && timingSafeEqual(input, expected);
}

export function isLoginConfigured(): boolean {
  return Boolean(
    getPortalPassword() ||
      getTrialDayPassword() ||
      getTrialOncePassword() ||
      isSupabaseAdminConfigured(),
  );
}

export function isPortalPasswordConfigured(): boolean {
  return isLoginConfigured();
}

export type LoginKind = "full" | "trial-day" | "trial-once";

export async function resolveLoginPassword(password: string): Promise<LoginKind | null> {
  const full = getPortalPassword();
  if (passwordMatches(password, full)) return "full";

  const day = getTrialDayPassword();
  if (passwordMatches(password, day)) return "trial-day";

  const once = getTrialOncePassword();
  if (passwordMatches(password, once)) return "trial-once";

  return null;
}

export async function codeSessionToken(codeId: string): Promise<string> {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.PORTAL_PASSWORD?.trim() ||
    "myplatform-code-session-dev";
  return tokenFromPassword(`code-session:v1:${codeId}:${secret}`);
}

export function parseCodeSessionCookie(raw: string): { codeId: string; token: string } | null {
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const codeId = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!codeId || !token) return null;
  return { codeId, token };
}

export function buildCodeSessionCookieValue(codeId: string, token: string): string {
  return `${codeId}.${token}`;
}

export function portalKindToSessionMaxAge(kind: "full" | "day" | "once"): number {
  if (kind === "full") return FULL_SESSION_MAX_AGE;
  if (kind === "day") return TRIAL_DAY_MAX_AGE;
  return TRIAL_ONCE_SESSION_MAX_AGE;
}

export function clearPortalAuthCookies(res: { cookies: { set: (name: string, value: string, opts: object) => void } }) {
  const base = cookieBaseOptions();
  res.cookies.set(PORTAL_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(TRIAL_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(TRIAL_KIND_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(CODE_SESSION_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(CODE_KIND_COOKIE, "", { ...base, maxAge: 0 });
}

export function setCodeSessionCookies(
  res: { cookies: { set: (name: string, value: string, opts: object) => void } },
  codeId: string,
  kind: "full" | "day" | "once",
  token: string,
) {
  const base = cookieBaseOptions();
  const maxAge = portalKindToSessionMaxAge(kind);
  res.cookies.set(PORTAL_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(TRIAL_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(TRIAL_KIND_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(CODE_SESSION_COOKIE, buildCodeSessionCookieValue(codeId, token), { ...base, maxAge });
  res.cookies.set(CODE_KIND_COOKIE, kind, { ...base, maxAge });
}

export async function trialTokenForMode(mode: TrialMode): Promise<string | null> {
  const pw = mode === "day" ? getTrialDayPassword() : getTrialOncePassword();
  if (!pw) return null;
  return tokenFromPassword(pw);
}

async function resolveCodeSessionAuth(
  get: (name: string) => { value?: string } | undefined,
): Promise<{ ok: boolean; kind: PortalAuthKind }> {
  const raw = readCookie(get, CODE_SESSION_COOKIE);
  const kindRaw = readCookie(get, CODE_KIND_COOKIE);
  if (!raw || !kindRaw) return { ok: false, kind: null };

  const parsed = parseCodeSessionCookie(raw);
  if (!parsed) return { ok: false, kind: null };

  const expected = await codeSessionToken(parsed.codeId);
  if (!timingSafeEqual(parsed.token, expected)) return { ok: false, kind: null };

  if (kindRaw === "full") return { ok: true, kind: "code-full" };
  if (kindRaw === "day") return { ok: true, kind: "code-day" };
  if (kindRaw === "once") return { ok: true, kind: "code-once" };
  return { ok: false, kind: null };
}

export function readCookie(get: (name: string) => { value?: string } | undefined, name: string): string {
  return get(name)?.value ?? "";
}

export async function resolvePortalAuth(
  get: (name: string) => { value?: string } | undefined,
): Promise<{ ok: boolean; kind: PortalAuthKind }> {
  const password = getPortalPassword();
  if (password) {
    const cookie = readCookie(get, PORTAL_COOKIE);
    const expected = await tokenFromPassword(password);
    if (cookie && timingSafeEqual(cookie, expected)) {
      return { ok: true, kind: "full" };
    }
  }

  const trial = readCookie(get, TRIAL_COOKIE);
  if (trial) {
    const dayToken = await trialTokenForMode("day");
    if (dayToken && timingSafeEqual(trial, dayToken)) {
      return { ok: true, kind: "trial-day" };
    }
    const onceToken = await trialTokenForMode("once");
    if (onceToken && timingSafeEqual(trial, onceToken)) {
      return { ok: true, kind: "trial-once" };
    }
  }

  const codeAuth = await resolveCodeSessionAuth(get);
  if (codeAuth.ok) return codeAuth;

  return { ok: false, kind: null };
}

export async function isPortalAuthed(
  get: (name: string) => { value?: string } | undefined,
): Promise<boolean> {
  return (await resolvePortalAuth(get)).ok;
}

export function cookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/** Only same-origin relative paths. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/workspace";
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/workspace";
  }
  if (path === "/") return "/workspace";
  return path;
}
