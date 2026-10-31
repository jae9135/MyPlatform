import Image from "next/image";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { DemoRunLink, DemoSourceNote, DemoStat, SeverityBadge } from "@/components/marketing/demo/DemoParts";
import { DemoTabs } from "@/components/marketing/demo/DemoTabs";
import { DB_WORKFLOW_DEMO, SOURCE_SCAN_DEMO, WEB_QUALITY_DEMO } from "@/lib/demo/demoResults";
import "../../marketing.css";

/**
 * 품질·보안 진단 데모 — 탭마다 실제 진단 도구를 데모 샘플로 실행한 결과(lib/demo/demoResults.ts).
 */

const SCANNER_LABEL: Record<string, string> = {
  bandit: "Bandit (Python)",
  pmd: "PMD (Java 품질)",
  spotbugs: "SpotBugs + FindSecBugs (Java 보안)",
};

const WQ_CATEGORY: Record<string, string> = {
  a11y: "웹접근성",
  compat: "웹호환성",
  standard: "웹표준",
  uiux: "UI·UX (KRDS)",
};

const WQ_STATUS: Record<string, string> = { fail: "위반", review: "검토" };

function SourcePanel() {
  const S = SOURCE_SCAN_DEMO;
  return (
    <section className="mkt-panel mkt-demo-section" aria-labelledby="source-title">
      <h2 id="source-title">소스코드·보안 진단 — 데모 샘플 프로젝트</h2>
      <p>
        Java·Python 파일이 섞인 작은 샘플 프로젝트(<code>{S.sampleFile}</code>)에 일부러 SQL 인젝션, 하드코딩된
        비밀번호, 취약한 해시(MD5), <code>shell=True</code> 같은 보안 약점을 넣고 소스 점검을 실행한 결과입니다.
      </p>
      <div className="mkt-demo-stats">
        <DemoStat label="전체 결함" value={S.stats.total} />
        <DemoStat label="높음" value={S.stats.by_severity.high} tone="bad" />
        <DemoStat label="중간" value={S.stats.by_severity.medium} tone="warn" />
        <DemoStat label="낮음" value={S.stats.by_severity.low} />
      </div>
      <ul className="mkt-demo-chips">
        {Object.entries(S.stats.by_scanner).map(([k, n]) => (
          <li key={k}>
            <strong>{SCANNER_LABEL[k] ?? k}</strong> · {n}건
          </li>
        ))}
      </ul>
      <div className="mkt-demo-table-wrap">
        <table className="mkt-mini-table">
          <caption className="sr-only">소스 점검 결과 전체 {S.findings.length}건</caption>
          <thead>
            <tr>
              <th scope="col">심각도</th>
              <th scope="col">도구 · 규칙</th>
              <th scope="col">위치</th>
              <th scope="col">내용</th>
            </tr>
          </thead>
          <tbody>
            {S.findings.map((f, i) => (
              <tr key={`${f.rule}-${f.location}-${i}`}>
                <td>
                  <SeverityBadge value={f.severity} />
                </td>
                <td>
                  <span className="mkt-demo-tool">{f.scanner}</span>{" "}
                  {f.ref ? (
                    <a className="mkt-mono" href={f.ref} target="_blank" rel="noopener noreferrer">
                      {f.rule}
                    </a>
                  ) : (
                    <span className="mkt-mono">{f.rule}</span>
                  )}
                </td>
                <td className="mkt-mono">{f.location}</td>
                <td>{f.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mkt-demo-actions">
        <DemoRunLink href="/apps/source-scan?sample=demo-shop">이 샘플로 직접 실행 — 소스 점검</DemoRunLink>
        <a className="mkt-btn mkt-btn-sm" href="/samples/demo/demo-shop.zip" download>
          샘플 프로젝트 내려받기 (.zip)
        </a>
        <Link className="mkt-btn mkt-btn-ghost mkt-btn-sm" href="/products/source-scan">
          소스 점검 소개
        </Link>
      </div>
      <DemoSourceNote>
        실제 서버에서는 ZIP 크기·스캐너 설정에 따라 수십 초~몇 분이 걸립니다. 결과는 Excel·HTML·SARIF로 내려받을 수
        있습니다.
      </DemoSourceNote>
    </section>
  );
}

function WebPanel() {
  const W = WEB_QUALITY_DEMO;
  return (
    <section className="mkt-panel mkt-demo-section" aria-labelledby="web-title">
      <h2 id="web-title">웹 품질 진단 — 데모 샘플 페이지</h2>
      <p>
        이미지 대체 텍스트 누락, 낮은 명도 대비, 이름 없는 버튼, 라벨 없는 입력칸, 사용 중단된 태그를 일부러 넣은{" "}
        <a href={W.samplePath} target="_blank" rel="noopener noreferrer">
          샘플 페이지
        </a>
        를 실제 브라우저(Playwright)로 열어 axe 엔진과 KRDS 규칙으로 점검한 결과입니다.
      </p>
      <div className="mkt-demo-stats">
        <DemoStat label="위반" value={W.stats.fail} tone="bad" />
        <DemoStat label="검토 필요" value={W.stats.review} tone="warn" />
        <DemoStat label="통과" value={W.stats.pass} tone="ok" />
        <DemoStat label="사람 확인 항목" value={W.stats.manual} />
      </div>
      <figure className="mkt-demo-figure">
        <Image
          src={W.pageImage.src}
          width={W.pageImage.width}
          height={W.pageImage.height}
          alt="진단 대상 샘플 페이지 화면 — 데모 쇼핑몰 (특가 안내, 로그인 입력칸, 상품 표)"
          sizes="(max-width: 1100px) 100vw, 1060px"
        />
        <figcaption>진단 도구가 저장한 샘플 페이지 화면</figcaption>
      </figure>
      <div className="mkt-demo-table-wrap">
        <table className="mkt-mini-table">
          <caption className="sr-only">웹 품질 진단 위반·검토 항목 {W.findings.length}건</caption>
          <thead>
            <tr>
              <th scope="col">판정</th>
              <th scope="col">분류</th>
              <th scope="col">KWCAG</th>
              <th scope="col">내용</th>
            </tr>
          </thead>
          <tbody>
            {W.findings.map((f, i) => (
              <tr key={`${f.rule}-${i}`}>
                <td>
                  <span className={`mkt-sev ${f.status === "fail" ? "mkt-sev-high" : "mkt-sev-medium"}`}>
                    {WQ_STATUS[f.status] ?? f.status}
                  </span>
                </td>
                <td>{WQ_CATEGORY[f.category] ?? f.category}</td>
                <td className="mkt-mono">{f.kwcag ?? "—"}</td>
                <td>{f.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mkt-demo-actions">
        <DemoRunLink href="/apps/web-quality?sample=demo-shop">이 샘플로 직접 실행 — 웹 품질 진단</DemoRunLink>
        <Link className="mkt-btn mkt-btn-ghost mkt-btn-sm" href="/products/web-quality">
          웹 품질 진단 소개
        </Link>
      </div>
      <DemoSourceNote>
        자동 점검은 기계로 판별할 수 있는 항목을 찾아 줍니다. 대체 텍스트의 적절성처럼 사람이 판단할 항목은 &lsquo;사람
        확인&rsquo;으로 따로 표시됩니다.
      </DemoSourceNote>
    </section>
  );
}

function DbPanel() {
  const D = DB_WORKFLOW_DEMO;
  return (
    <section className="mkt-panel mkt-demo-section" aria-labelledby="db-title">
      <h2 id="db-title">DB 표준 점검 — 샘플 테이블정의서</h2>
      <p>
        샘플 테이블정의서의 항목명·영문명을 행정안전부 공통표준(단어·용어·도메인)과 대조한 결과입니다.
      </p>
      <div className="mkt-demo-stats">
        <DemoStat label="용어 점검 항목" value={D.std.term.total_cols} />
        <DemoStat label="검토 (표준 영문명 제안)" value={D.std.term.review_cols} tone="warn" />
        <DemoStat label="도메인 미매칭" value={D.std.domain.unmatched_cols} tone="bad" />
        <DemoStat label="도메인 검토" value={D.std.domain.review_cols} tone="warn" />
      </div>
      <div className="mkt-demo-table-wrap">
        <table className="mkt-mini-table">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">현재 영문명</th>
              <th scope="col">표준 권장</th>
              <th scope="col">사유</th>
            </tr>
          </thead>
          <tbody>
            {D.std.rows.slice(0, 6).map((r) => (
              <tr key={`${r.table}-${r.column}`}>
                <td>
                  {r.table} · {r.column}
                </td>
                <td className="mkt-mono">{r.current}</td>
                <td className="mkt-mono mkt-demo-good">{r.recommended}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mkt-demo-actions">
        <DemoRunLink href="/apps/chk-db-std?sample=table-design">이 샘플로 직접 실행 — DB 표준 점검</DemoRunLink>
        <Link className="mkt-btn mkt-btn-sm" href="/demo/db-workflow">
          설계서 → ERD → DDL → DB 적용까지 보기
        </Link>
      </div>
    </section>
  );
}

export default function DemoQualityPage() {
  return (
    <MarketingPageShell>
      <div className="mkt-demo">
        <header className="mkt-demo-hero">
          <p className="mkt-eyebrow">품질·보안 진단 데모</p>
          <h1>샘플로 실제 실행한 진단 결과</h1>
          <p className="mkt-demo-lead">
            일부러 문제를 넣은 데모 샘플(소스 프로젝트·웹 페이지·테이블정의서)을 실제 진단 도구로 실행한 결과입니다.
            탭마다 「이 샘플로 직접 실행」을 누르면 같은 샘플로 프로그램을 바로 돌려 볼 수 있습니다.
          </p>
        </header>

        <DemoTabs
          tabs={[
            { id: "source", label: "소스코드·보안" },
            { id: "web", label: "웹 품질" },
            { id: "db", label: "DB 표준" },
          ]}
          panels={{ source: <SourcePanel />, web: <WebPanel />, db: <DbPanel /> }}
        />

        <section className="mkt-panel mkt-demo-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">우리 프로젝트에 맞춰 쓰고 싶다면</h2>
          <p>점검 규칙, 보고서 양식, 점검 대상 사이트 등록을 조직에 맞춰 구성해 드립니다.</p>
          <div className="mkt-demo-actions">
            <Link className="mkt-btn mkt-btn-primary" href="/contact?tool=web-quality">
              맞춤 적용 문의
            </Link>
          </div>
          <DemoSourceNote>
            결과는 {SOURCE_SCAN_DEMO.generatedAt}에 실제 프로그램을 실행해 얻은 값이며, 손으로 만든 값은 없습니다.
          </DemoSourceNote>
        </section>
      </div>
    </MarketingPageShell>
  );
}
