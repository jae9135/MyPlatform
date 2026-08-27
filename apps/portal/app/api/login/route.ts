import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recordAccessCodeUse, validateAccessCode } from "@/lib/accessCodes";
import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import {
  PORTAL_COOKIE,
  TRIAL_COOKIE,
  TRIAL_KIND_COOKIE,
  TRIAL_ONCE_FLAG,
  TRIAL_ONCE_FLAG_MAX_AGE,
  TRIAL_ONCE_SESSION_MAX_AGE,
  TRIAL_DAY_MAX_AGE,
  FULL_SESSION_MAX_AGE,
  CODE_SESSION_COOKIE,
  CODE_KIND_COOKIE,
  codeSessionToken,
  cookieBaseOptions,
  isLoginConfigured,
  resolveLoginPassword,
  safeNextPath,
  setCodeSessionCookies,
  trialTokenForMode,
  tokenFromPassword,
  getPortalPassword,
} from "@/lib/portal-auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));

  const fail = NextResponse.redirect(
    new URL(
      isLoginConfigured() || isSupabaseAdminConfigured() ? "/login?error=1" : "/login?error=setup",
      req.url,
    ),
    303,
  );

  if (!password) return fail;

  const envKind = await resolveLoginPassword(password);
  if (envKind) {
    return handleEnvLogin(req, password, envKind, next);
  }

  const codeResult = await validateAccessCode(password);
  if (!codeResult.ok) {
    if (codeResult.reason === "exhausted") {
      return NextResponse.redirect(new URL("/login?error=code_exhausted", req.url), 303);
    }
    if (codeResult.reason === "expired") {
      return NextResponse.redirect(new URL("/login?error=code_expired", req.url), 303);
    }
    if (codeResult.reason === "revoked") {
      return NextResponse.redirect(new URL("/login?error=code_revoked", req.url), 303);
    }
    return fail;
  }

  try {
    await recordAccessCodeUse(codeResult.id);
  } catch {
    return NextResponse.redirect(new URL("/login?error=code_use", req.url), 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  const token = await codeSessionToken(codeResult.id);
  setCodeSessionCookies(res, codeResult.id, codeResult.kind, token);
  return res;
}

async function handleEnvLogin(req: Request, password: string, kind: Awaited<ReturnType<typeof resolveLoginPassword>>, next: string) {
  if (kind === "trial-once") {
    const jar = cookies();
    if (jar.get(TRIAL_ONCE_FLAG)?.value === "1") {
      return NextResponse.redirect(new URL("/login?error=trial_once", req.url), 303);
    }
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  const base = cookieBaseOptions();

  if (kind === "full") {
    const token = await tokenFromPassword(getPortalPassword());
    res.cookies.set(PORTAL_COOKIE, token, { ...base, maxAge: FULL_SESSION_MAX_AGE });
    res.cookies.set(TRIAL_COOKIE, "", { ...base, maxAge: 0 });
    res.cookies.set(TRIAL_KIND_COOKIE, "", { ...base, maxAge: 0 });
    res.cookies.set(CODE_SESSION_COOKIE, "", { ...base, maxAge: 0 });
    res.cookies.set(CODE_KIND_COOKIE, "", { ...base, maxAge: 0 });
    return res;
  }

  const mode = kind === "trial-day" ? "day" : "once";
  const trialToken = await trialTokenForMode(mode);
  if (!trialToken) {
    return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  }

  res.cookies.set(PORTAL_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(TRIAL_COOKIE, trialToken, {
    ...base,
    maxAge: mode === "day" ? TRIAL_DAY_MAX_AGE : TRIAL_ONCE_SESSION_MAX_AGE,
  });
  res.cookies.set(TRIAL_KIND_COOKIE, mode, {
    ...base,
    maxAge: mode === "day" ? TRIAL_DAY_MAX_AGE : TRIAL_ONCE_SESSION_MAX_AGE,
  });
  res.cookies.set(CODE_SESSION_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(CODE_KIND_COOKIE, "", { ...base, maxAge: 0 });

  if (mode === "once") {
    res.cookies.set(TRIAL_ONCE_FLAG, "1", { ...base, maxAge: TRIAL_ONCE_FLAG_MAX_AGE });
  }

  return res;
}
