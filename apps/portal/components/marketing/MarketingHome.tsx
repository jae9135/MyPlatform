"use client";

import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { getInfraLinks } from "@/lib/portalInfraLinks";
import {
  CUSTOMIZE_CARDS,
  CONTACT_EMAIL,
  CONTACT_NOTICE,
  CONTACT_PHONE,
  MARKETING_STATS,
  PROCESS_STEPS,
  RECEIPT_STANDALONE,
} from "@/lib/marketingCatalog";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingNav } from "./MarketingNav";
import { ReceiptPhoneDemo } from "./ToolDemo";
import { ToolCatalog } from "./ToolCatalog";

export function MarketingHome() {
  const infraLinks = getInfraLinks();

  return (
    <div className="mkt">
      <MarketingNav />

      <section className="mkt-hero">
        <div className="mkt-wrap mkt-hero-grid">
          <div>
            <div className="mkt-eyebrow">PROJECT AUTOMATION</div>
            <h1>
              반복되는 프로젝트 업무,
              <br />
              <em>일곱 가지 도구</em>로 쉽게
            </h1>
            <p className="mkt-lead">
              {BRAND_NAME} — DB 표준·ERD·소스·웹 품질 진단, 산출물·일정 관리까지. 카드에서
              상세 기능·화면을 확인하고, 베타 프로그램에서 직접 실행할 수 있습니다.
            </p>
            <div className="mkt-hero-ctas">
              <a className="mkt-btn mkt-btn-primary" href="#tools">
                7가지 도구 보기
              </a>
              <Link className="mkt-btn" href="/customize">
                맞춤 개발 문의
              </Link>
              <Link className="mkt-btn mkt-btn-ghost" href="/login">
                베타 프로그램
              </Link>
            </div>
            {infraLinks.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                {infraLinks.map((item) => (
                  <a
                    key={item.label}
                    className="mkt-badge"
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="sq" />
                    {item.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mkt-hero-card">
            <h4>한눈에 보는 플랫폼</h4>
            <div className="mkt-stat-row">
              {MARKETING_STATS.slice(0, 4).map((s) => (
                <div key={s.label} className="mkt-stat-mini">
                  <b>{s.num}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mkt-stats">
        <div className="mkt-wrap mkt-stats-wrap">
          <div className="mkt-stats-grid">
            {MARKETING_STATS.map((s) => (
              <div key={s.label} className="mkt-stat">
                <div className="mkt-stat-num">{s.num}</div>
                <div className="mkt-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section id="tools" className="mkt-section">
        <div className="mkt-wrap">
          <div className="mkt-sec-head">
            <div className="mkt-eyebrow">TOOL CATALOG</div>
            <h2>어떤 도구가 있나요?</h2>
            <p>품질 · DB·설계 · 업무 — 카드를 클릭하면 상세 기능·설명·화면 미리보기로 이동합니다.</p>
          </div>
          <ToolCatalog />
        </div>
      </section>

      <section id="receipt" className="mkt-section mkt-receipt-band">
        <div className="mkt-wrap mkt-receipt-grid">
          <div>
            <div className="mkt-eyebrow">STANDALONE · MOBILE</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 10px" }}>
              모바일 업무 도구 · {RECEIPT_STANDALONE.name}
            </h2>
            <p style={{ color: "var(--mkt-text-dim)", maxWidth: 520, fontSize: 16 }}>
              {RECEIPT_STANDALONE.description} 플랫폼 8종과 별도로 제공하는 독립 도구입니다.
            </p>
            <ul className="mkt-feat-list" style={{ marginTop: 14 }}>
              {RECEIPT_STANDALONE.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              <Link className="mkt-btn" href={RECEIPT_STANDALONE.productHref}>
                자세히 보기
              </Link>
              <Link className="mkt-btn mkt-btn-primary" href={RECEIPT_STANDALONE.href}>
                체험하기
              </Link>
              <Link
                className="mkt-btn mkt-btn-ghost"
                href="/contact?tool=receipt-to-pdf&type=standalone"
              >
                맞춤 문의
              </Link>
            </div>
          </div>
          <ReceiptPhoneDemo />
        </div>
      </section>

      <section id="workflow" className="mkt-section">
        <div className="mkt-wrap">
          <div className="mkt-sec-head">
            <div className="mkt-eyebrow">HOW IT CONNECTS</div>
            <h2>하나의 설계서 양식으로 세 도구가 이어집니다</h2>
            <p>테이블정의서 Excel 하나로 표준 검증, ERD, DB 반영을 오갈 수 있습니다.</p>
          </div>
          <div className="mkt-flow">
            <WorkflowSvg />
          </div>
          <p style={{ marginTop: 12, textAlign: "center" }}>
            <Link className="mkt-btn" href="/demo/db-workflow">
              DB 워크플로 데모
            </Link>
            <Link className="mkt-btn" href="/demo/quality" style={{ marginLeft: 8 }}>
              품질 진단 데모
            </Link>
          </p>
        </div>
      </section>

      <section id="customize" className="mkt-section">
        <div className="mkt-wrap">
          <div className="mkt-license">
            <div className="mkt-license-grid">
              <div>
                <div className="mkt-eyebrow">CUSTOM BUILD</div>
                <h2>이미 만들어진 프로그램을 우리 업무에 맞게</h2>
                <p style={{ color: "var(--mkt-text-dim)", fontSize: 16 }}>
                  화면·양식, 기능 추가, 시스템 연동 — 데모 확인 후 요구사항에 맞춰 납품합니다.
                </p>
                <div className="mkt-cards-3">
                  {CUSTOMIZE_CARDS.map((c) => (
                    <div key={c.title} className="mkt-card-box">
                      <h3 style={{ margin: "0 0 8px" }}>{c.title}</h3>
                      <p style={{ margin: 0, fontSize: 15, color: "var(--mkt-text-dim)" }}>{c.body}</p>
                    </div>
                  ))}
                </div>
                <div className="mkt-process">
                  {PROCESS_STEPS.map((s, i) => (
                    <div key={s} className="mkt-process-step">
                      {String(i + 1).padStart(2, "0")}
                      <br />
                      <b>{s}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mkt-contact-card">
                <p style={{ color: "var(--mkt-text-dim)", fontSize: 15, margin: "0 0 12px" }}>
                  맞춤 개발·신규 기능·견적 상담을 받습니다.
                </p>
                <div className="mkt-contact-info-inline">
                  <p style={{ fontSize: 14, color: "var(--mkt-text-dim)", margin: "0 0 8px" }}>
                    {CONTACT_NOTICE}
                  </p>
                  <p style={{ fontSize: 14, margin: "0 0 4px" }}>
                    e-mail:{" "}
                    <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--mkt-accent)" }}>
                      {CONTACT_EMAIL}
                    </a>
                  </p>
                  <p style={{ fontSize: 14, margin: "0 0 16px" }}>
                    tel:{" "}
                    <a href={`tel:${CONTACT_PHONE.replace(/-/g, "")}`} style={{ color: "var(--mkt-accent)" }}>
                      {CONTACT_PHONE}
                    </a>
                  </p>
                </div>
                <Link className="mkt-btn mkt-btn-primary" href="/contact" style={{ width: "100%", justifyContent: "center" }}>
                  문의하기
                </Link>
                <Link className="mkt-btn" href="/customize" style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
                  상세 안내
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function WorkflowSvg() {
  return (
    <svg className="mkt-flow-svg" viewBox="0 0 760 200" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="80" width="140" height="46" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
      <text x="80" y="99" fill="#1e40af" fontSize="11" textAnchor="middle" fontWeight="600">
        테이블정의서
      </text>
      <text x="80" y="114" fill="#64748b" fontSize="9" textAnchor="middle">
        .xlsx
      </text>
      <rect x="290" y="15" width="160" height="50" rx="6" fill="#eff6ff" stroke="#2563eb" />
      <text x="370" y="36" fill="#2563eb" fontSize="11" textAnchor="middle" fontWeight="700">
        DB 표준 점검
      </text>
      <rect x="290" y="78" width="160" height="50" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
      <text x="370" y="99" fill="#1e40af" fontSize="11" textAnchor="middle" fontWeight="700">
        DBManager
      </text>
      <rect x="290" y="141" width="160" height="50" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
      <text x="370" y="162" fill="#1e40af" fontSize="11" textAnchor="middle" fontWeight="700">
        ER Modeler
      </text>
      <rect x="610" y="78" width="140" height="50" rx="6" fill="#eff6ff" stroke="#2563eb" />
      <text x="680" y="99" fill="#2563eb" fontSize="11" textAnchor="middle" fontWeight="700">
        Supabase
      </text>
      <path d="M150 103 L280 40" stroke="#2563eb" fill="none" strokeWidth="1.5" />
      <path d="M150 103 L280 103" stroke="#2563eb" fill="none" strokeWidth="1.5" />
      <path d="M150 103 L280 165" stroke="#2563eb" fill="none" strokeWidth="1.5" />
      <path d="M450 103 L610 103" stroke="#93c5fd" fill="none" strokeWidth="1.5" />
    </svg>
  );
}
