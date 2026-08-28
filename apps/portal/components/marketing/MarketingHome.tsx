"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { getInfraLinks } from "@/lib/portalInfraLinks";
import {
  CUSTOMIZE_CARDS,
  CONTACT_EMAIL,
  CONTACT_NOTICE,
  CONTACT_PHONE,
  HOME_SEO,
  MARKETING_STATS,
  PROCESS_STEPS,
  RECEIPT_STANDALONE,
} from "@/lib/marketingCatalog";
import { MARKETING_IMAGES, TOOL_CATEGORY_GROUPS } from "@/lib/marketingAssets";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingNav } from "./MarketingNav";
import { ReceiptPhoneDemo } from "./ToolDemo";
import { ToolCatalog } from "./ToolCatalog";
import { WorkflowConnectDiagram } from "./WorkflowConnectDiagram";

export function MarketingHome() {
  const infraLinks = getInfraLinks();

  return (
    <div className="mkt">
      <MarketingNav />

      <section className="mkt-hero">
        <div className="mkt-wrap mkt-hero-grid">
          <div className="mkt-hero-copy">
            <div className="mkt-eyebrow">PROJECT AUTOMATION</div>
            <h1>
              <span className="mkt-h1-lead">{HOME_SEO.h1Lead}</span>
              <em>{HOME_SEO.h1Accent}</em>
            </h1>
            <p className="mkt-seo-note">{HOME_SEO.seoParagraph}</p>
            <div className="mkt-hero-ctas">
              <a className="mkt-btn mkt-btn-primary" href="#tools">
                8가지 도구 보기
              </a>
              <Link className="mkt-btn" href="/customize">
                맞춤 개발 문의
              </Link>
              <Link className="mkt-btn mkt-btn-ghost" href="/login">
                베타 프로그램
              </Link>
            </div>
            {infraLinks.length > 0 ? (
              <div className="mkt-hero-badges">
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
          <div className="mkt-hero-visual" aria-hidden>
            <Image
              src={MARKETING_IMAGES.hero}
              alt=""
              fill
              priority
              quality={95}
              className="mkt-hero-bg-image"
              sizes="(max-width: 940px) 100vw, 55vw"
            />
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

      <section id="tools" className="mkt-section mkt-section-tight">
        <div className="mkt-wrap">
          <div className="mkt-sec-head mkt-sec-head-compact">
            <div className="mkt-eyebrow">TOOL CATALOG</div>
            <h2>어떤 도구가 있나요?</h2>
            <p>실제 화면 캡처 — 카드를 클릭하면 상세 기능·설명으로 이동합니다.</p>
          </div>

          {TOOL_CATEGORY_GROUPS.map((group) => (
            <div key={group.id} className="mkt-tool-group">
              <div className="mkt-tool-group-head">
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <ToolCatalog category={group.id} />
            </div>
          ))}
        </div>
      </section>

      <section id="receipt" className="mkt-section mkt-section-tight mkt-receipt-band">
        <div className="mkt-wrap mkt-receipt-grid">
          <div>
            <div className="mkt-eyebrow">STANDALONE · MOBILE</div>
            <h2 className="mkt-receipt-title">
              모바일 업무 도구 · {RECEIPT_STANDALONE.name}
            </h2>
            <p className="mkt-receipt-desc">
              {RECEIPT_STANDALONE.description} 플랫폼 8종과 별도로 제공하는 독립 도구입니다.
            </p>
            <ul className="mkt-feat-list mkt-receipt-feats">
              {RECEIPT_STANDALONE.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="mkt-receipt-actions">
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

      <section id="workflow" className="mkt-section mkt-workflow-section">
        <div className="mkt-wrap">
          <div className="mkt-sec-head mkt-sec-head-compact">
            <div className="mkt-eyebrow">HOW IT CONNECTS</div>
            <h2>하나의 설계서 양식으로 세 도구가 이어집니다</h2>
            <p>테이블정의서 Excel 하나로 표준 검증, ERD, DB 반영을 오갈 수 있습니다.</p>
          </div>
          <div className="mkt-workflow-flow">
            <WorkflowConnectDiagram />
          </div>
          <div className="mkt-workflow-btns">
            <Link className="mkt-btn mkt-btn-primary" href="/demo/db-workflow">
              DB 워크플로 데모
            </Link>
            <Link className="mkt-btn" href="/demo/quality">
              품질 진단 데모
            </Link>
          </div>
        </div>
      </section>

      <section id="customize" className="mkt-section mkt-customize-section">
        <div className="mkt-wrap">
          <div className="mkt-license-grid">
            <div className="mkt-customize-main">
              <div className="mkt-eyebrow">CUSTOM BUILD</div>
              <h2 className="mkt-customize-title">우리 프로젝트에 맞게 커스터마이징</h2>
              <p className="mkt-customize-lead">
                화면·양식 변경, 기능 추가, 시스템 연동 — 데모 확인 후 요구사항에 맞춰 납품합니다.
              </p>
              <div className="mkt-cards-3">
                {CUSTOMIZE_CARDS.map((c) => (
                  <div key={c.title} className="mkt-card-box">
                    <h3>{c.title}</h3>
                    <p>{c.body}</p>
                  </div>
                ))}
              </div>
              <div className="mkt-process-row">
                {PROCESS_STEPS.map((s, i) => (
                  <Fragment key={s}>
                    <div className="mkt-process-step">
                      {String(i + 1).padStart(2, "0")}
                      <br />
                      <b>{s}</b>
                    </div>
                    {i < PROCESS_STEPS.length - 1 ? (
                      <div className="mkt-process-connector" aria-hidden>
                        →
                      </div>
                    ) : null}
                  </Fragment>
                ))}
              </div>
            </div>
            <div className="mkt-contact-card">
              <p className="mkt-contact-lead">맞춤 개발·신규 기능·견적 상담을 받습니다.</p>
              <div className="mkt-contact-info-inline">
                <p>{CONTACT_NOTICE}</p>
                <p>
                  e-mail: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </p>
                <p>
                  tel: <a href={`tel:${CONTACT_PHONE.replace(/-/g, "")}`}>{CONTACT_PHONE}</a>
                </p>
              </div>
              <Link className="mkt-btn mkt-btn-primary mkt-btn-block" href="/contact">
                문의하기
              </Link>
              <Link className="mkt-btn mkt-btn-block" href="/customize">
                상세 안내
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
