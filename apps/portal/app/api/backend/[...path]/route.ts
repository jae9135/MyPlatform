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

async function isAuthed(req: NextRequest): Promise<boolean> {
  const password = process.env.PORTAL_PASSWORD?.trim();
  if (!password) return true;
  return isPortalAuthed((name) => req.cookies.get(name));
}

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
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
  const apiKey = process.env.API_ACCESS_KEY?.trim();
  if (apiKey) headers.set("x-api-key", apiKey);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetch(target, init);
  } catch (e) {
    const cause =
      e instanceof Error && "cause" in e ? (e as Error & { cause?: unknown }).cause : e;
    const refused =
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      (cause as { code?: string }).code === "ECONNREFUSED";
    const detail = refused
      ? `API 서버에 연결할 수 없습니다 (${upstreamBase()}). 터미널에서 API를 실행했는지 확인하세요.`
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
