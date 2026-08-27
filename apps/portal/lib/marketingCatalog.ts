import { BRAND_NAME } from "@/lib/brand";
import { MARKETING_PLATFORM_APPS, type PlatformApp } from "@/lib/apps";

export type MarketingCategory = "quality" | "db-std" | "pm";

export type ProductScreenId =
  | "source-scan-home"
  | "source-scan-upload"
  | "source-scan-diff"
  | "source-scan-export"
  | "web-quality-home"
  | "web-quality-run"
  | "web-quality-capture"
  | "std-home"
  | "std-check"
  | "std-termgen"
  | "dbmgr-home"
  | "dbmgr-ddl"
  | "dbmgr-sync"
  | "erd-home"
  | "erd-canvas"
  | "erd-export"
  | "deliv-home"
  | "deliv-catalog"
  | "deliv-status"
  | "gantt-home"
  | "gantt-split"
  | "gantt-export"
  | "receipt-home"
  | "receipt-capture"
  | "receipt-pdf";

export type ProductFeatureDetail = {
  title: string;
  description: string;
  screen: ProductScreenId;
};

export type MarketingTool = {
  slug: string;
  app: PlatformApp;
  num: string;
  categoryLabel: string;
  tagline: string;
  features: string[];
  featureDetails: ProductFeatureDetail[];
  homeScreen: ProductScreenId;
  painPoints: string[];
  scenarios: string[];
  customizeOptions: string[];
  demoType:
    | "scan-filter"
    | "wq-bars"
    | "std-input"
    | "ddl-tabs"
    | "erd"
    | "deliv-status"
    | "gantt";
};

export const RECEIPT_STANDALONE = {
  slug: "receipt-to-pdf",
  name: "ReceiptToPDF",
  tagline: "영수증 촬영·갤러리 → A4 PDF (100% 기기 처리)",
  description:
    "모바일에서 영수증을 촬영하거나 갤러리에서 선택해 A4 PDF로 묶습니다. 서버 업로드 없이 기기에서만 처리됩니다.",
  features: [
    "개별 모드: 2~4장을 한 PDF 페이지에 배치",
    "일괄 모드: 사진 1장 = PDF 1페이지",
    "배경 흰색 처리, 순서 변경, IndexedDB 백업",
  ],
  featureDetails: [
    {
      title: "영수증 촬영·갤러리 선택",
      description:
        "카메라 또는 갤러리에서 영수증 사진을 고릅니다. 서버 업로드 없이 기기에서만 처리됩니다.",
      screen: "receipt-capture" as ProductScreenId,
    },
    {
      title: "A4 PDF 생성·다운로드",
      description:
        "개별/일괄 모드로 페이지를 배치하고 PDF로 내보냅니다. 배경 흰색 처리와 순서 변경을 지원합니다.",
      screen: "receipt-pdf" as ProductScreenId,
    },
  ],
  homeScreen: "receipt-home" as ProductScreenId,
  href: "/apps/receipt-to-pdf",
  productHref: "/products/receipt-to-pdf",
};

const CATEGORY_LABEL: Record<string, string> = {
  quality: "품질",
  "db-std": "DB·설계",
  pm: "업무",
};

const TOOL_META: Record<
  string,
  Omit<MarketingTool, "slug" | "app" | "num" | "categoryLabel">
> = {
  "source-scan": {
    tagline: "PMD · FindSecBugs · Bandit/ESLint — ZIP 업로드 소스·보안 점검",
    homeScreen: "source-scan-home",
    features: [
      "ZIP 업로드 시 Bandit·ESLint·PMD·SpotBugs+FindSecBugs 순차 실행",
      "이전 진단 대비 Diff(신규·해소) 비교",
      "Excel, HTML, SARIF 보고서 내보내기",
    ],
    featureDetails: [
      {
        title: "ZIP 업로드 · 다중 스캐너 실행",
        description:
          "Java/Python/TS 프로젝트 ZIP을 업로드하고 스택을 선택하면 PMD, FindSecBugs, Bandit, ESLint가 순차 실행됩니다.",
        screen: "source-scan-upload",
      },
      {
        title: "이전 진단 대비 Diff 비교",
        description:
          "심각도·스캐너별 탭으로 결함을 필터링하고, 이전 실행 대비 신규·해소 건을 비교합니다.",
        screen: "source-scan-diff",
      },
      {
        title: "보고서 내보내기",
        description: "Excel, HTML, SARIF 형식으로 진단 결과를 다운로드해 감리·CI/CD에 활용합니다.",
        screen: "source-scan-export",
      },
    ],
    painPoints: [
      "수동 코드 리뷰로는 놓치는 보안 결함",
      "Java/Python/TS 혼합 프로젝트 점검 도구 분산",
    ],
    scenarios: [
      "프로젝트 ZIP 업로드 → 진단 실행",
      "심각도·스캐너별 탭으로 결함 확인",
      "Excel/HTML 보고서 다운로드",
    ],
    customizeOptions: ["PMD ruleset", "exclude glob", "보고서 양식", "CI/CD SARIF 연동"],
    demoType: "scan-filter",
  },
  "web-quality": {
    tagline: "KWCAG 2.2 · 웹표준/호환/접근성 — Playwright + axe 런타임",
    homeScreen: "web-quality-home",
    features: [
      "IPMS·외부 URL·Java ZIP 시나리오 기반 화면 진단",
      "웹표준·웹호환·웹접근성 카테고리별 결과",
      "위반 요소 스크린샷 캡처",
    ],
    featureDetails: [
      {
        title: "URL·시나리오 기반 진단 실행",
        description:
          "IPMS URL, 외부 사이트, Java ZIP 시나리오를 선택해 Playwright + axe로 화면별 진단을 실행합니다.",
        screen: "web-quality-run",
      },
      {
        title: "카테고리별 결과 확인",
        description: "웹표준·웹호환·웹접근성(KWCAG 2.2) 탭으로 pass/fail과 심각도를 확인합니다.",
        screen: "web-quality-home",
      },
      {
        title: "위반 요소 스크린샷",
        description: "접근성·표준 위반 요소를 캡처해 Excel/ZIP 보고서에 포함합니다.",
        screen: "web-quality-capture",
      },
    ],
    painPoints: ["KWCAG·전자정부 웹품질 감리 수작업", "화면별 접근성 재현 어려움"],
    scenarios: [
      "진단 URL·시나리오 선택",
      "비동기 job으로 화면별 axe 실행",
      "캡처·Excel/ZIP 보고서",
    ],
    customizeOptions: ["IPMS 프리셋", "조직 전용 URL", "규칙·보고서 양식"],
    demoType: "wq-bars",
  },
  "chk-db-std": {
    tagline: "행안부 공통표준 단어·용어·도메인·코드 점검",
    homeScreen: "std-home",
    features: [
      "테이블정의서 Excel과 MOIS 표준 자동 매칭",
      "일치·검토·미매칭 분류",
      "표준용어 생성·단어집/용어집 export",
    ],
    featureDetails: [
      {
        title: "Excel 업로드 · 표준 점검",
        description:
          "테이블정의서 Excel을 업로드하고 단어·용어·도메인·코드 종류를 선택해 MOIS 표준과 자동 대조합니다.",
        screen: "std-check",
      },
      {
        title: "일치·검토·미매칭 분류",
        description: "점검 결과를 일치, 검토 필요, 미매칭으로 분류해 Excel로 내보냅니다.",
        screen: "std-home",
      },
      {
        title: "표준용어 생성",
        description: "한글 항목명을 입력하면 공통표준용어·영문약어를 자동 생성합니다.",
        screen: "std-termgen",
      },
    ],
    painPoints: ["설계서 명명 표준 수동 대조", "영문약어 불일치"],
    scenarios: ["Excel 업로드 → kind 선택 → 점검 실행", "결과 Excel 다운로드"],
    customizeOptions: ["조직 전용 표준 CSV", "Excel 양식", "DBManager 연동"],
    demoType: "std-input",
  },
  "db-manager": {
    tagline: "테이블정의서 → PostgreSQL DDL · DB 동기화 · 데이터 관리",
    homeScreen: "dbmgr-home",
    features: [
      "Excel → CREATE TABLE + sample INSERT",
      "스키마 적용·데이터 CSV 업로드",
      "설계서 ↔ DB diff 및 ALTER",
    ],
    featureDetails: [
      {
        title: "DDL 생성",
        description: "테이블정의서 Excel에서 PostgreSQL CREATE TABLE과 sample INSERT를 생성합니다.",
        screen: "dbmgr-ddl",
      },
      {
        title: "DB 적용 · 데이터 관리",
        description: "생성된 DDL을 DB에 적용하고 CSV로 샘플·운영 데이터를 업로드합니다.",
        screen: "dbmgr-home",
      },
      {
        title: "설계서 ↔ DB 역동기화",
        description: "DB 스키마와 설계서 Excel 간 diff를 확인하고 ALTER·병합 export를 수행합니다.",
        screen: "dbmgr-sync",
      },
    ],
    painPoints: ["설계서와 DB drift", "DDL 수작업"],
    scenarios: ["DDL 생성 → DB 적용 → 데이터 관리"],
    customizeOptions: ["DB dialect", "스키마 정책", "적용 승인 워크플로"],
    demoType: "ddl-tabs",
  },
  "er-modeler": {
    tagline: "Excel/SQL → ERD 편집 → 설계서·DDL export",
    homeScreen: "erd-home",
    features: ["ReactFlow ERD", "검증·자동 배치", "PNG/SVG/PDF 다이어그램"],
    featureDetails: [
      {
        title: "Excel/SQL → ERD import",
        description: "테이블정의서 Excel이나 SQL DDL을 가져와 ERD 캔버스에 배치합니다.",
        screen: "erd-home",
      },
      {
        title: "관계 편집 · 검증",
        description: "ReactFlow로 FK 관계를 시각 편집하고 테이블·컬럼 검증을 실행합니다.",
        screen: "erd-canvas",
      },
      {
        title: "설계서·다이어그램 export",
        description: "Excel 설계서, DDL, PNG/SVG/PDF 다이어그램으로 내보냅니다.",
        screen: "erd-export",
      },
    ],
    painPoints: ["ERD와 설계서 불일치", "FK 관계 시각화 부재"],
    scenarios: ["Excel import → 관계 편집 → export"],
    customizeOptions: ["조직 ERD 템플릿", "DDL dialect", "검증 규칙"],
    demoType: "erd",
  },
  "deliverable-manager": {
    tagline: "SI/PMO 산출물 목록·양식·참고 카탈로그",
    homeScreen: "deliv-home",
    features: ["단계·상태 필터", "산출물/양식/참고 미리보기", "작성 상태 로컬 관리"],
    featureDetails: [
      {
        title: "산출물 카탈로그 검색",
        description: "단계·유형별로 SI/PMO 산출물 목록을 검색하고 양식·참고 문서를 미리봅니다.",
        screen: "deliv-catalog",
      },
      {
        title: "작성 상태 관리",
        description: "미착수·작성중·완료 상태를 클릭해 로컬로 관리합니다.",
        screen: "deliv-status",
      },
      {
        title: "문서 미리보기",
        description: "카탈로그에 연결된 양식·참고 파일을 브라우저에서 바로 확인합니다.",
        screen: "deliv-home",
      },
    ],
    painPoints: ["산출물 목록 Excel 분산", "작성 현황 추적"],
    scenarios: ["카탈로그 검색 → 문서 미리보기 → 상태 표시"],
    customizeOptions: ["조직 catalog.json", "Storage 연동", "승인 워크플로"],
    demoType: "deliv-status",
  },
  "my-gantt": {
    tagline: "WBS·간트·공정율·공유 링크",
    homeScreen: "gantt-home",
    features: ["표+간트 split", "휴일·Excel import/export", "Supabase 공유"],
    featureDetails: [
      {
        title: "WBS · 간트 split 뷰",
        description: "표와 간트 차트를 나란히 보며 일정·공정율을 조정합니다.",
        screen: "gantt-split",
      },
      {
        title: "휴일 · Excel import/export",
        description: "조직 휴일을 반영하고 Excel로 WBS를 가져오거나 내보냅니다.",
        screen: "gantt-home",
      },
      {
        title: "공유 링크",
        description: "Supabase에 저장해 팀원과 일정표 링크를 공유합니다.",
        screen: "gantt-export",
      },
    ],
    painPoints: ["Excel 일정표 수동 관리", "공정율 rollup"],
    scenarios: ["WBS 입력 → 간트 조정 → Excel export"],
    customizeOptions: ["조직 템플릿", "컬럼·공식", "SSO"],
    demoType: "gantt",
  },
};

export function getMarketingTools(): MarketingTool[] {
  return MARKETING_PLATFORM_APPS.map((app, i) => {
    const meta = TOOL_META[app.id];
    return {
      slug: app.id,
      app,
      num: String(i + 1).padStart(2, "0"),
      categoryLabel: CATEGORY_LABEL[app.category] ?? app.category,
      ...meta,
    };
  });
}

export function getMarketingTool(slug: string): MarketingTool | undefined {
  return getMarketingTools().find((t) => t.slug === slug);
}

export function getProductBySlug(slug: string) {
  if (slug === RECEIPT_STANDALONE.slug) {
    return {
      slug: RECEIPT_STANDALONE.slug,
      name: RECEIPT_STANDALONE.name,
      tagline: RECEIPT_STANDALONE.tagline,
      description: RECEIPT_STANDALONE.description,
      features: RECEIPT_STANDALONE.features,
      featureDetails: RECEIPT_STANDALONE.featureDetails,
      homeScreen: RECEIPT_STANDALONE.homeScreen,
      href: RECEIPT_STANDALONE.href,
      productHref: RECEIPT_STANDALONE.productHref,
      isStandalone: true as const,
    };
  }
  const tool = getMarketingTool(slug);
  if (!tool) return undefined;
  return {
    slug: tool.slug,
    name: tool.app.name,
    tagline: tool.tagline,
    description: tool.app.description,
    features: tool.features,
    featureDetails: tool.featureDetails,
    homeScreen: tool.homeScreen,
    painPoints: tool.painPoints,
    scenarios: tool.scenarios,
    customizeOptions: tool.customizeOptions,
    href: tool.app.href,
    productHref: `/products/${tool.slug}`,
    isStandalone: false as const,
  };
}

export { BRAND_NAME };

export const MARKETING_STATS = [
  { num: "07", label: "플랫폼 프로그램" },
  { num: "03", label: "분류 · 품질/DB·설계/업무" },
  { num: "100%", label: "웹 브라우저 기반" },
  { num: "BETA", label: "전체 공개 상태" },
];

export const CUSTOMIZE_CARDS = [
  {
    title: "화면/양식 변경",
    body: "회사 전용 Excel, 보고서, 입력화면을 적용합니다.",
  },
  {
    title: "기능 추가",
    body: "진단 규칙, 데이터 처리, 승인·관리 기능을 추가합니다.",
  },
  {
    title: "시스템 연동",
    body: "DB, API, 기존 업무시스템과 연계합니다.",
  },
];

export const PROCESS_STEPS = [
  "문의",
  "요구사항",
  "데모 제작",
  "검수",
  "납품",
];

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "jae9135@naver.com";

export const CONTACT_PHONE =
  process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || "010-6280-9135";

export const CONTACT_NOTICE =
  "※ 배포 프로그램 사용 시 문의 작성 또는 아래 연락처로 문의 바랍니다.";
