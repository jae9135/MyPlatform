/** Marketing images in `public/marketing/`. Captures in `public/marketing/captures/`. */
const CAPTURES = "/marketing/captures";

export const MARKETING_IMAGES = {
  /** Text-free background illustration (no overlapping copy in image). */
  hero: "/marketing/hero-bg.png",
  workflow: "/marketing/05-workflow.jpg",
  ctaContact: "/marketing/08-cta-contact.jpg",
  toolsHub: `${CAPTURES}/tools-hub.jpg`,
} as const;

export const TOOL_THUMB: Record<string, string> = {
  "source-scan": `${CAPTURES}/source-scan.jpg`,
  "web-quality": `${CAPTURES}/web-quality.jpg`,
  "perf-test": `${CAPTURES}/perf-test.jpg`,
  "chk-db-std": `${CAPTURES}/chk-db-std.jpg`,
  "db-manager": `${CAPTURES}/db-manager.jpg`,
  "er-modeler": `${CAPTURES}/er-modeler.jpg`,
  "deliverable-manager": `${CAPTURES}/deliverable-manager.jpg`,
  "my-gantt": `${CAPTURES}/my-gantt.jpg`,
};

export function getToolThumb(slug: string): string | undefined {
  return TOOL_THUMB[slug];
}

export type ToolCategoryGroup = "quality" | "db-std" | "pm";

export const TOOL_CATEGORY_GROUPS: {
  id: ToolCategoryGroup;
  label: string;
  description: string;
}[] = [
  {
    id: "quality",
    label: "품질 · 진단",
    description: "소스코드, 웹 품질, 성능 진단 — 품질·보안·성능을 한곳에서 점검합니다.",
  },
  {
    id: "db-std",
    label: "DB · 설계",
    description: "테이블정의서 Excel 하나로 표준 점검, ERD, DB 반영까지 이어집니다.",
  },
  {
    id: "pm",
    label: "업무 · 관리",
    description: "프로젝트 산출물과 WBS·간트 일정을 웹에서 관리합니다.",
  },
];
