export type AppStatus = "live" | "beta" | "planned";

export type PlatformApp = {
  id: string;
  name: string;
  description: string;
  status: AppStatus;
  href: string;
  category: string;
};

/** Supabase apps 테이블과 동기화되는 포털 기본 목록(오프라인 폴백). */
export const APPS: PlatformApp[] = [
  {
    id: "chk-db-std",
    name: "DB 표준 점검 도구",
    description: "행안부 공통표준 단어/용어/도메인/코드 점검",
    status: "beta",
    href: "/apps/chk-db-std",
    category: "db-std",
  },
  {
    id: "db-manager",
    name: "DBManager",
    description: "테이블정의서 → PostgreSQL DDL / 데이터 관리",
    status: "beta",
    href: "/apps/db-manager",
    category: "db-std",
  },
  {
    id: "deliverable-manager",
    name: "DeliverableManager",
    description: "산출물 목록·문서 조회",
    status: "planned",
    href: "/apps/deliverable-manager",
    category: "pm",
  },
  {
    id: "receipt-to-pdf",
    name: "ReceiptToPDF",
    description: "영수증 촬영·갤러리 → A4 PDF",
    status: "beta",
    href: "/apps/receipt-to-pdf",
    category: "mobile",
  },
  {
    id: "my-gantt",
    name: "MyGantt",
    description: "일정/간트 관리",
    status: "beta",
    href: "/apps/my-gantt",
    category: "pm",
  },
];
