/**
 * 고객 후기/사례 섹션 개선안
 * 위치: #tools 섹션 바로 다음 추천
 */

const TESTIMONIALS = [
  {
    company: "A 금융계열사",
    industry: "금융",
    person: "개발팀 리더",
    quote:
      "소스코드 진단 도구로 레거시 Java 프로젝트의 보안 취약점 300여 건을 발견했습니다. PMD와 FindSecBugs를 한 번에 실행할 수 있어 효율적이었습니다.",
    tags: ["소스코드 진단", "보안"],
  },
  {
    company: "B 공공기관",
    industry: "공공",
    person: "SI 업체 PM",
    quote:
      "테이블정의서 Excel 하나로 DB 표준 검증, ERD 생성, Supabase 반영까지 자동화했습니다. 수작업으로 3일 걸리던 작업이 1시간으로 단축되었습니다.",
    tags: ["DB 워크플로", "자동화"],
  },
  {
    company: "C 제조사",
    industry: "제조",
    person: "품질보증팀",
    quote:
      "웹 품질 진단으로 사내 포털의 접근성·SEO 문제를 발견하고 개선했습니다. Lighthouse 점수가 평균 30점 이상 올랐습니다.",
    tags: ["웹 품질", "접근성"],
  },
];

export function TestimonialSection() {
  return (
    <section className="mkt-section mkt-testimonial-section">
      <div className="mkt-wrap">
        <div className="mkt-sec-head mkt-sec-head-compact">
          <div className="mkt-eyebrow">SUCCESS STORIES</div>
          <h2>실제 활용 사례</h2>
          <p>금융, 공공, 제조 등 다양한 분야에서 프로젝트 자동화 도구를 적용하고 있습니다.</p>
        </div>

        <div className="mkt-testimonial-grid">
          {TESTIMONIALS.map((t, i) => (
            <article key={i} className="mkt-testimonial-card">
              <div className="mkt-testimonial-header">
                <div>
                  <div className="mkt-testimonial-company">{t.company}</div>
                  <div className="mkt-testimonial-meta">
                    {t.industry} · {t.person}
                  </div>
                </div>
                <div className="mkt-testimonial-quote-icon" aria-hidden>
                  "
                </div>
              </div>
              <blockquote className="mkt-testimonial-quote">{t.quote}</blockquote>
              <div className="mkt-testimonial-tags">
                {t.tags.map((tag) => (
                  <span key={tag} className="mkt-testimonial-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <p className="mkt-testimonial-cta">
          우리 프로젝트에도 적용해 보고 싶다면?{" "}
          <a href="/contact" className="mkt-btn mkt-btn-primary">
            맞춤 상담 신청
          </a>
        </p>
      </div>
    </section>
  );
}
