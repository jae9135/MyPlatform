/**
 * DBManager 의 "운영 DB 에 닿는" API 판별 — 포털 프록시에서 DB 잠금 해제 여부를 확인할 때 사용.
 * apps/api/main.py `_is_db_access_path()` 와 같은 규칙.
 *
 * 잠그지 않는 것: 샘플 다운로드, 설계서 검증, DDL 생성(validate/generate), 연결 상태(db-status)
 */
const DB_ACCESS_PATH = /^v1\/db-manager\/(run-events|schemas|export-design|data-upload|data-row|data-delete|diff|apply-alter|apply)(\/|$)/;

export function isDbAccessPath(path: string): boolean {
  return DB_ACCESS_PATH.test(path.replace(/^\/+/, ""));
}

export const DB_LOCKED_DETAIL =
  "DB 조회·적용·데이터 관리는 별도 암호 확인이 필요합니다. 화면의 「DB 잠금 해제」를 눌러 암호를 입력하세요.";
