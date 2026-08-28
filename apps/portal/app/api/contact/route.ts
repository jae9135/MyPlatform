import { NextResponse } from "next/server";
import {
  buildContactEmailText,
  markContactEmailed,
  saveContactInquiry,
  sendContactEmail,
  type ContactPayload,
} from "@/lib/contactServer";
import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePayload(body: unknown): ContactPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const company = String(b.company ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const message = String(b.message ?? "").trim();
  if (!company || !phone || !message) return null;
  return {
    company,
    phone,
    tool: String(b.tool ?? "").trim(),
    request_type: String(b.request_type ?? "customize").trim() || "customize",
    message,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "required_fields" }, { status: 400 });
  }

  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSupabase = isSupabaseAdminConfigured();

  if (!hasResend && !hasSupabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "not_configured",
        detail:
          "문의 서버가 설정되지 않았습니다. SUPABASE_SERVICE_ROLE_KEY 또는 RESEND_API_KEY를 포털 env에 추가하세요.",
      },
      { status: 503 },
    );
  }

  let inquiryId: string | null = null;
  let emailed = false;
  let emailWarning: string | null = null;

  try {
    if (hasSupabase) {
      inquiryId = await saveContactInquiry(payload);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "submit_failed", detail: msg }, { status: 500 });
  }

  if (hasResend) {
    try {
      emailed = await sendContactEmail(payload);
      if (inquiryId && emailed) {
        await markContactEmailed(inquiryId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (inquiryId) {
        emailWarning = msg;
      } else {
        return NextResponse.json({ ok: false, error: "submit_failed", detail: msg }, { status: 500 });
      }
    }
  }

  if (emailWarning) {
    return NextResponse.json({
      ok: true,
      saved: true,
      emailed: false,
      warning: true,
      message: "문의가 접수되었습니다. (메일 알림은 발송되지 않았습니다.)",
      detail: emailWarning,
    });
  }

  return NextResponse.json({
    ok: true,
    saved: Boolean(inquiryId),
    emailed,
    message: emailed
      ? "문의가 접수되었습니다. 확인 메일을 발송했습니다."
      : "문의가 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.",
  });
}

/** Smoke test for operators (GET returns config hints only). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    supabase: isSupabaseAdminConfigured(),
    resend: Boolean(process.env.RESEND_API_KEY?.trim()),
    sample_subject: buildContactEmailText({
      company: "테스트",
      phone: "010-0000-0000",
      tool: "web-quality",
      request_type: "customize",
      message: "샘플",
    }).subject,
  });
}
