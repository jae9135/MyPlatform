import type { Metadata } from "next";
import { MarketingHome } from "@/components/marketing/MarketingHome";
import { VisitTracker } from "@/components/marketing/VisitTracker";
import { HOME_SEO } from "@/lib/marketingCatalog";
import "./marketing.css";

export const metadata: Metadata = {
  title: HOME_SEO.title,
  description: HOME_SEO.description,
  openGraph: {
    title: HOME_SEO.title,
    description: HOME_SEO.ogDescription,
    images: [
      {
        url: "/marketing/og-image.jpg",
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
    images: ["/marketing/og-image.jpg"],
  },
};

export default function PublicHomePage() {
  return (
    <>
      <VisitTracker path="/" />
      <MarketingHome />
    </>
  );
}
