import type { Metadata } from "next";
import { Suspense } from "react";
import { CommunityBoard } from "@/components/community/CommunityBoard";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { BRAND_NAME } from "@/lib/brand";
import { loadInitialBoard } from "@/lib/board";
import { isBoardPostType, isBoardTool } from "@/lib/boardShared";
import "../marketing.css";

export const metadata: Metadata = {
  title: "후기 · Q&A",
  description: `${BRAND_NAME} 소스코드·웹품질·DB 표준·ERD·성능 진단 도구의 실제 사용 후기와 질문·운영자 답변`,
  alternates: {
    canonical: "/community",
    // RSS 자동 탐지 (네이버·피드 리더)
    types: { "application/rss+xml": [{ url: "/community/rss.xml", title: `${BRAND_NAME} 후기 · Q&A` }] },
  },
  openGraph: {
    title: `후기 · Q&A | ${BRAND_NAME}`,
    description: `${BRAND_NAME} 도구 사용 후기와 질문·답변`,
    url: "/community",
  },
};

/** 요청마다 최신 글을 HTML 에 포함 (검색엔진이 후기·답변을 읽을 수 있도록) */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: { type?: string; tool?: string };
}) {
  const type = searchParams.type && isBoardPostType(searchParams.type) ? searchParams.type : undefined;
  const tool = searchParams.tool && isBoardTool(searchParams.tool) ? searchParams.tool : undefined;
  const initial = await loadInitialBoard({ type, tool, limit: PAGE_SIZE });

  return (
    <MarketingPageShell>
      <p className="mkt-eyebrow">COMMUNITY</p>
      <h1>후기 · Q&amp;A</h1>
      <Suspense fallback={<div className="mkt-panel">로딩…</div>}>
        <CommunityBoard initial={initial} />
      </Suspense>
    </MarketingPageShell>
  );
}
