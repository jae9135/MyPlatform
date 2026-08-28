import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function upstreamBase(): string {
  const fromEnv =
    process.env.API_UPSTREAM_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:8001";
}

async function portalAuthed(req: NextRequest): Promise<boolean> {
  const password = process.env.PORTAL_PASSWORD?.trim();
  if (!password) return true;
  return isPortalAuthed((name) => req.cookies.get(name));
}

function upstreamHeaders(): HeadersInit {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = process.env.API_ACCESS_KEY?.trim();
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

/** 브라우저 → 포털 서버 → 로컬 API /health (API_ACCESS_KEY·프록시 이슈 우회) */
export async function GET(req: NextRequest) {
  if (!(await portalAuthed(req))) {
    return NextResponse.json(
      { detail: "포털 로그인이 필요합니다. /login 에서 다시 로그인하세요." },
      { status: 401 },
    );
  }

  const base = upstreamBase();
  try {
    const res = await fetch(`${base}/health`, {
      headers: upstreamHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text;
      try {
        const j = JSON.parse(text) as { detail?: string };
        if (j.detail) detail = j.detail;
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        {
          detail:
            detail ||
            `API health HTTP ${res.status} — ${base} 실행 및 API_ACCESS_KEY(포털·API 동일) 확인`,
        },
        { status: 502 },
      );
    }
    const health = (await res.json()) as { perf_test?: Record<string, unknown> };
    const perf = health.perf_test;
    if (!perf || typeof perf !== "object") {
      return NextResponse.json({ detail: "API health 응답에 perf_test 없음" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...perf });
  } catch {
    return NextResponse.json(
      {
        detail: `API 서버에 연결할 수 없습니다 (${base}). .\\scripts\\start-api-source-scan.ps1 실행 후 「환경 다시 확인」.`,
      },
      { status: 503 },
    );
  }
}
