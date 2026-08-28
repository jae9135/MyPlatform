import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND_NAME } from "@/lib/brand";
import { HOME_SEO } from "@/lib/marketingCatalog";

export const metadata: Metadata = {
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
  },
  verification: {
    other: {
      "naver-site-verification": "d41f979987d2973e8a7ed13e70ecf2b9e85a6cf6",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
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
