import type { Metadata } from "next";

/** 관리자 화면 — 검색 노출 금지 */
export const metadata: Metadata = {
  title: "관리",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
