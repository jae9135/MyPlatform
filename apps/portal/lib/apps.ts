export type AppStatus = "live" | "beta" | "planned";

export type PlatformApp = {
  id: string;
  name: string;
  description: string;
  status: AppStatus;
  href: string;
  category: string;
  /** Show on internal /workspace hub (platform tools). */
  showInPlatformHub?: boolean;
  /** Show on public marketing home tool catalog. */
  showInMarketingCatalog?: boolean;
};

/** Supabase apps 테이블과 동기화되는 포털 기본 목록(오프라인 폴백). */
export const APPS: PlatformApp[] = [
  {
    id: "source-scan",
    name: "소스코드·보안 진단",
    description: "PMD · FindSecBugs 기준 — Python/TS/Java 소스 점검·보고서",
    status: "beta",
    href: "/apps/source-scan",
    category: "quality",
    showInPlatformHub: true,
    showInMarketingCatalog: true,
  },
  {
    id: "web-quality",
    name: "웹 품질 진단",
    description: "KWCAG 2.2 · 웹표준/호환/접근성 — ER Modeler 진단·보고서",
    status: "beta",
    href: "/apps/web-quality",
    category: "quality",
    showInPlatformHub: true,
    showInMarketingCatalog: true,
  },
  {
    id: "chk-db-std",
    name: "DB 표준 점검 도구",
    description: "행안부 공통표준 단어/용어/도메인/코드 점검",
    status: "beta",
    href: "/apps/chk-db-std",
    category: "db-std",
    showInPlatformHub: true,
    showInMarketingCatalog: true,
  },
  {
    id: "db-manager",
    name: "DBManager",
    description: "테이블정의서 → PostgreSQL DDL / 데이터 관리",
    status: "beta",
    href: "/apps/db-manager",
    category: "db-std",
    showInPlatformHub: true,
    showInMarketingCatalog: true,
  },
  {
    id: "er-modeler",
    name: "ER Modeler",
    description: "테이블정의서 → ERD 편집 → 설계서 내보내기",
    status: "beta",
    href: "/apps/er-modeler",
    category: "db-std",
    showInPlatformHub: true,
    showInMarketingCatalog: true,
  },
  {
    id: "deliverable-manager",
    name: "DeliverableManager",
    description: "산출물 목록 조회 (공개 테스트 껍데기)",
    status: "beta",
    href: "/apps/deliverable-manager",
    category: "pm",
    showInPlatformHub: true,
    showInMarketingCatalog: true,
  },
  {
    id: "receipt-to-pdf",
    name: "ReceiptToPDF",
    description: "영수증 촬영·갤러리 → A4 PDF",
    status: "beta",
    href: "/apps/receipt-to-pdf",
    category: "mobile",
    showInPlatformHub: false,
    showInMarketingCatalog: false,
  },
  {
    id: "my-gantt",
    name: "MyGantt",
    description: "일정/간트 관리",
    status: "beta",
    href: "/apps/my-gantt",
    category: "pm",
    showInPlatformHub: true,
    showInMarketingCatalog: true,
  },
];

export const PLATFORM_APPS = APPS.filter((a) => a.showInPlatformHub !== false);

export const STANDALONE_APPS = APPS.filter((a) => a.showInPlatformHub === false);

export const MARKETING_PLATFORM_APPS = APPS.filter(
  (a) => a.showInMarketingCatalog !== false,
);
