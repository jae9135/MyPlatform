import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function upstreamBase(): string {
  const fromEnv =
    process.env.API_UPSTREAM_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "";
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const password = process.env.PORTAL_PASSWORD?.trim();
  if (!password) return true;
  return isPortalAuthed((name) => req.cookies.get(name));
}

/** Logged-in clients use this for large multipart uploads (bypass Vercel 4.5MB proxy limit). */
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
      { status: 503 }
    );
  }
  return NextResponse.json({ apiBase, apiKey });
}
