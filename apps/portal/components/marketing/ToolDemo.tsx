"use client";

import { useState } from "react";
import type { MarketingTool } from "@/lib/marketingCatalog";

const SCAN_ROWS = [
  { sev: "high", file: "auth.py:44", msg: "하드코딩된 자격증명 의심" },
  { sev: "high", file: "Query.java:210", msg: "SQL Injection 가능성" },
  { sev: "med", file: "upload.ts:12", msg: "입력값 검증 누락" },
  { sev: "low", file: "utils.py:88", msg: "사용되지 않는 import" },
];

const STD_DICT: Record<string, { type: string; en: string }> = {
  고객명: { type: "exact", en: "CUST_NM" },
  주문일자: { type: "exact", en: "ORD_YMD" },
  상세주소: { type: "composed", en: "DETAIL_ADDR" },
  전화번호: { type: "exact", en: "TELNO" },
};

const DDL_TABS = [
  { id: "1", label: "DDL 생성" },
  { id: "2", label: "DB 적용" },
  { id: "3", label: "역동기화" },
];

const DDL_SNIPPETS: Record<string, string> = {
  "1": "CREATE TABLE customer (\n  cust_id varchar(20) PRIMARY KEY,\n  cust_nm varchar(100) NOT NULL\n);",
  "2": "STEP 1 테이블 생성 ··· 4/4 완료\nSTEP 2 샘플 데이터 ·· 4/4 완료",
  "3": "DB 스키마 → design-export.xlsx 병합 완료",
};

export function ToolDemo({ demoType }: { demoType: MarketingTool["demoType"] }) {
  const [scanFilter, setScanFilter] = useState("all");
  const [ddlTab, setDdlTab] = useState("1");
  const [stdLines, setStdLines] = useState("고객명\n주문일자\n상세주소");
  const [stdResult, setStdResult] = useState<{ kr: string; en: string; cls: string }[]>(() =>
    runStd("고객명\n주문일자\n상세주소"),
  );
  const [deliv, setDeliv] = useState([
    { name: "착수보고서", state: "done" as const },
    { name: "요구사항정의서", state: "wip" as const },
    { name: "테이블정의서", state: "none" as const },
  ]);

  if (demoType === "scan-filter") {
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — 결함 탭 필터</div>
        <div className="mkt-tabbtns">
          {[
            ["all", "전체 4"],
            ["high", "심각도 ↑ 2"],
            ["med", "中 1"],
            ["low", "↓ 1"],
          ].map(([f, label]) => (
            <button
              key={f}
              type="button"
              className={`mkt-tabbtn${scanFilter === f ? " active" : ""}`}
              onClick={() => setScanFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>
        <table className="mkt-mini-table">
          <thead>
            <tr>
              <th>심각도</th>
              <th>파일</th>
              <th>메시지</th>
            </tr>
          </thead>
          <tbody>
            {SCAN_ROWS.filter((r) => scanFilter === "all" || r.sev === scanFilter).map((r) => (
              <tr key={r.file}>
                <td>
                  <span className={`mkt-sev mkt-sev-${r.sev === "med" ? "med" : r.sev}`}>
                    {r.sev.toUpperCase()}
                  </span>
                </td>
                <td className="mkt-mono">{r.file}</td>
                <td>{r.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (demoType === "wq-bars") {
    const bars = [
      { label: "웹표준", pct: 90, color: "var(--mkt-green)" },
      { label: "웹호환성", pct: 78, color: "var(--mkt-amber)" },
      { label: "웹접근성", pct: 74, color: "var(--mkt-red)" },
    ];
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — 카테고리별 결과</div>
        {bars.map((b) => (
          <div key={b.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span>{b.label}</span>
            </div>
            <div className="mkt-gantt-track">
              <div className="mkt-gantt-bar" style={{ left: 0, width: `${b.pct}%`, background: b.color }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (demoType === "perf-bars") {
    const bars = [
      { label: "TPS", pct: 82, color: "var(--mkt-green)" },
      { label: "p95 응답", pct: 65, color: "var(--mkt-amber)" },
      { label: "안정성", pct: 92, color: "var(--mkt-green)" },
    ];
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — 부하 테스트 요약</div>
        {bars.map((b) => (
          <div key={b.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span>{b.label}</span>
            </div>
            <div className="mkt-gantt-track">
              <div className="mkt-gantt-bar" style={{ left: 0, width: `${b.pct}%`, background: b.color }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (demoType === "std-input") {
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — 표준용어 생성</div>
        <textarea
          className="mkt-form textarea"
          style={{ width: "100%", minHeight: 64, fontFamily: "var(--mkt-font-mono)", fontSize: 12 }}
          value={stdLines}
          onChange={(e) => setStdLines(e.target.value)}
        />
        <button
          type="button"
          className="mkt-btn"
          style={{ marginTop: 10, fontSize: 12, padding: "7px 14px" }}
          onClick={() => setStdResult(runStd(stdLines))}
        >
          생성 실행 →
        </button>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {stdResult.map((r) => (
            <div
              key={r.kr}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 10px",
                background: "var(--mkt-bg)",
                borderRadius: 6,
                border: "1px solid var(--mkt-line)",
                fontSize: 12,
              }}
            >
              <span>{r.kr}</span>
              <span className={`mkt-mono ${r.cls}`}>{r.en}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (demoType === "ddl-tabs") {
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — DBManager 탭</div>
        <div className="mkt-tabbtns">
          {DDL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`mkt-tabbtn${ddlTab === t.id ? " active" : ""}`}
              onClick={() => setDdlTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <pre className="mkt-mono" style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: 0, color: "var(--mkt-text-dim)" }}>
          {DDL_SNIPPETS[ddlTab]}
        </pre>
      </div>
    );
  }

  if (demoType === "erd") {
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — ERD 미리보기</div>
        <svg viewBox="0 0 280 120" width="100%" aria-hidden>
          <rect x="10" y="20" width="90" height="50" rx="4" fill="#eff6ff" stroke="#2563eb" />
          <text x="55" y="42" fill="#1e40af" fontSize="10" textAnchor="middle">
            CUSTOMER
          </text>
          <rect x="160" y="20" width="90" height="50" rx="4" fill="#eff6ff" stroke="#bfdbfe" />
          <text x="205" y="42" fill="#1e40af" fontSize="10" textAnchor="middle">
            ORDERS
          </text>
          <line x1="100" y1="45" x2="160" y2="45" stroke="#2563eb" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }

  if (demoType === "deliv-status") {
    const labels = { none: "미착수", wip: "작성중", done: "완료" };
    const order = ["none", "wip", "done"] as const;
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — 상태 클릭</div>
        {deliv.map((d, i) => (
          <div
            key={d.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "9px 10px",
              borderBottom: "1px solid var(--mkt-line)",
              fontSize: 13,
            }}
          >
            <span>{d.name}</span>
            <button
              type="button"
              className="mkt-tabbtn"
              style={{
                color:
                  d.state === "done"
                    ? "var(--mkt-green)"
                    : d.state === "wip"
                      ? "var(--mkt-amber)"
                      : "var(--mkt-text-dimmer)",
              }}
              onClick={() => {
                const next = order[(order.indexOf(d.state) + 1) % order.length];
                setDeliv((prev) => prev.map((x, j) => (j === i ? { ...x, state: next } : x)));
              }}
            >
              {labels[d.state]}
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (demoType === "gantt") {
    const rows = [
      { label: "1.1 요구분석", left: 0, width: 100, done: true },
      { label: "1.2 설계", left: 10, width: 60, done: true },
      { label: "2.1 개발", left: 35, width: 45, done: false },
    ];
    return (
      <div className="mkt-demo-box">
        <div className="mkt-demo-label">체험 — 간트 미리보기</div>
        {rows.map((r) => (
          <div key={r.label} className="mkt-gantt-row">
            <span>{r.label}</span>
            <div className="mkt-gantt-track">
              <div
                className={`mkt-gantt-bar${r.done ? " done" : ""}`}
                style={{ left: `${r.left}%`, width: `${r.width}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function runStd(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const hit = STD_DICT[line];
      if (hit) {
        return {
          kr: line,
          en: `${hit.en} (${hit.type})`,
          cls: hit.type === "exact" ? "tagexact" : "tagcomposed",
        };
      }
      return { kr: line, en: "none · 표준 미등록", cls: "tagnone" };
    });
}

import { ReceiptGlassMockup } from "./ReceiptGlassMockup";

export function ReceiptPhoneDemo() {
  return <ReceiptGlassMockup variant="home" interactive showSuccess />;
}
