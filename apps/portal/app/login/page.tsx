import { isPortalPasswordConfigured, safeNextPath } from "@/lib/portal-auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const next = safeNextPath(searchParams.next);
  const configured = isPortalPasswordConfigured();
  const error = searchParams.error;

  return (
    <main>
      <section className="hero">
        <h1>MyPlatform</h1>
        <p>포털 암호를 입력하세요. 로그인한 뒤 도구를 사용할 수 있습니다.</p>
      </section>

      <section className="panel login-panel">
        {!configured && (
          <p className="msg err">
            서버에 <code>PORTAL_PASSWORD</code>가 없습니다.{" "}
            <code>apps/portal/.env.local</code>에 설정한 뒤 개발 서버를 다시
            시작하세요.
          </p>
        )}
        {configured && error === "1" && (
          <p className="msg err">암호가 올바르지 않습니다.</p>
        )}
        {error === "setup" && configured && (
          <p className="msg err">암호가 올바르지 않습니다.</p>
        )}

        <form className="login-form" method="post" action="/api/login">
          <input type="hidden" name="next" value={next} />
          <label className="login-label">
            암호
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
    </main>
  );
}
