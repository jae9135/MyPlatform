import type { Metadata } from "next";
import "./app-shell.css";

/**
 * 도구 실행 화면(/apps/*)은 검색 결과에 직접 노출하지 않음 — 설명이 풍부한 /products/* 가 검색 진입점.
 * follow 는 유지해 링크는 따라가도록.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="app-shell">{children}</div>;
}
