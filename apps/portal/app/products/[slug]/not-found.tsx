import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import "../../marketing.css";

export default function ProductNotFound() {
  return (
    <MarketingPageShell>
      <h1>프로그램을 찾을 수 없습니다</h1>
      <Link className="mkt-btn" href="/#tools">
        도구 목록으로
      </Link>
    </MarketingPageShell>
  );
}
