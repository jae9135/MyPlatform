import Image from "next/image";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { DemoRunLink, DemoSourceNote, DemoStat } from "@/components/marketing/demo/DemoParts";
import { DB_APPLY_DEMO, DB_WORKFLOW_DEMO } from "@/lib/demo/demoResults";
import "../../marketing.css";

/**
 * DB 워크플로 데모 — 샘플 테이블정의서 하나를 실제 프로그램 4개에 차례로 넣은 결과.
 * 화면의 숫자·표·DDL·ERD 는 모두 실제 실행 결과(lib/demo/demoResults.ts)입니다.
 */

const D = DB_WORKFLOW_DEMO;
const SAMPLE_URL = "/samples/demo/table-design.sample.xlsx";

const STEPS = [
  { id: "design", label: "설계서" },
  { id: "standard", label: "표준 점검" },
  { id: "erd", label: "ERD" },
  { id: "ddl", label: "DDL 생성" },
  { id: "apply", label: "DB 적용" },
] as const;

export default function DemoDbWorkflowPage() {
  const tableName = new Map<string, string>(D.tables.map((t) => [t.name, t.korean]));

  return (
    <MarketingPageShell>
      <div className="mkt-demo">
        <header className="mkt-demo-hero">
          <p className="mkt-eyebrow">DB 워크플로 데모</p>
          <h1>샘플 설계서 하나로 따라가 보는 &lsquo;설계서 → DB&rsquo;</h1>
          <p className="mkt-demo-lead">
            샘플 테이블정의서({D.meta.tables}개 테이블 · {D.meta.columns}개 컬럼 · FK {D.meta.relations}개)를
            DB 표준 점검 → ER Modeler → DBManager에 차례로 넣어 실제로 실행한 결과입니다. 각 단계의
            「이 샘플로 직접 실행」을 누르면 같은 샘플이 불러와진 상태로 실제 프로그램이 열립니다.
          </p>
          <div className="mkt-demo-actions">
            <a className="mkt-btn" href={SAMPLE_URL} download={D.sampleFile}>
              샘플 설계서 내려받기 (.xlsx)
            </a>
          </div>
          <nav className="mkt-demo-steps" aria-label="단계">
            <ol>
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>
                    <span aria-hidden="true">{i + 1}</span>
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </header>

        {/* 1. 설계서 */}
        <section id="design" className="mkt-panel mkt-demo-section" aria-labelledby="design-title">
          <h2 id="design-title">
            <span className="mkt-demo-num">1</span> 샘플 테이블정의서
          </h2>
          <p>
            「{D.meta.system}」의 테이블정의서(시트: {D.meta.sheet})입니다. 고객·회원·주문·상품을 다루는 작은
            설계서로, 테이블 간 FK 관계가 {D.meta.relations}개 있습니다.
          </p>
          <ul className="mkt-demo-chips">
            {D.tables.map((t) => (
              <li key={t.name}>
                <strong>{t.korean}</strong> <code>{t.name}</code> · 컬럼 {t.columns}
              </li>
            ))}
          </ul>
        </section>

        {/* 2. 표준 점검 */}
        <section id="standard" className="mkt-panel mkt-demo-section" aria-labelledby="standard-title">
          <h2 id="standard-title">
            <span className="mkt-demo-num">2</span> DB 표준 점검 — 행안부 공통표준과 대조
          </h2>
          <p>
            이 샘플은 영문명을 표준 약어 대신 일반 영어(예: <code>CUSTOMER_NM</code>)로 지어서, 용어 점검에서
            모든 항목이 &lsquo;검토&rsquo;로 분류됐습니다. 프로그램이 항목마다 표준 영문명을 제안합니다.
          </p>
          <div className="mkt-demo-stats">
            <DemoStat label="용어 점검 항목" value={D.std.term.total_cols} />
            <DemoStat label="일치" value={D.std.term.matched_cols} tone="ok" />
            <DemoStat label="검토" value={D.std.term.review_cols} tone="warn" />
            <DemoStat label="미매칭" value={D.std.term.unmatched_cols} tone="bad" />
          </div>
          <h3>용어 점검 결과 (발췌 {D.std.rows.length}건 / 전체 {D.std.term.total_cols}건)</h3>
          <div className="mkt-demo-table-wrap">
            <table className="mkt-mini-table">
              <thead>
                <tr>
                  <th scope="col">테이블</th>
                  <th scope="col">항목</th>
                  <th scope="col">현재 영문명</th>
                  <th scope="col">표준 권장 영문명</th>
                  <th scope="col">사유</th>
                </tr>
              </thead>
              <tbody>
                {D.std.rows.map((r) => (
                  <tr key={`${r.table}-${r.column}`}>
                    <td>{r.table}</td>
                    <td>{r.column}</td>
                    <td className="mkt-mono">{r.current}</td>
                    <td className="mkt-mono mkt-demo-good">{r.recommended}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>도메인 점검 (컬럼 {D.std.domain.total_cols}개 중 검토 {D.std.domain.review_cols} · 미매칭 {D.std.domain.unmatched_cols})</h3>
          <div className="mkt-demo-table-wrap">
            <table className="mkt-mini-table">
              <thead>
                <tr>
                  <th scope="col">컬럼</th>
                  <th scope="col">설계 타입</th>
                  <th scope="col">표준 도메인</th>
                  <th scope="col">도메인 타입</th>
                  <th scope="col">사유</th>
                </tr>
              </thead>
              <tbody>
                {D.std.domainRows.map((r) => (
                  <tr key={`${r.table}-${r.column}`}>
                    <td>
                      {r.table}.{r.column}
                    </td>
                    <td className="mkt-mono">{r.designType}</td>
                    <td>{r.domain}</td>
                    <td className="mkt-mono">{r.domainType}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mkt-demo-actions">
            <DemoRunLink href="/apps/chk-db-std?sample=table-design">이 샘플로 직접 실행 — DB 표준 점검</DemoRunLink>
            <Link className="mkt-btn mkt-btn-ghost mkt-btn-sm" href="/products/chk-db-std">
              DB 표준 점검 소개
            </Link>
          </div>
        </section>

        {/* 3. ERD */}
        <section id="erd" className="mkt-panel mkt-demo-section" aria-labelledby="erd-title">
          <h2 id="erd-title">
            <span className="mkt-demo-num">3</span> ER Modeler — 설계서를 ERD로
          </h2>
          <p>
            설계서를 가져와 「자동 배치」만 누른 화면입니다. 테이블 {D.meta.tables}개와 FK 관계{" "}
            {D.meta.relations}개가 설계서 내용 그대로 그려집니다.
          </p>
          <figure className="mkt-demo-figure">
            <Image
              src={D.erdImage.src}
              width={D.erdImage.width}
              height={D.erdImage.height}
              alt={`샘플 설계서로 그린 ERD — ${D.tables.map((t) => t.korean).join(", ")} 테이블과 관계선`}
              sizes="(max-width: 1100px) 100vw, 1060px"
            />
            <figcaption>ER Modeler 실제 화면 (자동 배치 적용)</figcaption>
          </figure>
          <h3>가져온 관계</h3>
          <ul className="mkt-demo-list">
            {D.relations.map((r) => (
              <li key={`${r.from}-${r.to}-${r.fromColumn}`}>
                {tableName.get(r.from) ?? r.from} <code>{r.from}.{r.fromColumn}</code> →{" "}
                {tableName.get(r.to) ?? r.to} <code>{r.to}.{r.toColumn}</code> · {r.cardinality} ·{" "}
                {r.identifying ? "식별 관계" : "비식별 관계"}
              </li>
            ))}
          </ul>
          <div className="mkt-demo-actions">
            <DemoRunLink href="/apps/er-modeler?sample=table-design">이 샘플로 직접 실행 — ER Modeler</DemoRunLink>
            <Link className="mkt-btn mkt-btn-ghost mkt-btn-sm" href="/products/er-modeler">
              ER Modeler 소개
            </Link>
          </div>
        </section>

        {/* 4. DDL */}
        <section id="ddl" className="mkt-panel mkt-demo-section" aria-labelledby="ddl-title">
          <h2 id="ddl-title">
            <span className="mkt-demo-num">4</span> DBManager — PostgreSQL DDL 생성
          </h2>
          <p>
            테이블마다 DDL 파일이 만들어집니다. 다른 테이블을 참조하는 테이블은 뒤에 오도록 정렬돼, 순서대로
            실행해도 FK 오류가 나지 않습니다.
          </p>
          <ol className="mkt-demo-files">
            {D.ddl.scripts.map((name) => (
              <li key={name} className="mkt-mono">
                {name}
              </li>
            ))}
          </ol>
          <h3>{D.ddl.exampleName} (생성된 그대로)</h3>
          <pre className="mkt-demo-code" tabIndex={0}>
            <code>{D.ddl.example}</code>
          </pre>
          <div className="mkt-demo-actions">
            <DemoRunLink href="/apps/db-manager?sample=table-design">이 샘플로 직접 실행 — DBManager</DemoRunLink>
            <Link className="mkt-btn mkt-btn-ghost mkt-btn-sm" href="/products/db-manager">
              DBManager 소개
            </Link>
          </div>
        </section>

        {/* 5. DB 적용 */}
        <section id="apply" className="mkt-panel mkt-demo-section" aria-labelledby="apply-title">
          <h2 id="apply-title">
            <span className="mkt-demo-num">5</span> DB 적용 — 테이블 생성과 샘플 데이터
          </h2>
          <p>
            DBManager 「스크립트 → 적용」에서 {DB_APPLY_DEMO.database}에 두 단계를 실행한 응답입니다.
          </p>
          <ul className="mkt-demo-log">
            {DB_APPLY_DEMO.steps.map((s) => (
              <li key={s.step}>
                <strong>
                  {s.ok ? "✓" : "✗"} {s.step}
                </strong>
                <code>{s.message}</code>
              </li>
            ))}
          </ul>
          <div className="mkt-demo-stats">
            <DemoStat label="생성된 테이블" value={DB_APPLY_DEMO.verify.tables.length} tone="ok" />
            <DemoStat label="FK 제약조건" value={DB_APPLY_DEMO.verify.foreignKeys} tone="ok" />
            <DemoStat label="테이블당 샘플 행" value={1} />
          </div>
          <DemoSourceNote>
            공개 데모에서 운영 DB에 적용·조회하는 기능은 관리자 암호가 있어야 열립니다. DDL 생성·다운로드는
            누구나 사용할 수 있습니다.
          </DemoSourceNote>
        </section>

        <section className="mkt-panel mkt-demo-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">우리 설계서와 표준으로 적용해 보고 싶다면</h2>
          <p>조직 표준(단어·용어·도메인), 설계서 양식, DB 종류에 맞춰 맞춤 구성해 드립니다.</p>
          <div className="mkt-demo-actions">
            <Link className="mkt-btn mkt-btn-primary" href="/contact?tool=db-manager&interest=db-workflow">
              맞춤 적용 문의
            </Link>
            <Link className="mkt-btn" href="/demo/quality">
              품질·보안 진단 데모 보기
            </Link>
          </div>
          <DemoSourceNote>
            이 페이지의 결과는 {D.generatedAt}에 실제 프로그램을 실행해 얻은 값이며, 손으로 만든 값은 없습니다.
          </DemoSourceNote>
        </section>
      </div>
    </MarketingPageShell>
  );
}
