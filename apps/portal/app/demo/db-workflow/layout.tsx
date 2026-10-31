import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "설계서에서 DB까지 — DB 워크플로 데모",
  description:
    "테이블정의서 업로드 → DB 표준 점검 → ERD 편집 → DDL 생성·DB 적용까지 이어지는 DB 설계 자동화 흐름 데모",
  alternates: { canonical: "/demo/db-workflow" },
  openGraph: { url: "/demo/db-workflow" },
};

export default function DemoDbWorkflowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
