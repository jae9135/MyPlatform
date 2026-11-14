import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";
import { BlogWorkspace } from "@/components/admin/BlogWorkspace";
import "../admin.css";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const jar = cookies();
  if (!(await isAdminAuthed((name) => jar.get(name)))) {
    redirect("/admin/login");
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <Link className="admin-topbar-brand" href="/admin">MyPlatform · 관리자</Link>
          <div className="admin-topbar-actions">
            <Link className="btn ghost" href="/admin">관리자 홈</Link>
            <form action="/api/admin/logout" method="post">
              <button className="btn ghost" type="submit">로그아웃</button>
            </form>
          </div>
        </div>
      </header>
      <main className="admin-main admin-blog-main">
        <BlogWorkspace />
        <p style={{ marginTop: 24 }}><Link href="/admin">← 관리자 홈</Link></p>
      </main>
    </div>
  );
}
