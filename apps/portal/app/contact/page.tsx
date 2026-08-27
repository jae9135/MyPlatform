import Link from "next/link";
import { Suspense } from "react";
import { ContactInfo } from "@/components/ContactInfo";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ContactForm } from "@/components/marketing/ContactForm";
import { BRAND_NAME } from "@/lib/brand";
import "../marketing.css";

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
