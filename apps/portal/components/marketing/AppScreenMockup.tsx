"use client";

import type { ProductFeatureDetail, ProductScreenId } from "@/lib/marketingCatalog";

type Props = {
  screen: ProductScreenId;
  label?: string;
};

export function AppScreenMockup({ screen, label }: Props) {
  return (
    <div className="mkt-screen-wrap">
      <div className="mkt-browser">
        <div className="mkt-browser-bar">
          <span className="mkt-browser-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="mkt-browser-url">{label ?? screenLabel(screen)}</span>
        </div>
        <div className="mkt-browser-body">{renderScreen(screen)}</div>
      </div>
    </div>
  );
}

export function ProductDetailScreens({
  homeScreen,
  featureDetails,
  appHref,
}: {
  homeScreen: ProductScreenId;
  featureDetails: ProductFeatureDetail[];
  appHref: string;
}) {
  return (
    <div className="mkt-product-screens">
      <section className="mkt-product-screen-block">
        <h2>프로그램 첫 화면</h2>
        <p className="mkt-product-screen-desc">
          베타 프로그램에서 실행하면 아래와 같은 시작 화면으로 진입합니다.
        </p>
        <AppScreenMockup screen={homeScreen} label={appHref} />
      </section>

      <section className="mkt-product-screen-block">
        <h2>기능별 설명 · 화면</h2>
        <p className="mkt-product-screen-desc">주요 기능마다 실제 화면 구성을 함께 확인할 수 있습니다.</p>
        <div className="mkt-feature-screens">
          {featureDetails.map((f, i) => (
            <article key={f.title} className="mkt-feature-screen-item">
              <div className="mkt-feature-screen-text">
                <span className="mkt-feature-num">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.description}</p>
                </div>
              </div>
              <AppScreenMockup screen={f.screen} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function screenLabel(screen: ProductScreenId): string {
  const map: Partial<Record<ProductScreenId, string>> = {
    "source-scan-home": "/apps/source-scan",
    "web-quality-home": "/apps/web-quality",
    "perf-test-home": "/apps/perf-test",
    "std-home": "/apps/chk-db-std",
    "dbmgr-home": "/apps/db-manager",
    "erd-home": "/apps/er-modeler",
    "deliv-home": "/apps/deliverable-manager",
    "gantt-home": "/apps/my-gantt",
    "receipt-home": "/apps/receipt-to-pdf",
  };
  return map[screen] ?? "/apps";
}

function renderScreen(screen: ProductScreenId) {
  switch (screen) {
    case "source-scan-home":
      return (
        <DarkApp title="소스코드·보안 진단">
          <DarkPanel title="진단 실행">
            <DarkRow label="ZIP 파일" value="project.zip 선택됨" />
            <DarkRow label="스택" value="Java + Python + TS" />
            <DarkBtn primary>진단 실행</DarkBtn>
          </DarkPanel>
          <DarkTabs items={["전체", "HIGH", "MED", "LOW", "Diff"]} active={0} />
          <DarkTable cols={["심각도", "파일", "메시지"]} rows={[["HIGH", "auth.py:44", "하드코딩 자격증명"]]} />
        </DarkApp>
      );
    case "source-scan-upload":
      return (
        <DarkApp title="소스코드·보안 진단">
          <DarkPanel title="ZIP 업로드">
            <div className="mkt-mock-drop">project.zip · 12.4 MB</div>
            <DarkCheck label="PMD" checked />
            <DarkCheck label="FindSecBugs" checked />
            <DarkCheck label="Bandit / ESLint" checked />
            <DarkBtn primary>진단 실행</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "source-scan-diff":
      return (
        <DarkApp title="소스코드·보안 진단">
          <DarkTabs items={["전체", "Diff", "HIGH", "MED"]} active={1} />
          <DarkTable
            cols={["상태", "파일", "규칙"]}
            rows={[
              ["신규", "upload.ts", "입력값 검증"],
              ["해소", "db.py", "SQL bind OK"],
            ]}
          />
        </DarkApp>
      );
    case "source-scan-export":
      return (
        <DarkApp title="소스코드·보안 진단">
          <DarkPanel title="보고서 내보내기">
            <DarkBtn>Excel (.xlsx)</DarkBtn>
            <DarkBtn>HTML 보고서</DarkBtn>
            <DarkBtn primary>SARIF (CI/CD)</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "web-quality-home":
      return (
        <DarkApp title="웹 품질 진단">
          <DarkTabs items={["전체", "웹표준", "웹호환", "웹접근성", "캡처"]} active={0} />
          <DarkBars items={[
            { label: "웹표준", pct: 90, color: "#3ecf8e" },
            { label: "웹호환", pct: 78, color: "#f0b429" },
            { label: "웹접근성", pct: 74, color: "#ff7b72" },
          ]} />
        </DarkApp>
      );
    case "web-quality-run":
      return (
        <DarkApp title="웹 품질 진단">
          <DarkPanel title="진단 설정">
            <DarkRow label="모드" value="IPMS URL" />
            <DarkRow label="URL" value="http://.../ipms.online/" />
            <DarkCheck label="웹표준" checked />
            <DarkCheck label="웹접근성 (KWCAG 2.2)" checked />
            <DarkBtn primary>진단 시작</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "web-quality-capture":
      return (
        <DarkApp title="웹 품질 진단">
          <div className="mkt-mock-capture-grid">
            <div className="mkt-mock-capture">
              <div className="mkt-mock-capture-img" />
              <span>메인 · alt 누락</span>
            </div>
            <div className="mkt-mock-capture">
              <div className="mkt-mock-capture-img" />
              <span>로그인 · label 없음</span>
            </div>
          </div>
        </DarkApp>
      );
    case "perf-test-home":
      return (
        <DarkApp title="성능 진단">
          <DarkPanel title="부하 설정">
            <DarkRow label="대상" value="MyGantt (포털)" />
            <DarkRow label="VU" value="5" />
            <DarkRow label="Duration" value="30초" />
            <DarkBtn primary>성능검사 실행</DarkBtn>
          </DarkPanel>
          <DarkBars items={[
            { label: "TPS", pct: 82, color: "#3ecf8e" },
            { label: "p95 (ms)", pct: 65, color: "#f0b429" },
            { label: "오류율", pct: 8, color: "#ff7b72" },
          ]} />
        </DarkApp>
      );
    case "perf-test-run":
      return (
        <DarkApp title="성능 진단">
          <DarkPanel title="시나리오 선택">
            <DarkCheck label="MyGantt 홈" checked />
            <DarkCheck label="일정 편집" checked />
            <DarkCheck label="공유 링크" checked />
            <DarkRow label="Base URL" value="http://127.0.0.1:3000" />
            <DarkBtn primary>시나리오 불러오기</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "perf-test-results":
      return (
        <DarkApp title="성능 진단">
          <DarkTable
            cols={["엔드포인트", "요청", "avg ms", "p95"]}
            rows={[
              ["GET /", "420", "48", "92"],
              ["GET /apps/my-gantt", "380", "62", "118"],
              ["POST /api/...", "95", "210", "340"],
            ]}
          />
          <DarkPanel title="요약">
            <DarkRow label="TPS" value="28.4" />
            <DarkRow label="오류율" value="0.2%" />
          </DarkPanel>
        </DarkApp>
      );
    case "std-home":
      return (
        <DarkApp title="DB 표준 점검">
          <DarkTabs items={["점검", "표준용어 생성", "샘플"]} active={0} />
          <DarkPanel title="테이블정의서 업로드">
            <DarkRow label="파일" value="table_def.xlsx" />
            <DarkRow label="종류" value="용어 · 도메인" />
            <DarkBtn primary>점검 실행</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "std-check":
      return (
        <DarkApp title="DB 표준 점검">
          <DarkTable
            cols={["항목", "표준", "결과"]}
            rows={[
              ["고객명", "CUST_NM", "일치"],
              ["주문일", "—", "미매칭"],
            ]}
          />
        </DarkApp>
      );
    case "std-termgen":
      return (
        <DarkApp title="DB 표준 점검">
          <DarkPanel title="표준용어 생성">
            <div className="mkt-mock-textarea">고객명{"\n"}주문일자{"\n"}상세주소</div>
            <DarkBtn primary>생성 실행</DarkBtn>
            <DarkTable cols={["한글", "영문약어"]} rows={[["고객명", "CUST_NM"]]} />
          </DarkPanel>
        </DarkApp>
      );
    case "dbmgr-home":
      return (
        <DarkApp title="DBManager">
          <DarkTabs items={["DDL 생성", "DB 적용", "데이터", "역동기화"]} active={0} />
          <DarkPanel title="테이블정의서">
            <DarkRow label="Excel" value="design.xlsx · 8 tables" />
            <DarkBtn primary>DDL 생성</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "dbmgr-ddl":
      return (
        <DarkApp title="DBManager">
          <pre className="mkt-mock-code">{`CREATE TABLE customer (
  cust_id varchar(20) PRIMARY KEY,
  cust_nm varchar(100) NOT NULL
);`}</pre>
        </DarkApp>
      );
    case "dbmgr-sync":
      return (
        <DarkApp title="DBManager">
          <DarkPanel title="설계서 ↔ DB diff">
            <DarkRow label="추가 테이블" value="2" />
            <DarkRow label="변경 컬럼" value="5" />
            <DarkBtn primary>ALTER 적용</DarkBtn>
            <DarkBtn>Excel 병합 export</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "erd-home":
      return (
        <DarkApp title="ER Modeler">
          <DarkPanel title="Import">
            <DarkRow label="소스" value="table_def.xlsx" />
            <DarkBtn primary>ERD 열기</DarkBtn>
          </DarkPanel>
          <ErdMini />
        </DarkApp>
      );
    case "erd-canvas":
      return (
        <DarkApp title="ER Modeler">
          <ErdMini large />
        </DarkApp>
      );
    case "erd-export":
      return (
        <DarkApp title="ER Modeler">
          <DarkPanel title="Export">
            <DarkBtn>Excel 설계서</DarkBtn>
            <DarkBtn>PostgreSQL DDL</DarkBtn>
            <DarkBtn primary>PNG / SVG / PDF</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "deliv-home":
      return (
        <DarkApp title="DeliverableManager">
          <DarkRow label="검색" value="테이블정의서" />
          <DarkTable cols={["산출물", "단계", "유형"]} rows={[["테이블정의서", "설계", "양식"]]} />
        </DarkApp>
      );
    case "deliv-catalog":
      return (
        <DarkApp title="DeliverableManager">
          <DarkTabs items={["전체", "착수", "분석", "설계", "구현"]} active={0} />
          <DarkTable
            cols={["산출물", "양식", "참고"]}
            rows={[
              ["착수보고서", "O", "O"],
              ["요구사항정의서", "O", "—"],
            ]}
          />
        </DarkApp>
      );
    case "deliv-status":
      return (
        <DarkApp title="DeliverableManager">
          <DarkTable
            cols={["산출물", "상태"]}
            rows={[
              ["착수보고서", "완료"],
              ["요구사항정의서", "작성중"],
              ["테이블정의서", "미착수"],
            ]}
          />
        </DarkApp>
      );
    case "gantt-home":
      return (
        <DarkApp title="MyGantt">
          <DarkTabs items={["WBS", "간트", "설정"]} active={0} />
          <DarkTable cols={["WBS", "기간", "공정율"]} rows={[["1.1 요구분석", "5일", "100%"]]} />
        </DarkApp>
      );
    case "gantt-split":
      return (
        <DarkApp title="MyGantt">
          <div className="mkt-mock-gantt-split">
            <div className="mkt-mock-gantt-table">
              <div>1.1 요구분석</div>
              <div>1.2 설계</div>
              <div>2.1 개발</div>
            </div>
            <div className="mkt-mock-gantt-chart">
              <div className="bar done" style={{ left: "0%", width: "35%" }} />
              <div className="bar done" style={{ left: "10%", width: "30%" }} />
              <div className="bar" style={{ left: "35%", width: "40%" }} />
            </div>
          </div>
        </DarkApp>
      );
    case "gantt-export":
      return (
        <DarkApp title="MyGantt">
          <DarkPanel title="공유 · Export">
            <DarkRow label="공유 링크" value="mygantt/abc123" />
            <DarkBtn>Excel export</DarkBtn>
            <DarkBtn primary>링크 복사</DarkBtn>
          </DarkPanel>
        </DarkApp>
      );
    case "receipt-home":
      return (
        <MobileApp title="ReceiptToPDF">
          <div className="mkt-mock-phone-grid">
            <div className="shot" />
            <div className="shot" />
          </div>
          <DarkBtn primary>PDF 만들기</DarkBtn>
        </MobileApp>
      );
    case "receipt-capture":
      return (
        <MobileApp title="ReceiptToPDF">
          <div className="mkt-mock-camera">📷 촬영 · 갤러리</div>
          <div className="mkt-mock-phone-grid">
            <div className="shot on" />
            <div className="shot on" />
            <div className="shot" />
          </div>
        </MobileApp>
      );
    case "receipt-pdf":
      return (
        <MobileApp title="ReceiptToPDF">
          <div className="mkt-mock-pdf">A4 PDF · 3페이지</div>
          <DarkBtn primary>다운로드</DarkBtn>
        </MobileApp>
      );
    default:
      return <DarkApp title="Program">화면 미리보기</DarkApp>;
  }
}

function DarkApp({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mkt-mock-app">
      <div className="mkt-mock-nav">← {title}</div>
      <div className="mkt-mock-content">{children}</div>
    </div>
  );
}

function MobileApp({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mkt-mock-mobile">
      <div className="mkt-mock-mobile-head">{title}</div>
      <div className="mkt-mock-mobile-body">{children}</div>
    </div>
  );
}

function DarkPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mkt-mock-panel">
      <div className="mkt-mock-panel-title">{title}</div>
      {children}
    </div>
  );
}

function DarkRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mkt-mock-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DarkBtn({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return <button type="button" className={`mkt-mock-btn${primary ? " primary" : ""}`}>{children}</button>;
}

function DarkCheck({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <label className="mkt-mock-check">
      <input type="checkbox" readOnly checked={checked} />
      {label}
    </label>
  );
}

function DarkTabs({ items, active }: { items: string[]; active: number }) {
  return (
    <div className="mkt-mock-tabs">
      {items.map((t, i) => (
        <span key={t} className={i === active ? "on" : ""}>
          {t}
        </span>
      ))}
    </div>
  );
}

function DarkTable({ cols, rows }: { cols: string[]; rows: string[][] }) {
  return (
    <table className="mkt-mock-table">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.join("-")}>
            {row.map((cell) => (
              <td key={cell}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DarkBars({ items }: { items: { label: string; pct: number; color: string }[] }) {
  return (
    <div className="mkt-mock-bars">
      {items.map((b) => (
        <div key={b.label}>
          <div className="mkt-mock-bar-label">{b.label}</div>
          <div className="mkt-mock-bar-track">
            <div className="mkt-mock-bar-fill" style={{ width: `${b.pct}%`, background: b.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErdMini({ large }: { large?: boolean }) {
  return (
    <svg className={`mkt-mock-erd${large ? " large" : ""}`} viewBox="0 0 320 140" aria-hidden>
      <rect x="20" y="30" width="100" height="50" rx="4" fill="#1a222c" stroke="#4fd1e8" />
      <text x="70" y="52" fill="#e8eef4" fontSize="10" textAnchor="middle">
        CUSTOMER
      </text>
      <rect x="190" y="30" width="100" height="50" rx="4" fill="#1a222c" stroke="#8b9aab" />
      <text x="240" y="52" fill="#e8eef4" fontSize="10" textAnchor="middle">
        ORDERS
      </text>
      <line x1="120" y1="55" x2="190" y2="55" stroke="#4fd1e8" strokeWidth="1.5" />
    </svg>
  );
}
