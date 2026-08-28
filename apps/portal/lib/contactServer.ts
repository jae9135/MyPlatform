import { CONTACT_EMAIL } from "@/lib/marketingCatalog";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export type ContactPayload = {
  company: string;
  phone: string;
  tool: string;
  request_type: string;
  message: string;
};

function inboundEmail(): string {
  return (
    process.env.CONTACT_INBOUND_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    CONTACT_EMAIL
  );
}

function formatToolLabel(tool: string): string {
  const map: Record<string, string> = {
    "source-scan": "소스코드·보안 진단",
    "web-quality": "웹 품질 진단",
    "chk-db-std": "DB 표준 점검",
    "db-manager": "DBManager",
    "er-modeler": "ER Modeler",
    "deliverable-manager": "DeliverableManager",
    "my-gantt": "MyGantt",
    "receipt-to-pdf": "ReceiptToPDF",
    other: "기타 / 신규 개발",
  };
  return map[tool] || tool || "(미선택)";
}

function formatRequestType(value: string): string {
  const map: Record<string, string> = {
    customize: "커스터마이징",
    new: "신규 기능 개발",
    quote: "견적 상담",
    standalone: "독립 도구",
  };
  return map[value] || value;
}

export function buildContactEmailText(payload: ContactPayload): { subject: string; text: string; html: string } {
  const subject = `[${formatRequestType(payload.request_type)}] ${payload.company}`;
  const text = [
    `회사/이름: ${payload.company}`,
    `연락처: ${payload.phone}`,
    `관심 프로그램: ${formatToolLabel(payload.tool)}`,
    `요청 유형: ${formatRequestType(payload.request_type)}`,
    "",
    payload.message,
  ].join("\n");
  const html = `
    <h2>MyPlatform 문의</h2>
    <p><b>회사/이름:</b> ${escapeHtml(payload.company)}</p>
    <p><b>연락처:</b> ${escapeHtml(payload.phone)}</p>
    <p><b>관심 프로그램:</b> ${escapeHtml(formatToolLabel(payload.tool))}</p>
    <p><b>요청 유형:</b> ${escapeHtml(formatRequestType(payload.request_type))}</p>
    <hr/>
    <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(payload.message)}</pre>
  `;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function saveContactInquiry(payload: ContactPayload): Promise<string | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("contact_inquiries")
    .insert({
      company: payload.company,
      phone: payload.phone,
      tool: payload.tool || null,
      request_type: payload.request_type,
      message: payload.message,
      source: "portal",
      emailed: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

export async function markContactEmailed(id: string): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const sb = getSupabaseAdmin();
  await sb.from("contact_inquiries").update({ emailed: true }).eq("id", id);
}

export function isResendTestFrom(from: string): boolean {
  return from.includes("@resend.dev");
}

export function parseResendError(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { message?: string };
    const msg = j.message ?? "";
    if (status === 403 && /testing emails|verify a domain/i.test(msg)) {
      return (
        "Resend 테스트 모드: onboarding@resend.dev 발신은 Resend 가입 이메일로만 수신 가능합니다. " +
        "CONTACT_INBOUND_EMAIL을 Resend 가입 주소와 맞추거나, Resend에서 도메인 인증 후 RESEND_FROM_EMAIL을 설정하세요."
      );
    }
    if (msg) return `메일 발송 실패: ${msg}`;
  } catch {
    /* ignore */
  }
  return `메일 발송 실패 (HTTP ${status})${body ? `: ${body.slice(0, 200)}` : ""}`;
}

export async function sendContactEmail(payload: ContactPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    "MyPlatform <onboarding@resend.dev>";
  const to = inboundEmail();
  const { subject, text, html } = buildContactEmailText(payload);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: payload.phone.includes("@") ? payload.phone : undefined,
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(parseResendError(res.status, body));
  }
  return true;
}
