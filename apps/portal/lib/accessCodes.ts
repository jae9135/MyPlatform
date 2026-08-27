import { tokenFromPassword } from "@/lib/portal-auth";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export type AccessCodeKind = "full" | "day" | "once";

export type AccessCodeRow = {
  id: string;
  code_hash: string;
  kind: AccessCodeKind;
  label: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
};

export type ValidateCodeResult =
  | { ok: true; id: string; kind: AccessCodeKind }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "exhausted" | "unconfigured" };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function hashAccessCode(plain: string): Promise<string> {
  return tokenFromPassword(`access-code:v1:${plain}`);
}

export function generatePlainCode(kind: AccessCodeKind): string {
  const prefix = kind === "full" ? "F" : kind === "day" ? "D" : "O";
  let body = "";
  for (let i = 0; i < 8; i += 1) {
    body += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `MP-${prefix}-${body.slice(0, 4)}-${body.slice(4)}`;
}

function defaultMaxUses(kind: AccessCodeKind): number | null {
  if (kind === "once") return 1;
  return null;
}

export async function createAccessCode(input: {
  kind: AccessCodeKind;
  label?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
}): Promise<{ row: AccessCodeRow; plainCode: string }> {
  const sb = getSupabaseAdmin();
  const plainCode = generatePlainCode(input.kind);
  const code_hash = await hashAccessCode(plainCode);
  const max_uses = input.maxUses !== undefined ? input.maxUses : defaultMaxUses(input.kind);

  const { data, error } = await sb
    .from("portal_access_codes")
    .insert({
      code_hash,
      kind: input.kind,
      label: input.label?.trim() ?? "",
      max_uses,
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "access code insert failed");
  }

  return { row: data as AccessCodeRow, plainCode };
}

export async function listAccessCodes(limit = 100): Promise<AccessCodeRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("portal_access_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as AccessCodeRow[];
}

export async function revokeAccessCode(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("portal_access_codes")
    .update({ revoked: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function validateAccessCode(plain: string): Promise<ValidateCodeResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, reason: "unconfigured" };
  }

  const code_hash = await hashAccessCode(plain);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("portal_access_codes")
    .select("id, kind, max_uses, use_count, expires_at, revoked")
    .eq("code_hash", code_hash)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: "not_found" };
  }

  if (data.revoked) return { ok: false, reason: "revoked" };

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (data.max_uses != null && data.use_count >= data.max_uses) {
    return { ok: false, reason: "exhausted" };
  }

  return { ok: true, id: data.id, kind: data.kind as AccessCodeKind };
}

export async function recordAccessCodeUse(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data, error: fetchError } = await sb
    .from("portal_access_codes")
    .select("use_count")
    .eq("id", id)
    .single();

  if (fetchError || !data) {
    throw new Error(fetchError?.message ?? "code not found");
  }

  const { error } = await sb
    .from("portal_access_codes")
    .update({
      use_count: (data.use_count as number) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export function kindLabel(kind: AccessCodeKind): string {
  if (kind === "full") return "30일 (정식)";
  if (kind === "day") return "1일";
  return "1회";
}
