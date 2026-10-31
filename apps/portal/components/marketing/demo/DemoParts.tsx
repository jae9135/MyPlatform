import Link from "next/link";

/** 데모 페이지 공통 조각 (서버 렌더링 — 결과가 HTML 본문에 그대로 포함됨) */

export function DemoStat({ label, value, tone }: { label: string; value: number | string; tone?: "bad" | "warn" | "ok" }) {
  return (
    <div className={`mkt-demo-stat${tone ? ` is-${tone}` : ""}`}>
      <div className="mkt-demo-stat-label">{label}</div>
      <div className="mkt-demo-stat-num">{value}</div>
    </div>
  );
}

export function DemoRunLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="mkt-btn mkt-btn-primary mkt-btn-sm" href={href}>
      {children}
    </Link>
  );
}

export function DemoSourceNote({ children }: { children: React.ReactNode }) {
  return <p className="mkt-demo-note">{children}</p>;
}

export function SeverityBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const label = v === "high" ? "높음" : v === "medium" ? "중간" : v === "low" ? "낮음" : value;
  return <span className={`mkt-sev mkt-sev-${v}`}>{label}</span>;
}
