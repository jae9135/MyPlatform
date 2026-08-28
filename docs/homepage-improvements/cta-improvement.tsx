/**
 * CTA 개선안 - 히어로 섹션
 * 현재 3개 버튼이 동일한 시각적 비중 → 주요 CTA 1개로 집중
 */

// ===== 개선안 1: 메인 CTA 강조 =====
export function HeroCta_Variant1() {
  return (
    <div className="mkt-hero-ctas-v1">
      <a className="mkt-btn-large mkt-btn-primary-large" href="#tools">
        8가지 도구 무료 체험
        <span className="mkt-btn-arrow" aria-hidden>
          →
        </span>
      </a>
      <div className="mkt-hero-ctas-secondary">
        <a href="/customize" className="mkt-link-secondary">
          맞춤 개발 알아보기
        </a>
        <span className="mkt-divider" aria-hidden>
          ·
        </span>
        <a href="/login" className="mkt-link-secondary">
          베타 프로그램
        </a>
      </div>
    </div>
  );
}

// ===== 개선안 2: 2단 구조 (주요 + 보조) =====
export function HeroCta_Variant2() {
  return (
    <div className="mkt-hero-ctas-v2">
      <div className="mkt-hero-primary-cta">
        <a className="mkt-btn-hero" href="#tools">
          <span className="mkt-btn-hero-label">8가지 도구 체험하기</span>
          <span className="mkt-btn-hero-sub">무료 · 회원가입 불필요</span>
        </a>
      </div>
      <div className="mkt-hero-secondary-ctas">
        <a className="mkt-btn mkt-btn-outline" href="/contact">
          맞춤 상담 신청
        </a>
        <a className="mkt-btn mkt-btn-ghost" href="/login">
          베타 로그인
        </a>
      </div>
    </div>
  );
}

// ===== 개선안 3: 아이콘 + 텍스트 카드형 =====
export function HeroCta_Variant3() {
  return (
    <div className="mkt-hero-ctas-v3">
      <a className="mkt-cta-card mkt-cta-card-primary" href="#tools">
        <div className="mkt-cta-icon">🚀</div>
        <div className="mkt-cta-text">
          <div className="mkt-cta-title">무료 체험 시작</div>
          <div className="mkt-cta-desc">8가지 도구 바로 사용</div>
        </div>
      </a>
      <a className="mkt-cta-card" href="/contact">
        <div className="mkt-cta-icon">💬</div>
        <div className="mkt-cta-text">
          <div className="mkt-cta-title">맞춤 상담</div>
          <div className="mkt-cta-desc">프로젝트에 맞게 조정</div>
        </div>
      </a>
      <a className="mkt-cta-card" href="/login">
        <div className="mkt-cta-icon">🔐</div>
        <div className="mkt-cta-text">
          <div className="mkt-cta-title">베타 프로그램</div>
          <div className="mkt-cta-desc">로그인 후 전체 이용</div>
        </div>
      </a>
    </div>
  );
}
