"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import "../../marketing.css";

const TABS = [
  { id: "source", label: "소스코드·보안" },
  { id: "web", label: "웹 품질" },
  { id: "db", label: "DB 표준" },
] as const;

const SAMPLE_ROWS = [
  ["HIGH", "SQL Injection", "UserService.java:128", "PreparedStatement 사용"],
  ["MEDIUM", "PMD", "OrderService.java:74", "불필요한 조건문 정리"],
  ["LOW", "ESLint", "Login.tsx:42", "변수명 개선"],
];

export default function DemoQualityPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("source");
  const [ran, setRan] = useState(false);

  return (
    <MarketingPageShell>
      <h1>품질·보안 진단 데모</h1>
      <p style={{ color: "var(--mkt-text-dim)" }}>
        실제 프로그램의 핵심 흐름을 간단히 재현한 데모입니다. 전체 기능은 베타 프로그램에서
        사용합니다.
      </p>

      <div className="mkt-tabbtns" style={{ marginTop: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`mkt-tabbtn${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mkt-panel">
        <h3 style={{ marginTop: 0 }}>진단 대상 업로드</h3>
        <div
          className="mkt-demo-box"
          style={{
            border: "2px dashed var(--mkt-line-strong)",
            textAlign: "center",
            padding: 40,
            cursor: "pointer",
          }}
          onClick={() => setRan(true)}
          onKeyDown={(e) => e.key === "Enter" && setRan(true)}
          role="button"
          tabIndex={0}
        >
          {tab === "source" && "ZIP 파일을 여기에 놓거나 파일 선택 (데모: 샘플 프로젝트)"}
          {tab === "web" && "진단 URL 입력 (데모: IPMS/외부 URL 시나리오)"}
          {tab === "db" && "테이블정의서 Excel 업로드 (데모: 샘플 xlsx)"}
        </div>
        <button type="button" className="mkt-btn mkt-btn-primary" style={{ marginTop: 16 }} onClick={() => setRan(true)}>
          샘플 진단 실행
        </button>
      </div>

      {ran ? (
        <div className="mkt-panel">
          <h3 style={{ marginTop: 0 }}>진단 결과 (샘플)</h3>
          <div className="mkt-stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
            {[
              ["전체", "23"],
              ["High", "3"],
              ["Medium", "8"],
              ["Low", "12"],
            ].map(([l, n]) => (
              <div key={l} className="mkt-stat" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "var(--mkt-text-dim)" }}>{l}</div>
                <div className="mkt-stat-num" style={{ fontSize: 22 }}>
                  {n}
                </div>
              </div>
            ))}
          </div>
          <table className="mkt-mini-table">
            <thead>
              <tr>
                <th>심각도</th>
                <th>규칙</th>
                <th>파일</th>
                <th>개선안</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map(([sev, rule, file, fix]) => (
                <tr key={file}>
                  <td>{sev}</td>
                  <td>{rule}</td>
                  <td className="mkt-mono">{file}</td>
                  <td>{fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p style={{ marginTop: 24 }}>
        <Link className="mkt-btn" href="/login?next=/apps/source-scan">
          베타 프로그램에서 실행
        </Link>
        <Link className="mkt-btn mkt-btn-ghost" href="/contact?tool=web-quality" style={{ marginLeft: 8 }}>
          문의
        </Link>
      </p>
    </MarketingPageShell>
  );
}
