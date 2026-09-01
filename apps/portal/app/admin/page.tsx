import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccessCodeAdmin } from "@/components/admin/AccessCodeAdmin";
import { ContactInquiriesAdmin } from "@/components/admin/ContactInquiriesAdmin";
import { VisitStatsAdmin } from "@/components/admin/VisitStatsAdmin";
import { isAdminAuthed, isAdminConfigured } from "@/lib/admin-auth";
import { isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import "./admin.css";

export default async function AdminPage() {
  const jar = cookies();
  if (!(await isAdminAuthed((name) => jar.get(name)))) {
    redirect("/admin/login");
  }

  const adminOk = isAdminConfigured();
  const supabaseOk = isSupabaseAdminConfigured();

  return (
    <main className="admin-main">
      <header className="admin-header">
        <div>
          <h1>포털 관리</h1>
          <p className="admin-hint">액세스 코드 · 문의 · 홈 방문 통계</p>
        </div>
        <form action="/api/admin/logout" method="post">
          <button className="btn ghost" type="submit">
            관리자 로그아웃
          </button>
        </form>
      </header>

      {!adminOk ? (
        <p className="msg err">
          <code>ADMIN_PASSWORD</code> 또는 <code>PORTAL_PASSWORD</code>를 설정하세요.
        </p>
      ) : null}

      {!supabaseOk ? (
        <p className="msg err">
          Supabase service role가 필요합니다. <code>SUPABASE_SERVICE_ROLE_KEY</code>와 마이그레이션(
          <code>contact_inquiries</code>, <code>portal_visit_daily</code>, <code>portal_visit_log</code>)을 적용하세요.
        </p>
      ) : null}

      {adminOk && supabaseOk ? (
        <>
          <VisitStatsAdmin />
          <ContactInquiriesAdmin />
          <AccessCodeAdmin />
        </>
      ) : null}

      <p style={{ marginTop: 24 }}>
        <Link href="/">← 공개 홈</Link>
      </p>
    </main>
  );
}
