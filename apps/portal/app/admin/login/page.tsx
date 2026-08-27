import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminAuthed, isAdminConfigured } from "@/lib/admin-auth";
import "../admin.css";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const jar = cookies();
  if (await isAdminAuthed((name) => jar.get(name))) {
    redirect("/admin");
  }

  const configured = isAdminConfigured();
  const error = searchParams.error;

  return (
    <main className="admin-main">
      <section className="admin-panel" style={{ maxWidth: 420 }}>
        <h1>관리자 로그인</h1>
        <p className="admin-hint">액세스 코드 발급·폐기 페이지입니다.</p>

        {!configured && (
          <p className="msg err">
            <code>ADMIN_PASSWORD</code> (또는 <code>PORTAL_PASSWORD</code>)를 설정하세요.
          </p>
        )}
        {configured && error === "1" && <p className="msg err">암호가 올바르지 않습니다.</p>}

        <form className="admin-form" method="post" action="/api/admin/login">
          <label>
            관리자 암호
            <input type="password" name="password" required autoFocus disabled={!configured} />
          </label>
          <button className="btn" type="submit" disabled={!configured}>
            로그인
          </button>
        </form>

        <p style={{ marginTop: 16 }}>
          <Link href="/">← 공개 홈</Link>
        </p>
      </section>
    </main>
  );
}
