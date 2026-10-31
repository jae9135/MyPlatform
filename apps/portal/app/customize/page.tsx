import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { BRAND_NAME } from "@/lib/brand";
import { CUSTOMIZE_CARDS, PROCESS_STEPS } from "@/lib/marketingCatalog";
import type { Metadata } from "next";
import "../marketing.css";

export const metadata: Metadata = {
  title: "맞춤 개발 · 운영 구축",
  description:
    "소스코드·웹품질·DB 표준·ERD·성능 진단 도구를 기관·회사 업무에 맞게 커스터마이징하고 운영 환경에 구축합니다.",
  alternates: { canonical: "/customize" },
  openGraph: { url: "/customize" },
};

export default function CustomizePage() {
  return (
    <MarketingPageShell>
      <h1>맞춤 개발 · 운영 구축</h1>
      <p style={{ color: "var(--mkt-text-dim)", maxWidth: 640 }}>
        {BRAND_NAME}의 소스·웹 품질 진단, DB 표준, DBManager, ER Modeler 등을 기반으로 조직별
        양식과 업무 프로세스에 맞춘 커스터마이징을 제공합니다.
      </p>

      <div className="mkt-cards-3" style={{ marginTop: 32 }}>
        {CUSTOMIZE_CARDS.map((c) => (
          <div key={c.title} className="mkt-card-box">
            <h3 style={{ margin: "0 0 8px" }}>{c.title}</h3>
            <p style={{ margin: 0, color: "var(--mkt-text-dim)", fontSize: 14 }}>{c.body}</p>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 48, fontSize: 20 }}>개발 진행 방식</h2>
      <div className="mkt-process">
        {PROCESS_STEPS.map((s, i) => (
          <div key={s} className="mkt-process-step">
            {String(i + 1).padStart(2, "0")}
            <br />
            <b>{s}</b>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 32 }}>
        <Link className="mkt-btn mkt-btn-primary" href="/contact">
          문의하기
        </Link>
      </p>
    </MarketingPageShell>
  );
}
