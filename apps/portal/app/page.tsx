import Link from "next/link";
import { PortalNav } from "@/lib/PortalNav";
import { APPS } from "@/lib/apps";
import { getInfraLinks } from "@/lib/portalInfraLinks";

export default function HomePage() {
  const infraLinks = getInfraLinks();

  return (
    <main>
      <PortalNav home />
      <section className="hero">
        <h1>MyPlatform</h1>
        <p>
          DB 표준 점검 도구  · DBManager · DeliverableManager 등 로컬 도구를 웹/모바일에서
          쓰기 위한 포털입니다. 공통 샘플·표준은 서버(Storage), 사용자 입력과
          결과 파일은 기기에만 둡니다.
        </p>
        <div className="badge-row">
          {infraLinks.map((item) => (
            <a
              key={item.label}
              className="badge badge-link"
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              title={item.href}
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>

      <section className="grid">
        {APPS.map((app) => (
          <article key={app.id} className="card">
            <h2>{app.name}</h2>
            <p>{app.description}</p>
            <div className="meta">
              <span className={`status ${app.status}`}>{app.status}</span>
              {app.status === "planned" ? (
                <button className="btn ghost" type="button" disabled>
                  준비 중
                </button>
              ) : (
                <Link className="btn" href={app.href}>
                  열기
                </Link>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
