import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthed, resolveIpmsUnlocked } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 업로드 토큰 유효 시간 (초). API 쪽 UPLOAD_TOKEN_MAX_TTL(1시간) 이하로 유지 */
const UPLOAD_TOKEN_TTL_SEC = 15 * 60;

function upstreamBase(): string {
  const fromEnv =
    process.env.API_UPSTREAM_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "";
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  return isPortalAuthed((name) => req.cookies.get(name));
}

type UploadTokenScope = "std" | "ipms";

/**
 * 단기 업로드 토큰: "<만료epoch초>.<scope>.<HMAC-SHA256(API_ACCESS_KEY, 'upload:v2:<만료>:<scope>')>"
 * scope = ipms 는 IPMS 2차 암호를 통과한 경우에만. apps/api/main.py `_upload_token_scope()` 와 같은 규칙.
 * 마스터 키는 브라우저로 내보내지 않습니다.
 */
function issueUploadToken(
  apiKey: string,
  scope: UploadTokenScope,
): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SEC;
  const sig = createHmac("sha256", apiKey)
    .update(`upload:v2:${expiresAt}:${scope}`)
    .digest("hex");
  return { token: `${expiresAt}.${scope}.${sig}`, expiresAt };
}

/** Large multipart uploads bypass the Vercel 4.5MB proxy limit by calling Render directly. */
export async function GET(req: NextRequest) {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const apiBase = upstreamBase();
  const apiKey = process.env.API_ACCESS_KEY?.trim();
  if (!apiBase || !apiKey) {
    return NextResponse.json(
      {
        detail:
          "Direct API not configured. Set NEXT_PUBLIC_API_BASE_URL and API_ACCESS_KEY on Vercel.",
      },
      { status: 503 },
    );
  }
  const ipms = await resolveIpmsUnlocked((name) => req.cookies.get(name));
  const scope: UploadTokenScope = ipms.unlocked ? "ipms" : "std";
  const { token, expiresAt } = issueUploadToken(apiKey, scope);
  return NextResponse.json(
    { apiBase, uploadToken: token, expiresAt, scope },
    { headers: { "cache-control": "no-store" } },
  );
}
