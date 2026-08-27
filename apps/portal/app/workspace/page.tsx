import Link from "next/link";
import { cookies } from "next/headers";
import { ContactInfo } from "@/components/ContactInfo";
import { PLATFORM_APPS, STANDALONE_APPS } from "@/lib/apps";
import { BRAND_NAME } from "@/lib/brand";
import { getInfraLinks } from "@/lib/portalInfraLinks";
import { resolvePortalAuth } from "@/lib/portal-auth";
import "./workspace.css";

const CATEGORY_TAG: Record<string, string> = {
  quality: "QUALITY",
  "db-std": "DB · DESIGN",
  pm: "BUSINESS",
};

export default async function WorkspacePage() {
  const infraLinks = getInfraLinks();
  const jar = cookies();
  const auth = await resolvePortalAuth((name) => jar.get(name));

  return (
    <div className="beta-hub">
      {auth.kind === "trial-day" ||
      auth.kind === "trial-once" ||
      auth.kind === "code-day" ||
      auth.kind === "code-once" ? (
        <div className="beta-hub-trial-banner">
          {auth.kind === "trial-day" || auth.kind === "code-day"
            ? "1일 체험 중입니다."
            : "1회 체험 중입니다."}
          {" "}
          만료 후 정식 로그인 또는 <Link href="/contact">문의</Link>해 주세요.
        </div>
      ) : null}
      <header className="beta-hub-header">
        <div className="beta-hub-header-inner">
          <Link className="beta-hub-brand" href="/workspace">
            {BRAND_NAME}
          </Link>
          <div className="beta-hub-header-actions">
            <span>베타 프로그램</span>
            <Link href="/">공개 홈</Link>
            <form action="/api/logout" method="post">
              <button className="beta-hub-logout" type="submit">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="beta-hub-hero">
        <div className="beta-hub-hero-inner">
          <h1>개발·품질·DB 업무를 하나의 플랫폼에서</h1>
          <p>
            베타 프로그램 허브입니다. 각 도구를 직접 실행해 보고, 우리 조직에 맞게
            커스터마이징할 수 있습니다.
          </p>
          {infraLinks.length > 0 ? (
            <div className="beta-hub-badges">
              {infraLinks.map((item) => (
                <a
                  key={item.label}
                  className="beta-hub-badge"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <main className="beta-hub-main">
        <p className="beta-hub-section-title">플랫폼 프로그램 · 8종</p>
        <div className="beta-hub-grid">
          {PLATFORM_APPS.map((app) => (
            <article key={app.id} className="beta-hub-card">
              <span className="beta-hub-tag">{CATEGORY_TAG[app.category] ?? app.category}</span>
              <h2>{app.name}</h2>
              <p>{app.description}</p>
              <div className="beta-hub-card-meta">
                <span className={`beta-hub-status ${app.status}`}>{app.status}</span>
                <div className="beta-hub-card-actions">
                  {app.status === "planned" ? (
                    <button className="beta-hub-btn sub" type="button" disabled>
                      준비 중
                    </button>
                  ) : (
                    <>
                      <Link className="beta-hub-btn" href={app.href}>
                        실행
                      </Link>
                      <Link className="beta-hub-btn sub" href={`/products/${app.id}`}>
                        상세
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {STANDALONE_APPS.length > 0 ? (
          <div className="beta-hub-standalone">
            <p className="beta-hub-section-title">모바일 · 별도</p>
            <div className="beta-hub-grid">
              {STANDALONE_APPS.map((app) => (
                <article key={app.id} className="beta-hub-card">
                  <span className="beta-hub-tag">MOBILE</span>
                  <h2>{app.name}</h2>
                  <p>{app.description}</p>
                  <div className="beta-hub-card-meta">
                    <span className={`beta-hub-status ${app.status}`}>{app.status}</span>
                    <div className="beta-hub-card-actions">
                      <Link className="beta-hub-btn" href={app.href}>
                        실행
                      </Link>
                      <Link className="beta-hub-btn sub" href={`/products/${app.id}`}>
                        상세
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="beta-hub-cta">
          <div>
            <b>우리 회사 업무에 맞게 바꿀 수 있습니다.</b>
            <br />
            <small>양식 변경 · 기능 추가 · DB 연동 · 관리자 기능</small>
          </div>
          <Link className="beta-hub-btn" href="/contact?type=customize">
            커스터마이징 문의
          </Link>
        </div>

        <div className="beta-hub-contact">
          <ContactInfo />
        </div>

        <p className="beta-hub-foot">
          <Link href="/">← 공개 데모 홈</Link>으로 돌아가기
        </p>
      </main>
    </div>
  );
}
