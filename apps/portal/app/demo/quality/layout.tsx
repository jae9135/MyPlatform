import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { ogImages } from "@/lib/ogImage";

export const metadata: Metadata = {
  title: "품질·보안 진단 데모 — 실제 실행 결과",
  description:
    "데모 샘플 프로젝트·웹 페이지·테이블정의서를 소스코드 보안(PMD·FindSecBugs·Bandit)·웹 품질(KWCAG 2.2)·DB 표준 점검으로 실제 실행한 결과",
  alternates: { canonical: "/demo/quality" },
  openGraph: { url: "/demo/quality", images: ogImages(BRAND_NAME) },
};

export default function DemoQualityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
