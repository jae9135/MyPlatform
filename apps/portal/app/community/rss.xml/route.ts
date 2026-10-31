import { BRAND_NAME } from "@/lib/brand";
import { isBoardConfigured, listPublishedPosts } from "@/lib/board";
import { BOARD_TYPE_LABEL, type BoardPublicPost } from "@/lib/boardShared";
import { absoluteUrl, isIndexableDeployment } from "@/lib/siteUrl";

/**
 * 후기·Q&A RSS 2.0 피드 — 네이버 서치어드바이저 「RSS 제출」용.
 * 게시된(published) 글만, 최신 30건. 10분 캐시.
 */
export const runtime = "nodejs";
export const revalidate = 600;

const FEED_SIZE = 30;

function xml(s: string): string {
  return s
    // XML 1.0 에서 허용되지 않는 제어문자 제거
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function postLink(p: BoardPublicPost): string {
  const q = p.tool ? `?tool=${encodeURIComponent(p.tool)}` : "";
  return `${absoluteUrl("/community")}${q}#post-${p.id}`;
}

function itemXml(p: BoardPublicPost): string {
  const title = `[${BOARD_TYPE_LABEL[p.post_type]}] ${p.title}`;
  const rating = p.post_type === "review" && p.rating ? `별점 ${p.rating}/5 · ` : "";
  const answer = p.answer ? `\n\n[운영자 답변] ${p.answer}` : "";
  const description = `${rating}${p.tool_label}\n\n${p.body}${answer}`;
  return [
    "    <item>",
    `      <title>${xml(title)}</title>`,
    `      <link>${xml(postLink(p))}</link>`,
    `      <guid isPermaLink="false">${xml(`board-post-${p.id}`)}</guid>`,
    `      <description>${xml(description)}</description>`,
    `      <category>${xml(p.tool_label)}</category>`,
    `      <dc:creator>${xml(p.nickname)}</dc:creator>`,
    `      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>`,
    "    </item>",
  ].join("\n");
}

export async function GET() {
  let posts: BoardPublicPost[] = [];
  if (isBoardConfigured()) {
    try {
      posts = (await listPublishedPosts({ limit: FEED_SIZE })).rows;
    } catch {
      posts = [];
    }
  }

  const self = absoluteUrl("/community/rss.xml");
  const lastBuild = posts[0] ? new Date(posts[0].created_at) : new Date();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(`${BRAND_NAME} 후기 · Q&A`)}</title>
    <link>${xml(absoluteUrl("/community"))}</link>
    <description>${xml(`${BRAND_NAME} 소스코드·웹품질·DB 표준·ERD·성능 진단 도구의 사용 후기와 질문·운영자 답변`)}</description>
    <language>ko</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <atom:link href="${xml(self)}" rel="self" type="application/rss+xml" />
${posts.map(itemXml).join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=600, stale-while-revalidate=3600",
      // 미리보기 배포는 피드도 색인 금지
      ...(isIndexableDeployment() ? {} : { "x-robots-tag": "noindex" }),
    },
  });
}
