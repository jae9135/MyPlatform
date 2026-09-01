import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthed } from "@/lib/portal-auth";
import { checkUpstreamConfig, upstreamBase, upstreamHeaders } from "@/lib/upstreamApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAuthed(req: NextRequest): Promise<boolean> {
  const password = process.env.PORTAL_PASSWORD?.trim();
  if (!password) return true;
  return isPortalAuthed((name) => req.cookies.get(name));
}

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const configErr = checkUpstreamConfig();
  if (configErr) {
    return NextResponse.json(
      { detail: configErr.detail, missing: configErr.missing },
      { status: configErr.status },
    );
  }

  const target = `${upstreamBase()}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  const pass = [
    "content-type",
    "accept",
    "authorization",
  ];
  for (const name of pass) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  for (const [k, v] of Object.entries(upstreamHeaders())) {
    if (typeof v === "string") headers.set(k, v);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let res: Response;
  const isReadOnly = req.method === "GET" || req.method === "HEAD";
  const upstreamTimeoutMs = isReadOnly ? 20_000 : 120_000;
  try {
    res = await fetch(target, {
      ...init,
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
  } catch (e) {
    const cause =
      e instanceof Error && "cause" in e ? (e as Error & { cause?: unknown }).cause : e;
    const refused =
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      (cause as { code?: string }).code === "ECONNREFUSED";
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    const detail = refused
      ? `API 서버에 연결할 수 없습니다 (${upstreamBase()}). 터미널에서 API를 실행했는지 확인하세요.`
      : timedOut
        ? `API 응답 시간 초과 (${upstreamBase()}). API 실행·포트(${upstreamBase()})를 확인하세요.`
        : "API 요청에 실패했습니다.";
    return NextResponse.json({ detail }, { status: 503 });
  }
  const outHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control"]) {
    const v = res.headers.get(name);
    if (v) outHeaders.set(name, v);
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: outHeaders,
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path ?? []);
}

export async function POST(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path ?? []);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  return proxy(req, ctx.params.path ?? []);
}
