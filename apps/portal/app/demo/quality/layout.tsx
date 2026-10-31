import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "품질·보안 진단 데모",
  description:
    "소스코드 보안(PMD·FindSecBugs)·웹 품질(KWCAG 2.2·웹표준)·성능 진단 결과를 미리 보는 데모 화면",
  alternates: { canonical: "/demo/quality" },
  openGraph: { url: "/demo/quality" },
};

export default function DemoQualityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
