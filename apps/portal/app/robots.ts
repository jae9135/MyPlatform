import type { MetadataRoute } from "next";
import { getSiteUrl, isIndexableDeployment } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  // Vercel 미리보기 배포: 전체 수집 금지 (운영 도메인과 중복 색인 방지)
  if (!isIndexableDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // 관리자·로그인·서버 API 는 검색 결과에 나올 필요 없음
      disallow: ["/admin", "/api/", "/login"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
