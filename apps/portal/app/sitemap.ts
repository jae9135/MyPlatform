import type { MetadataRoute } from "next";
import { getMarketingTools, RECEIPT_STANDALONE } from "@/lib/marketingCatalog";
import { getSiteUrl } from "@/lib/siteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/customize`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/demo/quality`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/demo/db-workflow`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const productSlugs = [
    ...getMarketingTools().map((t) => t.slug),
    RECEIPT_STANDALONE.slug,
  ];

  for (const slug of productSlugs) {
    pages.push({
      url: `${base}/products/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    });
  }

  return pages;
}
