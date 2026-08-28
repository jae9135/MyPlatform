/**
 * 가격/라이선스 안내 섹션 개선안
 * 위치: #customize 섹션 또는 별도 /pricing 페이지
 */

const PRICING_PLANS = [
  {
    name: "베타 체험",
    badge: "무료",
    price: "₩0",
    period: "",
    description: "8가지 도구를 무료로 체험하고 실무 적합성을 판단하세요.",
    features: [
      "8가지 도구 전체 기능 이용",
      "일부 실행 횟수 제한",
      "커뮤니티 지원",
      "데이터 보관 7일",
    ],
    cta: "무료 체험",
    href: "/login",
    highlight: false,
  },
  {
    name: "기업 라이선스",
    badge: "추천",
    price: "견적 문의",
    period: "",
    description: "실무 환경에 맞춘 맞춤 개발 + 라이선스 제공",
    features: [
      "온프레미스 또는 클라우드 배포",
      "무제한 사용자·프로젝트",
      "화면·양식·기능 커스터마이징",
      "기술 지원 · 유지보수 포함",
      "소스코드 제공 옵션",
    ],
    cta: "상담 신청",
    href: "/contact?type=license",
    highlight: true,
  },
  {
    name: "SaaS 구독",
    badge: "준비중",
    price: "미정",
    period: "/ 월",
    description: "클라우드 기반 멀티테넌트 SaaS (2026년 하반기 출시 예정)",
    features: [
      "사용자당 월 과금",
      "자동 업데이트",
      "데이터 백업·보안",
      "API 연동 지원",
    ],
    cta: "출시 알림 받기",
    href: "/contact?type=saas-notify",
    highlight: false,
    disabled: true,
  },
];

export function PricingSection() {
  return (
    <section className="mkt-section mkt-pricing-section">
      <div className="mkt-wrap">
        <div className="mkt-sec-head">
          <div className="mkt-eyebrow">PRICING</div>
          <h2>가격 & 라이선스</h2>
          <p>베타 체험부터 기업 맞춤 라이선스까지 — 프로젝트 규모에 맞게 선택하세요.</p>
        </div>

        <div className="mkt-pricing-grid">
          {PRICING_PLANS.map((plan) => (
            <article
              key={plan.name}
              className={`mkt-pricing-card ${plan.highlight ? "highlight" : ""} ${plan.disabled ? "disabled" : ""}`}
            >
              {plan.badge ? <div className="mkt-pricing-badge">{plan.badge}</div> : null}

              <div className="mkt-pricing-header">
                <h3 className="mkt-pricing-name">{plan.name}</h3>
                <div className="mkt-pricing-price">
                  {plan.price}
                  {plan.period ? <span className="mkt-pricing-period">{plan.period}</span> : null}
                </div>
                <p className="mkt-pricing-desc">{plan.description}</p>
              </div>

              <ul className="mkt-pricing-features">
                {plan.features.map((f) => (
                  <li key={f}>
                    <span className="mkt-pricing-check" aria-hidden>
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={plan.href}
                className={`mkt-btn ${plan.highlight ? "mkt-btn-primary" : ""} ${plan.disabled ? "mkt-btn-disabled" : ""} mkt-btn-block`}
                aria-disabled={plan.disabled}
              >
                {plan.cta}
              </a>
            </article>
          ))}
        </div>

        <div className="mkt-pricing-note">
          <p>
            <strong>모든 플랜 공통:</strong> Java, Python, JS/TS 등 주요 언어 지원 · Excel 기반 DB 워크플로 · 웹
            품질/성능 진단
          </p>
          <p>
            맞춤 개발 견적은 요구사항에 따라 달라집니다.{" "}
            <a href="/contact" className="mkt-link-primary">
              상세 문의 →
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
