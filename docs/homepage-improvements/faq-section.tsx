/**
 * FAQ 섹션 개선안
 * 위치: #workflow 섹션과 #customize 섹션 사이 추천
 */

"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  {
    q: "베타 프로그램은 무료인가요?",
    a: "네, 베타 프로그램은 무료로 제공됩니다. 로그인 후 8가지 도구를 모두 체험할 수 있으며, 일부 기능에 제한이 있을 수 있습니다.",
  },
  {
    q: "실제 프로젝트에 바로 적용할 수 있나요?",
    a: "가능합니다. 베타 프로그램에서 테스트 후, 맞춤 개발을 통해 실무 환경에 맞게 조정하여 납품받을 수 있습니다.",
  },
  {
    q: "어떤 기술 스택을 사용하나요?",
    a: "프론트엔드는 Next.js + React, 백엔드는 FastAPI(Python), 데이터베이스는 Supabase(PostgreSQL)를 기본으로 사용합니다.",
  },
  {
    q: "온프레미스 설치가 가능한가요?",
    a: "네, Docker 기반 온프레미스 설치를 지원합니다. 맞춤 개발 문의를 통해 상세 안내를 받으실 수 있습니다.",
  },
  {
    q: "소스코드 진단 도구는 어떤 언어를 지원하나요?",
    a: "Java, Python, JavaScript/TypeScript, PHP 등 주요 언어를 지원하며, PMD, FindSecBugs, Bandit, ESLint 등의 도구를 통합 제공합니다.",
  },
  {
    q: "Excel 테이블정의서 양식이 정해져 있나요?",
    a: "기본 템플릿을 제공하며, 고객사의 기존 양식에 맞춰 커스터마이징이 가능합니다. 컬럼명, 시트 구조 등을 조정할 수 있습니다.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="mkt-section mkt-faq-section">
      <div className="mkt-wrap">
        <div className="mkt-sec-head">
          <div className="mkt-eyebrow">FAQ</div>
          <h2>자주 묻는 질문</h2>
          <p>도구 사용, 기술 스택, 맞춤 개발에 대한 궁금증을 빠르게 해결하세요.</p>
        </div>

        <div className="mkt-faq-list">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="mkt-faq-item">
              <button
                type="button"
                className={`mkt-faq-q ${open === i ? "open" : ""}`}
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span className="mkt-faq-icon" aria-hidden>
                  Q
                </span>
                <span className="mkt-faq-question">{item.q}</span>
                <span className="mkt-faq-toggle" aria-hidden>
                  {open === i ? "−" : "+"}
                </span>
              </button>
              {open === i ? (
                <div className="mkt-faq-a">
                  <span className="mkt-faq-icon mkt-faq-icon-a" aria-hidden>
                    A
                  </span>
                  <p>{item.a}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <p className="mkt-faq-more">
          더 궁금한 점이 있으신가요?{" "}
          <a href="/contact" className="mkt-link-primary">
            문의하기 →
          </a>
        </p>
      </div>
    </section>
  );
}
