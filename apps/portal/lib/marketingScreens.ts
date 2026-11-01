/** 제품 상세 페이지에 표시할 현재 프로그램 화면 캡처. */
import type { ProductScreenId } from "./marketingCatalog";

export type ScreenShot = {
  src: string;
  width: number;
  height: number;
  alt: string;
  path: string;
  homeOk?: boolean;
};

const capture = (src: string, path: string, alt: string, height = 1000): ScreenShot => ({
  src: `/marketing/screens/${src}`,
  path,
  alt,
  width: 1440,
  height,
});

const current = {
  source: capture("source-scan-current.png", "/apps/source-scan", "소스코드 진단 현재 설정 화면", 510),
  web: capture("web-quality-current.png", "/apps/web-quality", "웹 품질 진단의 현재 모드 및 설정 화면"),
  perf: capture("perf-test-current.png", "/apps/perf-test", "성능 진단의 현재 실행 설정 화면"),
  std: capture("std-current.png", "/apps/chk-db-std", "DB 표준 점검의 현재 업로드 및 점검 설정 화면"),
  db: capture("db-manager-current.png", "/apps/db-manager", "DBManager의 현재 탭과 DDL 생성 화면"),
  erd: capture("er-modeler-current.png", "/apps/er-modeler", "ER Modeler의 현재 빈 프로젝트 화면"),
  deliverable: capture("deliverable-manager-current.png", "/apps/deliverable-manager", "산출물 관리의 현재 목록과 필터 화면"),
  receipt: capture("receipt-to-pdf-current.png", "/apps/receipt-to-pdf", "ReceiptToPDF의 현재 도구 화면"),
  gantt: capture("my-gantt-current.png", "/apps/my-gantt", "MyGantt의 현재 빈 일정 화면"),
};

export const SCREEN_SHOTS: Partial<Record<ProductScreenId, ScreenShot>> = {
  "source-scan-home": current.source,
  "source-scan-upload": current.source,
  "source-scan-diff": current.source,
  "source-scan-export": current.source,
  "web-quality-home": current.web,
  "web-quality-run": current.web,
  "web-quality-capture": current.web,
  "perf-test-home": current.perf,
  "perf-test-run": current.perf,
  "perf-test-results": current.perf,
  "std-home": current.std,
  "std-check": current.std,
  "std-termgen": current.std,
  "dbmgr-home": current.db,
  "dbmgr-ddl": current.db,
  "dbmgr-sync": current.db,
  "erd-home": current.erd,
  "erd-canvas": current.erd,
  "erd-export": current.erd,
  "deliv-home": current.deliverable,
  "deliv-catalog": current.deliverable,
  "deliv-status": current.deliverable,
  "gantt-home": current.gantt,
  "gantt-split": current.gantt,
  "gantt-export": current.gantt,
  "receipt-home": current.receipt,
  "receipt-capture": current.receipt,
  "receipt-pdf": current.receipt,
};

export function getScreenShot(id: ProductScreenId, _context: "home" | "feature" = "feature"): ScreenShot | null {
  return SCREEN_SHOTS[id] ?? null;
}
