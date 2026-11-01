/**
 * 관리자 알림 — 게시판 새 글·댓글 등. 서버 전용.
 *
 * 1) 메일 (Resend, 무료 월 3,000통·하루 100통) — 문의 메일과 같은 설정을 씁니다.
 *    RESEND_API_KEY, RESEND_FROM_EMAIL, 받는 주소: BOARD_NOTIFY_EMAIL → CONTACT_INBOUND_EMAIL → NEXT_PUBLIC_CONTACT_EMAIL
 * 2) 텔레그램 (선택, 무료) — TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID 를 넣으면 휴대폰 푸시도 함께 보냅니다.
 *
 * 알림이 실패해도 글·댓글 등록은 그대로 성공해야 하므로 예외를 밖으로 던지지 않습니다.
 * BOARD_NOTIFY=off 로 끌 수 있습니다.
 */
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL } from "@/lib/marketingCatalog";

export type AdminNotice = {
  /** 메일 제목 (앞에 [브랜드] 가 붙음) */
  subject: string;
  /** 본문 줄들 — 메일·텔레그램 공통 */
  lines: string[];
  /** 바로가기 링크 (관리 화면 등) */
  links?: { label: string; url: string }[];
};

const TIMEOUT_MS = 5000;

function notifyEnabled(): boolean {
  return (process.env.BOARD_NOTIFY ?? "").trim().toLowerCase() !== "off";
}

function adminEmail(): string {
  return (
    process.env.BOARD_NOTIFY_EMAIL?.trim() ||
    process.env.CONTACT_INBOUND_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    CONTACT_EMAIL
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendMail(n: AdminNotice): Promise<"sent" | "skipped"> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return "skipped";
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    `${BRAND_NAME} <onboarding@resend.dev>`;
  const subject = `[${BRAND_NAME}] ${n.subject}`;
  const text = [...n.lines, "", ...(n.links ?? []).map((l) => `${l.label}: ${l.url}`)].join("\n");
  const html = `
    <div style="font-family:sans-serif;line-height:1.6">
      ${n.lines.map((l) => (l ? `<p style="margin:0 0 6px;white-space:pre-wrap">${escapeHtml(l)}</p>` : "<br/>")).join("")}
      ${(n.links ?? [])
        .map((l) => `<p style="margin:12px 0 0"><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></p>`)
        .join("")}
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [adminEmail()], subject, text, html }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return "sent";
}

async function sendTelegram(n: AdminNotice): Promise<"sent" | "skipped"> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return "skipped";
  const text = [`[${BRAND_NAME}] ${n.subject}`, ...n.lines, ...(n.links ?? []).map((l) => `${l.label}: ${l.url}`)]
    .join("\n")
    .slice(0, 3900);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}`);
  return "sent";
}

/** 관리자에게 알림. 실패는 로그만 남기고 삼킴. */
export async function notifyAdmin(n: AdminNotice): Promise<void> {
  if (!notifyEnabled()) return;
  const results = await Promise.allSettled([sendMail(n), sendTelegram(n)]);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[notify] 관리자 알림 실패:", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
}

/** 본문 미리보기 — 알림에 전문을 다 넣지 않음 */
export function previewText(s: string, max = 300): string {
  const t = s.replace(/\s+\n/g, "\n").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
