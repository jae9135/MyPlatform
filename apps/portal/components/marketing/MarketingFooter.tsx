import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { betaEntryHref } from "@/lib/authMode";

export function MarketingFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-wrap mkt-foot-row">
        <span className="mkt-foot-copy">
          © {BRAND_NAME} · 이 페이지는 무료 데모이며 실제 서비스 화면과 다를 수 있습니다
        </span>
        <div className="mkt-foot-links">
          <Link href={betaEntryHref()}>베타 프로그램</Link>
          <Link href="/community">후기·Q&amp;A</Link>
          <Link href="/contact">문의</Link>
          <Link href="/customize">맞춤 개발</Link>
        </div>
      </div>
    </footer>
  );
}
