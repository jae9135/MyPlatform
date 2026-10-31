/** schema.org 구조화 데이터 — 화면에 실제로 보이는 정보만 넣습니다 (검색엔진 정책). */
import { BRAND_NAME } from "@/lib/brand";
import { HOME_SEO, CONTACT_EMAIL } from "@/lib/marketingCatalog";
import { absoluteUrl, getSiteUrl } from "@/lib/siteUrl";
import type { BoardPublicPost, BoardStats } from "@/lib/boardShared";

function organization() {
  return {
    "@type": "Organization",
    "@id": `${getSiteUrl()}/#organization`,
    name: BRAND_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/marketing/09-platform-badge.png"),
    email: CONTACT_EMAIL,
  };
}

/** 홈 — 사이트·운영 주체 */
export function homeJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      {
        "@type": "WebSite",
        "@id": `${getSiteUrl()}/#website`,
        name: BRAND_NAME,
        url: absoluteUrl("/"),
        description: HOME_SEO.description,
        inLanguage: "ko-KR",
        publisher: { "@id": `${getSiteUrl()}/#organization` },
      },
    ],
  };
}

type ProductInput = {
  slug: string;
  name: string;
  description: string;
  features: readonly string[];
  isStandalone?: boolean;
};

/**
 * 상품 상세 — SoftwareApplication.
 * 평점(aggregateRating)·후기(review)는 게시판에 실제 게시된 후기가 있을 때만 넣습니다.
 */
export function productJsonLd(
  product: ProductInput,
  reviews?: { rows: BoardPublicPost[]; stats: BoardStats | null } | null,
): Record<string, unknown> {
  const url = absoluteUrl(`/products/${product.slug}`);
  const app: Record<string, unknown> = {
    "@type": "SoftwareApplication",
    "@id": `${url}#software`,
    name: product.name,
    description: product.description,
    url,
    applicationCategory: product.isStandalone ? "UtilitiesApplication" : "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "ko-KR",
    featureList: product.features.join(", "),
    // 무료 데모 — 화면에 표시된 "무료 데모" 와 일치
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
    publisher: { "@id": `${getSiteUrl()}/#organization` },
  };

  const stats = reviews?.stats;
  if (stats && stats.count > 0 && stats.average !== null) {
    app.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: stats.average,
      ratingCount: stats.count,
      bestRating: 5,
      worstRating: 1,
    };
    const rated = (reviews?.rows ?? []).filter((r) => r.post_type === "review" && r.rating);
    if (rated.length) {
      app.review = rated.slice(0, 5).map((r) => ({
        "@type": "Review",
        name: r.title,
        reviewBody: r.body.slice(0, 500),
        datePublished: r.created_at.slice(0, 10),
        author: { "@type": "Person", name: r.nickname },
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      }));
    }
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      app,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND_NAME, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: product.name, item: url },
        ],
      },
    ],
  };
}
