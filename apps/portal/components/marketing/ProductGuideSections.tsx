import type { ProductGuide } from "@/lib/productGuides";

/** 이런 분께 추천 · 활용 예시 (서버 렌더링 — 검색엔진이 본문으로 읽습니다) */
export function ProductAudienceSection({ guide }: { guide: ProductGuide }) {
  return (
    <section className="mkt-guide-grid" aria-label="추천 대상과 활용 예시">
      <div className="mkt-panel">
        <h2 className="mkt-guide-h2">이런 분께 추천합니다</h2>
        <ul className="mkt-feat-list">
          {guide.audience.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      <div className="mkt-panel">
        <h2 className="mkt-guide-h2">활용 예시</h2>
        <dl className="mkt-usecases">
          {guide.useCases.map((u) => (
            <div key={u.title} className="mkt-usecase">
              <dt>{u.title}</dt>
              <dd>{u.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** 자주 묻는 질문 — 접혀 있어도 HTML 에 답변이 포함됩니다 */
export function ProductFaqSection({ guide, productName }: { guide: ProductGuide; productName: string }) {
  return (
    <section className="mkt-panel mkt-faq" aria-labelledby="product-faq-title">
      <h2 id="product-faq-title" className="mkt-guide-h2">
        {productName} 자주 묻는 질문
      </h2>
      {guide.faq.map((f, i) => (
        <details key={f.q} className="mkt-faq-item" open={i === 0}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </section>
  );
}
