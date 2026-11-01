import type { Metadata } from "next";
import { MarketingHome } from "@/components/marketing/MarketingHome";
import { VisitTracker } from "@/components/marketing/VisitTracker";
import { JsonLd } from "@/components/seo/JsonLd";
import { HOME_SEO } from "@/lib/marketingCatalog";
import { homeJsonLd } from "@/lib/structuredData";
import "./marketing.css";
import { OG_IMAGE_URL } from "@/lib/ogImage";

export const metadata: Metadata = {
  title: HOME_SEO.title,
  description: HOME_SEO.description,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: HOME_SEO.title,
    description: HOME_SEO.ogDescription,
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: HOME_SEO.title,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_SEO.title,
    description: HOME_SEO.ogDescription,
    images: [OG_IMAGE_URL],
  },
};

export default function PublicHomePage() {
  return (
    <>
      <JsonLd data={homeJsonLd()} />
      <VisitTracker path="/" />
      <MarketingHome />
    </>
  );
}
