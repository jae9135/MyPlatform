import Link from "next/link";
import { Suspense } from "react";
import { ContactInfo } from "@/components/ContactInfo";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ContactForm } from "@/components/marketing/ContactForm";
import { BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";
import "../marketing.css";
import { ogImages } from "@/lib/ogImage";

export const metadata: Metadata = {
  title: "문의하기",
  description: "맞춤 개발·신규 기능·견적 상담 문의 — 프로젝트 산출물 자동화 도구 도입을 도와드립니다.",
  alternates: { canonical: "/contact" },
  openGraph: { url: "/contact", images: ogImages(BRAND_NAME) },
};

export default function ContactPage() {
  return (
    <MarketingPageShell>
      <h1>문의하기</h1>
      <p style={{ color: "var(--mkt-text-dim)", marginBottom: 16 }}>
        {BRAND_NAME} 맞춤 개발·신규 기능·견적 상담을 받습니다.
      </p>
      <ContactInfo className="mkt-contact-info-block" />
      <Suspense fallback={<div className="mkt-panel">로딩…</div>}>
        <ContactForm />
      </Suspense>
      <p style={{ marginTop: 20 }}>
        <Link className="mkt-btn mkt-btn-ghost" href="/customize">
          ← 맞춤 개발 안내
        </Link>
      </p>
    </MarketingPageShell>
  );
}
