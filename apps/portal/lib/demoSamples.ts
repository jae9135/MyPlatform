/**
 * 데모 페이지의 "이 샘플로 직접 실행" — 실제 프로그램을 샘플이 불러와진 상태로 엽니다.
 *
 * 사용: /apps/chk-db-std?sample=table-design
 * 샘플 파일은 포털 public/samples/demo/ 에 있어 API 서버가 잠들어 있어도 즉시 불러옵니다.
 */

export type DemoSampleId = "table-design" | "demo-shop";

type SampleFile = { url: string; filename: string; type: string };

const SAMPLE_FILES: Record<DemoSampleId, SampleFile> = {
  // 테이블정의서 6개 테이블 · 14개 컬럼 · FK 4개
  "table-design": {
    url: "/samples/demo/table-design.sample.xlsx",
    filename: "테이블정의서_샘플.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  // 일부러 보안 약점을 넣은 Java·Python 샘플 프로젝트 (컴파일된 class 포함)
  "demo-shop": {
    url: "/samples/demo/demo-shop.zip",
    filename: "demo-shop.zip",
    type: "application/zip",
  },
};

/** 웹 품질 진단용 샘플 페이지 (일부러 접근성·표준 문제를 넣은 정적 페이지) */
export const DEMO_WEB_SAMPLE_PATH = "/samples/demo-shop/index.html";

export function demoWebSampleUrl(): string {
  return `${window.location.origin}${DEMO_WEB_SAMPLE_PATH}`;
}

/**
 * 주소의 ?sample= 값을 읽고 주소에서 지웁니다(새로고침 시 다시 불러오지 않도록).
 * 허용된 샘플 id 가 아니면 null.
 */
export function takeDemoSampleParam(allowed: readonly DemoSampleId[]): DemoSampleId | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("sample");
  if (!raw) return null;
  url.searchParams.delete("sample");
  window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
  return (allowed as readonly string[]).includes(raw) ? (raw as DemoSampleId) : null;
}

export async function fetchDemoSampleFile(id: DemoSampleId): Promise<File> {
  const meta = SAMPLE_FILES[id];
  const res = await fetch(meta.url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`샘플 파일을 불러오지 못했습니다 (${res.status})`);
  const blob = await res.blob();
  return new File([blob], meta.filename, { type: meta.type });
}

export const DEMO_SAMPLE_LOADED_MSG = "데모 샘플을 불러왔습니다 — 실행 버튼을 눌러 결과를 확인하세요.";
