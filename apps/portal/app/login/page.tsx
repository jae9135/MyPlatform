import Link from "next/link";
import { ContactInfo } from "@/components/ContactInfo";
import { PortalNav } from "@/lib/PortalNav";
import { BRAND_NAME } from "@/lib/brand";
import {
  FULL_SESSION_MAX_AGE,
  TRIAL_DAY_MAX_AGE,
  isLoginConfigured,
  safeNextPath,
} from "@/lib/portal-auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const next = safeNextPath(searchParams.next);
  const configured = isLoginConfigured();
  const error = searchParams.error;

  return (
    <main>
      <PortalNav home showLogout={false} />
      <section className="hero">
        <h1>{BRAND_NAME}</h1>
        <p>
          발급받은 암호 또는 액세스 코드를 입력하세요. 종류에 따라 이용 기간이 달라집니다.
        </p>
      </section>

      <ContactInfo compact />

      <section className="panel login-panel">
        {!configured && (
          <p className="msg err">
            서버에 로그인 설정이 없습니다. 환경 암호(<code>PORTAL_PASSWORD</code> 등) 또는 Supabase 발급
            코드(<code>SUPABASE_SERVICE_ROLE_KEY</code>)를 <code>apps/portal/.env.local</code>에
            설정하세요.
          </p>
        )}
        {configured && error === "1" && (
          <p className="msg err">암호 또는 코드가 올바르지 않습니다.</p>
        )}
        {error === "setup" && !configured && (
          <p className="msg err">로그인 설정이 되어 있지 않습니다.</p>
        )}
        {error === "trial_once" && (
          <p className="msg err">
            1회 체험 암호는 이미 사용하셨습니다. 정식 암호·코드를 사용하거나 문의해 주세요.
          </p>
        )}
        {error === "code_exhausted" && (
          <p className="msg err">이 코드는 사용 횟수를 모두 소진했습니다.</p>
        )}
        {error === "code_expired" && (
          <p className="msg err">만료된 코드입니다. 새 코드를 요청해 주세요.</p>
        )}
        {error === "code_revoked" && (
          <p className="msg err">폐기된 코드입니다. 문의해 주세요.</p>
        )}
        {error === "code_use" && (
          <p className="msg err">코드 사용 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
        )}

        <ul className="login-kind-hint">
          <li>
            <b>정식 (30일)</b> — 환경 암호 또는 <code>MP-F-xxxx-xxxx</code> 발급 코드
          </li>
          <li>
            <b>1일 체험</b> — {Math.round(TRIAL_DAY_MAX_AGE / 3600)}시간 · <code>MP-D-…</code> 코드
          </li>
          <li>
            <b>1회 체험</b> — 브라우저당 1회(환경 암호) 또는 1회 코드 <code>MP-O-…</code>
          </li>
        </ul>

        <form className="login-form" method="post" action="/api/login">
          <input type="hidden" name="next" value={next} />
          <label className="login-label">
            암호 / 액세스 코드
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              autoFocus
              disabled={!configured}
            />
          </label>
          <button className="btn" type="submit" disabled={!configured}>
            로그인
          </button>
        </form>
      </section>

      <p style={{ marginTop: 16, fontSize: 14, color: "var(--muted)" }}>
        <Link href="/contact">문의하기</Link>
        {" · "}
        <Link href="/admin/login">관리자</Link>
        {" · "}
        <a href="/">← 공개 데모 홈</a>
      </p>
    </main>
  );
}
