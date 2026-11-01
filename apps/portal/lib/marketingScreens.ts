/**
 * 상품 상세의 실제 프로그램 캡처 (데모 샘플로 실제 실행한 화면).
 * 여기에 없는 화면 ID는 기존 목업(AppScreenMockup)으로 표시됩니다.
 * homeOk=false: 일부 영역만 잘라낸 캡처라 "프로그램 첫 화면"에는 쓰지 않음.
 */
import type { ProductScreenId } from "./marketingCatalog";

export type ScreenShot = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** 브라우저 주소창에 표시할 경로 */
  path: string;
  homeOk?: boolean;
};

export const SCREEN_SHOTS: Partial<Record<ProductScreenId, ScreenShot>> = {
  "std-check": { path: "/apps/chk-db-std", src: "/marketing/screens/std-check.webp", width: 1400, height: 613, alt: "DB 표준 점검 — 테이블정의서 샘플 불러오기 화면" },
  "std-home": { path: "/apps/chk-db-std", src: "/marketing/screens/std-home.webp", width: 1400, height: 988, alt: "DB 표준 점검 결과 — 일치·검토·미매칭 분류 표" },
  "std-termgen": { path: "/apps/chk-db-std", src: "/marketing/screens/std-termgen.webp", width: 1400, height: 772, alt: "표준용어 생성 화면" },
  "web-quality-run": { path: "/apps/web-quality", src: "/marketing/screens/web-quality-run.webp", width: 1400, height: 879, alt: "웹 품질 진단 — 대상 URL·시나리오 설정 화면" },
  "web-quality-home": { path: "/apps/web-quality", src: "/marketing/screens/web-quality-home.webp", width: 1400, height: 924, alt: "웹 품질 진단 결과 — 웹표준·호환성·접근성 항목별 결과" },
  "erd-home": { path: "/apps/er-modeler", src: "/marketing/screens/erd-home.webp", width: 720, height: 417, alt: "ERD 모델러 — 테이블정의서 가져오기 미리보기", homeOk: false },
  "erd-canvas": { path: "/apps/er-modeler", src: "/marketing/screens/erd-canvas.webp", width: 1400, height: 875, alt: "ERD 모델러 — 가져온 테이블 자동 배치 캔버스" },
  "dbmgr-ddl": { path: "/apps/db-manager", src: "/marketing/screens/dbmgr-ddl.webp", width: 1400, height: 1231, alt: "DB Manager — 테이블정의서로 DDL 생성 결과" },
};

export function getScreenShot(id: ProductScreenId, context: "home" | "feature" = "feature"): ScreenShot | null {
  const s = SCREEN_SHOTS[id];
  if (!s) return null;
  if (context === "home" && s.homeOk === false) return null;
  return s;
}
