import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND_NAME } from "@/lib/brand";
import { HOME_SEO } from "@/lib/marketingCatalog";
import { getSiteUrl, isIndexableDeployment } from "@/lib/siteUrl";
import { OG_IMAGE_URL, ogImages } from "@/lib/ogImage";

export const metadata: Metadata = {
  // 상대 경로 OG 이미지·canonical 을 운영 도메인 기준 절대 URL 로 변환
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: HOME_SEO.title,
    template: `%s | ${BRAND_NAME}`,
  },
  description: HOME_SEO.description,
  applicationName: BRAND_NAME,
  openGraph: {
    title: HOME_SEO.title,
    description: HOME_SEO.ogDescription,
    type: "website",
    locale: "ko_KR",
    siteName: BRAND_NAME,
    images: ogImages(BRAND_NAME),
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE_URL],
  },
  // Vercel 미리보기 배포는 검색 노출 금지 (운영 배포만 색인)
  robots: isIndexableDeployment()
    ? { index: true, follow: true }
    : { index: false, follow: false },
  verification: {
    other: {
      "naver-site-verification": "d41f979987d2973e8a7ed13e70ecf2b9e85a6cf6",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e293b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
