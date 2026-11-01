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
  | "perf-test-home"
  | "perf-test-run"
  | "perf-test-results"
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
    | "perf-bars"
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
          "현재 화면에서 소스 ZIP을 등록하고 진단 실행 설정을 확인합니다. 지원 분석기는 서버 환경과 프로젝트 파일 구성에 따라 실행됩니다.",
        screen: "source-scan-upload",
      },
      {
        title: "이전 진단 대비 Diff 비교",
        description:
          "진단 실행 후 결과와 이전 실행 비교 기능을 확인할 수 있습니다. 결과 목록은 실제 실행 결과에 따라 표시됩니다.",
        screen: "source-scan-diff",
      },
      {
        title: "보고서 내보내기",
        description: "진단 결과에서 제공되는 내보내기 기능으로 결과를 내려받아 검토 자료로 활용합니다.",
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
      "IPMS(잠금)·정적 소스·외부 URL 진단 모드",
      "웹표준·웹호환·웹접근성 카테고리별 결과",
      "위반 요소 스크린샷 캡처",
    ],
    featureDetails: [
      {
        title: "URL·시나리오 기반 진단 실행",
        description:
          "현재 화면은 IPMS(추가 암호), 정적(소스), 외부 URL(화면) 세 모드를 제공합니다. 정적 모드에서 Java ZIP을 입력할 수 있습니다.",
        screen: "web-quality-run",
      },
      {
        title: "카테고리별 결과 확인",
        description: "선택한 진단 모드와 실행 결과에 따라 웹 품질 점검 내용을 확인합니다.",
        screen: "web-quality-home",
      },
      {
        title: "위반 요소 스크린샷",
        description: "실행 결과가 생성되면 화면별 결과와 제공되는 보고서를 확인합니다.",
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
  "perf-test": {
    tagline: "Locust HTTP 부하 · TPS · 응답시간 · 오류율 (웹 품질 시나리오 공유)",
    homeScreen: "perf-test-home",
    features: [
      "웹 품질과 동일 시나리오·URL 후보 재사용",
      "VU·spawn rate·duration 부하 설정",
      "TPS · p95 · 오류율 · 엔드포인트별 요약",
    ],
    featureDetails: [
      {
        title: "시나리오 · URL 선택",
        description:
          "대상 탭에서 로컬 API 또는 Locust 설정을 확인하고, 등록된 대상이나 입력한 URL을 기준으로 실행을 준비합니다.",
        screen: "perf-test-run",
      },
      {
        title: "부하 설정 · 실행",
        description:
          "가상 사용자(VU), spawn rate, duration을 설정하고 Locust로 HTTP 부하 테스트를 실행합니다.",
        screen: "perf-test-home",
      },
      {
        title: "결과 · 이력",
        description:
          "실행 뒤 제공되는 TPS, 응답시간, 오류율 및 엔드포인트 통계와 이력을 확인합니다.",
        screen: "perf-test-results",
      },
    ],
    painPoints: [
      "성능 시험 시나리오를 웹 품질과 따로 관리",
      "부하 테스트 도구·결과 형식이 도구마다 다름",
    ],
    scenarios: [
      "웹 품질 시나리오 선택 → VU·duration 설정",
      "Locust 부하 실행 → job 진행률 확인",
      "TPS·p95·오류율 요약 및 이력 조회",
    ],
    customizeOptions: ["조직 전용 URL", "VU 상한", "HAR 기록", "시나리오 프리셋"],
    demoType: "perf-bars",
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
          "샘플 또는 Excel 파일을 준비하고 점검 종류를 선택해 행안부 공통표준과 대조합니다. CSV 입력은 선택 사항입니다.",
        screen: "std-check",
      },
      {
        title: "일치·검토·미매칭 분류",
        description: "파일 점검 결과가 만들어지면 일치·검토·미매칭 항목을 표에서 확인합니다.",
        screen: "std-home",
      },
      {
        title: "표준용어 생성",
        description: "화면 하단의 표준용어 생성 영역에서 항목명을 입력해 표준용어 후보를 만듭니다.",
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
      "DB 적용·데이터 관리·역동기화 탭 (암호 잠금)",
      "열려 있는 DDL 생성 화면에서 결과 확인·내보내기",
    ],
    featureDetails: [
      {
        title: "DDL 생성",
        description: "현재 기본 화면에서 테이블정의서 파일을 불러와 DDL 생성 기능을 사용합니다.",
        screen: "dbmgr-ddl",
      },
      {
        title: "DB 적용 · 데이터 관리",
        description: "DB 적용, 데이터 관리, 역동기화는 각각 암호로 잠겨 있으며 권한이 있을 때 사용할 수 있습니다.",
        screen: "dbmgr-home",
      },
      {
        title: "설계서 ↔ DB 역동기화",
        description: "역동기화 탭은 잠금 상태이며, 권한을 해제한 뒤 설계서와 DB 비교 기능을 사용할 수 있습니다.",
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
        description: "현재 화면은 새 ER Modeler 프로젝트의 빈 작업 공간입니다. 먼저 프로젝트에서 테이블을 추가하거나 가져와야 합니다.",
        screen: "erd-home",
      },
      {
        title: "관계 편집 · 검증",
        description: "테이블을 추가한 뒤 캔버스에서 모델을 구성할 수 있습니다.",
        screen: "erd-canvas",
      },
      {
        title: "설계서·다이어그램 export",
        description: "현재 작업 화면에 표시된 프로젝트 기능을 기준으로 사용하며, 가져오기·검증·내보내기는 구현 상태를 확인해 안내합니다.",
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
        description: "현재 목록에서 산출물을 검색하고 화면의 필터로 항목을 좁혀 볼 수 있습니다.",
        screen: "deliv-catalog",
      },
      {
        title: "작성 상태 관리",
        description: "목록에서 제공되는 상태 표시를 확인합니다. 현재 화면은 산출물 목록·필터 중심입니다.",
        screen: "deliv-status",
      },
      {
        title: "문서 미리보기",
        description: "현재 화면에 보이는 산출물 항목과 정보를 확인합니다.",
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
        description: "현재 화면은 WBS 표와 간트 영역으로 구성된 빈 일정 작업 화면입니다. 작업을 추가해 일정을 구성합니다.",
        screen: "gantt-split",
      },
      {
        title: "휴일 · Excel import/export",
        description: "일정 화면에서 작업을 작성하고 제공되는 일정·가져오기 기능을 사용합니다.",
        screen: "gantt-home",
      },
      {
        title: "공유 링크",
        description: "공유·내보내기 기능은 현재 앱에서 제공되는 메뉴와 저장 설정을 확인한 뒤 사용합니다.",
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
  const seo = getProductSeo(slug);

  if (slug === RECEIPT_STANDALONE.slug) {
    return {
      slug: RECEIPT_STANDALONE.slug,
      name: RECEIPT_STANDALONE.name,
      tagline: seo?.heroHeadline ?? RECEIPT_STANDALONE.tagline,
      description: seo?.seoDescription ?? RECEIPT_STANDALONE.description,
      features: seo?.seoFeatures ?? RECEIPT_STANDALONE.features,
      featureDetails: RECEIPT_STANDALONE.featureDetails,
      homeScreen: RECEIPT_STANDALONE.homeScreen,
      href: RECEIPT_STANDALONE.href,
      productHref: RECEIPT_STANDALONE.productHref,
      seo,
      isStandalone: true as const,
    };
  }
  const tool = getMarketingTool(slug);
  if (!tool) return undefined;
  return {
    slug: tool.slug,
    name: tool.app.name,
    tagline: seo?.heroHeadline ?? tool.tagline,
    description: seo?.seoDescription ?? tool.app.description,
    features: seo?.seoFeatures ?? tool.features,
    featureDetails: tool.featureDetails,
    homeScreen: tool.homeScreen,
    painPoints: tool.painPoints,
    scenarios: tool.scenarios,
    customizeOptions: tool.customizeOptions,
    href: tool.app.href,
    productHref: `/products/${tool.slug}`,
    seo,
    isStandalone: false as const,
  };
}

export { BRAND_NAME };

export const MARKETING_STATS = [
  { num: "08", label: "플랫폼 프로그램" },
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

export type ProductSeo = {
  seoTitle: string;
  heroHeadline: string;
  seoDescription: string;
  seoFeatures: string[];
};

export const HOME_SEO = {
  title: "프로젝트 자동화 플랫폼 | 소스코드·웹품질·DB·ERD·성능 진단",
  description:
    "소스코드·웹품질·DB·ERD·성능 진단부터 프로젝트 산출물 작성까지 지원하는 프로젝트 자동화 플랫폼입니다.",
  ogDescription:
    "소스코드·웹품질·DB·ERD·성능을 자동으로 진단하고 프로젝트 산출물 작성을 지원하는 개발 업무 자동화 플랫폼입니다.",
  h1Lead: "웹 품질·소스코드·DB·ERD를 자동으로 진단하는",
  h1Accent: "프로젝트 자동화 플랫폼",
  seoParagraph:
    "소스코드·웹품질·DB·ERD·성능 진단부터 프로젝트 산출물 작성까지 지원하는 프로젝트 자동화 플랫폼입니다.",
};

const PRODUCT_SEO: Record<string, ProductSeo> = {
  "source-scan": {
    seoTitle: "소스코드 품질·보안 진단 도구 | PMD·FindSecBugs·ESLint·Bandit",
    heroHeadline: "소스코드 품질과 보안 취약점을 자동으로 진단하세요",
    seoDescription:
      "소스 ZIP을 등록해 현재 서버에 설정된 분석기를 실행하고 결과를 확인하는 도구입니다. 지원 언어와 분석기는 배포 환경 및 프로젝트 파일 구성에 따라 달라집니다.",
    seoFeatures: [
      "소스 ZIP 등록 및 진단 실행",
      "진단 결과 확인",
      "이전 실행 결과 비교",
      "제공되는 결과 내보내기 기능",
    ],
  },
  "web-quality": {
    seoTitle: "웹 품질 진단 도구 | 웹표준·웹접근성·KWCAG 2.2 자동 점검",
    heroHeadline: "웹사이트의 품질과 접근성을 한 번에 점검하세요",
    seoDescription:
      "웹 품질 진단 화면에서 IPMS(추가 암호 필요), 정적 소스, 외부 URL 화면 진단 모드 중 하나를 선택합니다. 정적 모드는 Java ZIP을 입력으로 받으며, 외부 URL은 등록된 대상에 한해 점검할 수 있습니다.",
    seoFeatures: [
      "IPMS 화면 진단 (암호 필요)",
      "정적 소스 진단 (Java ZIP)",
      "등록된 외부 URL 화면 진단",
      "실행 결과와 제공되는 보고서 확인",
    ],
  },
  "perf-test": {
    seoTitle: "웹 성능 진단 도구 | Locust 부하·TPS·응답시간 측정",
    heroHeadline: "웹사이트 속도를 측정하고 성능 저하 원인을 찾아보세요",
    seoDescription:
      "Locust HTTP 부하 테스트로 페이지 응답시간, TPS, p95, 오류율을 측정합니다. 웹 품질 시나리오와 URL 후보를 재사용해 반복 테스트하고, 엔드포인트별 성능 리포트로 웹서비스 개선에 활용할 수 있습니다.",
    seoFeatures: [
      "페이지 응답시간·TPS 측정",
      "엔드포인트별 p95·오류율 분석",
      "VU·duration 부하 설정",
      "웹 품질 시나리오 URL 재사용",
      "반복 테스트 및 실행 이력",
      "결과 요약과 실행 이력 확인",
    ],
  },
  "chk-db-std": {
    seoTitle: "DB 표준 점검 도구 | 테이블·컬럼·데이터베이스 표준 자동 검사",
    heroHeadline: "데이터베이스 설계와 표준 준수 여부를 자동으로 점검하세요",
    seoDescription:
      "샘플 또는 테이블정의서 Excel을 불러와 단어·용어·도메인·코드 표준을 점검합니다. 선택 입력 CSV를 활용할 수 있으며, 표준용어 생성 기능도 화면에서 제공합니다.",
    seoFeatures: [
      "샘플 또는 Excel 파일 입력",
      "단어·용어·도메인·코드 점검 종류 선택",
      "점검 결과 표 확인",
      "표준용어 생성",
    ],
  },
  "er-modeler": {
    seoTitle: "ER Modeler | 브라우저 기반 ERD 작업 화면",
    heroHeadline: "ER Modeler에서 데이터 모델 작업을 시작하세요",
    seoDescription:
      "현재 ER Modeler 화면은 새 프로젝트의 빈 캔버스로 시작합니다. 프로젝트를 연 뒤 제공되는 모델링 도구로 데이터 구조를 구성할 수 있습니다.",
    seoFeatures: [
      "새 프로젝트 빈 캔버스에서 시작",
      "프로젝트 내 테이블 모델 구성",
      "현재 화면에서 제공되는 모델링 도구 사용",
    ],
  },
  "db-manager": {
    seoTitle: "DB 관리 도구 | 데이터베이스 테이블·컬럼·SQL 관리",
    heroHeadline: "데이터베이스 구조를 한눈에 확인하고 관리하세요",
    seoDescription:
      "DBManager는 DDL 생성 화면을 제공하며, DB 적용·데이터 관리·역동기화 탭은 추가 암호로 잠겨 있습니다. 권한이 있는 경우 각 탭의 기능을 사용할 수 있습니다.",
    seoFeatures: [
      "테이블·DDL 생성",
      "DDL 생성 화면",
      "DB 적용 탭 (암호 잠금)",
      "데이터 관리 탭 (암호 잠금)",
      "역동기화 탭 (암호 잠금)",
    ],
  },
  "deliverable-manager": {
    seoTitle: "프로젝트 산출물 관리 | 개발 문서·설계서·산출물 관리 도구",
    heroHeadline: "프로젝트에서 생성되는 다양한 개발 산출물을 체계적으로 관리하세요",
    seoDescription:
      "분석, 설계, 개발, 테스트 등 소프트웨어 개발 과정에서 생성되는 다양한 프로젝트 산출물을 체계적으로 관리할 수 있습니다. 문서의 종류와 진행 상태를 관리하여 프로젝트 산출물 관리 업무를 효율적으로 수행할 수 있습니다.",
    seoFeatures: [
      "프로젝트 산출물 관리",
      "요구사항 정의서 관리",
      "화면설계서 관리",
      "ERD 및 DB 설계서 관리",
      "테스트 산출물 관리",
      "산출물 상태 관리",
    ],
  },
  "my-gantt": {
    seoTitle: "프로젝트 일정 관리 | WBS·간트차트 기반 프로젝트 관리",
    heroHeadline: "WBS와 간트차트로 프로젝트 일정을 한눈에 관리하세요",
    seoDescription:
      "프로젝트의 업무를 WBS(Work Breakdown Structure)로 구성하고 간트차트를 이용하여 프로젝트 일정을 시각적으로 관리할 수 있습니다. 작업 기간, 진행률, 업무 간 관계를 한눈에 확인하여 프로젝트 진행 상황을 효율적으로 관리할 수 있습니다.",
    seoFeatures: [
      "WBS 작성",
      "간트차트 생성",
      "작업 기간 관리",
      "진행률 관리",
      "업무 간 일정 관리",
      "Excel import/export 및 공유 링크",
    ],
  },
};

const RECEIPT_SEO: ProductSeo = {
  seoTitle: "영수증 PDF 변환 | 영수증 이미지·사진을 PDF로 변환",
  heroHeadline: "영수증 사진을 간편하게 PDF 파일로 변환하세요",
  seoDescription:
    "스마트폰이나 PC에서 촬영한 영수증 이미지를 PDF 파일로 간편하게 변환할 수 있습니다. 여러 장의 영수증 이미지를 하나의 PDF 파일로 정리하여 보관하거나 제출할 수 있습니다.",
  seoFeatures: [
    "영수증 이미지 업로드",
    "여러 이미지 PDF 변환",
    "PDF 파일 생성",
    "영수증 자료 정리",
    "간편한 파일 다운로드",
  ],
};

export function getProductSeo(slug: string): ProductSeo | undefined {
  if (slug === RECEIPT_STANDALONE.slug) return RECEIPT_SEO;
  return PRODUCT_SEO[slug];
}

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "jae9135@gmail.com";

export const CONTACT_PHONE =
  process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || "010-6280-9135";

export const CONTACT_NOTICE =
  "※ 배포 프로그램 사용 시 문의 작성 또는 아래 연락처로 문의 바랍니다.";
