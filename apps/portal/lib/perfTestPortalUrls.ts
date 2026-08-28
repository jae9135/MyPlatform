export type PerfPortalUrlItem = {
  id: string;
  name: string;
  path: string;
  description?: string;
  public_access?: boolean;
  requires_auth?: boolean;
  recommended?: boolean;
};

/** 포털 manifest 기준 — API 없이도 URL 체크리스트 표시 */
export const PERF_TEST_PORTAL_URLS: PerfPortalUrlItem[] = [
  {
    id: "portal-home",
    name: "포털 홈",
    path: "/",
    description: "앱 카탈로그 · MyPlatform 메인",
    public_access: true,
    requires_auth: false,
    recommended: true,
  },
  {
    id: "chk-db-std",
    name: "DB 표준 점검",
    path: "/apps/chk-db-std",
    description: "행안부 공통표준 단어/용어/도메인/코드 점검",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "db-manager",
    name: "DBManager",
    path: "/apps/db-manager",
    description: "테이블정의서 → PostgreSQL DDL / 데이터 관리",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "er-modeler",
    name: "ER Modeler",
    path: "/apps/er-modeler",
    description: "테이블정의서 → ERD 편집 → 설계서 내보내기",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "deliverable-manager",
    name: "DeliverableManager",
    path: "/apps/deliverable-manager",
    description: "산출물 목록 조회",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "my-gantt",
    name: "MyGantt",
    path: "/apps/my-gantt",
    description: "일정/간트 관리",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "receipt-to-pdf",
    name: "ReceiptToPDF",
    path: "/apps/receipt-to-pdf",
    description: "영수증 촬영·갤러리 → A4 PDF",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "source-scan",
    name: "소스코드·보안 진단",
    path: "/apps/source-scan",
    description: "PMD · FindSecBugs 소스 점검",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "web-quality",
    name: "웹 품질 진단",
    path: "/apps/web-quality",
    description: "KWCAG · 접근성 · 웹표준 진단",
    requires_auth: true,
    recommended: false,
  },
  {
    id: "perf-test",
    name: "성능 진단",
    path: "/apps/perf-test",
    description: "Locust HTTP 부하 테스트",
    requires_auth: true,
    recommended: false,
  },
];

export function getDefaultPerfPortalPaths(): string[] {
  const rec = PERF_TEST_PORTAL_URLS.filter((x) => x.recommended !== false).map((x) => x.path);
  return rec.length ? rec : ["/"];
}

export function perfPortalUrlsPayload() {
  return {
    ok: true,
    items: PERF_TEST_PORTAL_URLS,
    defaults_selected: getDefaultPerfPortalPaths(),
  };
}
