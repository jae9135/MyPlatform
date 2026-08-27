"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import "../../marketing.css";

const STEPS = [
  { id: "design", icon: "📊", title: "설계서", sub: "Excel 업로드" },
  { id: "chk", icon: "✓", title: "DB 표준 점검", sub: "word · term · domain" },
  { id: "er", icon: "◇", title: "ER Modeler", sub: "ERD 편집" },
  { id: "dbm", icon: "▣", title: "DBManager", sub: "DDL · DB 적용" },
] as const;

const DESC: Record<string, string> = {
  design: "테이블정의서 Excel을 업로드합니다.",
  chk: "공통표준단어·용어·도메인·코드와 설계서를 비교합니다.",
  er: "Excel 또는 SQL을 ERD로 가져와 시각적으로 편집합니다.",
  dbm: "설계서에서 PostgreSQL DDL을 생성하고 DB와 동기화합니다.",
};

export default function DemoDbWorkflowPage() {
  const [active, setActive] = useState<string>("");

  return (
    <MarketingPageShell>
      <h1>설계서에서 DB까지 한 번에</h1>
      <p style={{ color: "var(--mkt-text-dim)", textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
        DBManager · DB 표준 점검 · ER Modeler의 연결 구조를 보여주는 데모입니다.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          margin: "48px 0",
        }}
      >
        {STEPS.map((s, i) => (
          <span key={s.id} style={{ display: "contents" }}>
            <button
              type="button"
              className="mkt-card-box"
              style={{ width: 180, cursor: "pointer", textAlign: "center", border: active === s.id ? "1px solid var(--mkt-cyan)" : undefined }}
              onClick={() => setActive(s.id)}
            >
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <strong style={{ display: "block", margin: "12px 0 4px" }}>{s.title}</strong>
              <span style={{ fontSize: 12, color: "var(--mkt-text-dim)" }}>{s.sub}</span>
            </button>
            {i < STEPS.length - 1 ? (
              <span style={{ fontSize: 24, color: "var(--mkt-text-dimmer)" }}>→</span>
            ) : null}
          </span>
        ))}
      </div>

      <div className="mkt-panel" style={{ background: "#101828", color: "#fff" }}>
        <h2 style={{ marginTop: 0 }}>{active ? STEPS.find((s) => s.id === active)?.title : "단계를 클릭해 보세요"}</h2>
        <p style={{ color: "var(--mkt-text-dim)" }}>
          {active ? DESC[active] : "각 도구가 어떻게 연결되는지 데모로 확인할 수 있습니다."}
        </p>
        <Link className="mkt-btn mkt-btn-primary" href="/contact?tool=db-manager&interest=db-workflow">
          이 업무를 우리 회사에 적용하기
        </Link>
      </div>

      <p style={{ marginTop: 24, textAlign: "center" }}>
        <Link className="mkt-btn mkt-btn-ghost" href="/products/chk-db-std">
          DB 표준 점검 상세
        </Link>
        <Link className="mkt-btn mkt-btn-ghost" href="/products/db-manager" style={{ marginLeft: 8 }}>
          DBManager 상세
        </Link>
      </p>
    </MarketingPageShell>
  );
}
