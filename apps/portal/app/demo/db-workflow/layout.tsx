import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "설계서에서 DB까지 — DB 워크플로 데모",
  description:
    "샘플 테이블정의서 하나를 DB 표준 점검 → ERD → PostgreSQL DDL 생성 → DB 적용까지 실제로 실행한 결과를 단계별로 보여주는 데모",
  alternates: { canonical: "/demo/db-workflow" },
  openGraph: { url: "/demo/db-workflow" },
};

export default function DemoDbWorkflowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
