import { NextRequest, NextResponse } from "next/server";
import {
  PORTAL_COOKIE,
  getPortalPassword,
  timingSafeEqual,
  tokenFromPassword,
} from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function upstreamBase(): string {
  return (
    process.env.API_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000"
  );
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const password = getPortalPassword();
  if (!password) return true;
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? "";
  const expected = await tokenFromPassword(password);
  return Boolean(cookie && timingSafeEqual(cookie, expected));
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

  const res = await fetch(target, init);
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
