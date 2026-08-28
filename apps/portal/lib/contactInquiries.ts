import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export type ContactInquiryRow = {
  id: string;
  company: string;
  phone: string;
  tool: string | null;
  request_type: string;
  message: string;
  source: string;
  emailed: boolean;
  created_at: string;
};

const TOOL_LABEL: Record<string, string> = {
  "source-scan": "소스코드·보안 진단",
  "web-quality": "웹 품질 진단",
  "chk-db-std": "DB 표준 점검",
  "db-manager": "DBManager",
  "er-modeler": "ER Modeler",
  "deliverable-manager": "DeliverableManager",
  "my-gantt": "MyGantt",
  "receipt-to-pdf": "ReceiptToPDF",
  other: "기타 / 신규",
};

const REQUEST_LABEL: Record<string, string> = {
  customize: "커스터마이징",
  new: "신규 기능",
  quote: "견적 상담",
  standalone: "독립 도구",
};

export function toolLabel(tool: string | null | undefined): string {
  if (!tool) return "—";
  return TOOL_LABEL[tool] ?? tool;
}

export function requestTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return REQUEST_LABEL[value] ?? value;
}

export async function listContactInquiries(limit = 100): Promise<ContactInquiryRow[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("contact_inquiries")
    .select("id, company, phone, tool, request_type, message, source, emailed, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactInquiryRow[];
}
