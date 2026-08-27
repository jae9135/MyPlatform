"use client";

import { useSearchParams } from "next/navigation";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/marketingCatalog";

export function ContactForm() {
  const sp = useSearchParams();
  const tool = sp.get("tool") ?? "";
  const type = sp.get("type") ?? "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const subject = encodeURIComponent(
      `[${String(fd.get("request_type") || "문의")}] ${String(fd.get("company") || "")}`,
    );
    const body = encodeURIComponent(
      [
        `회사/이름: ${fd.get("company")}`,
        `연락처: ${fd.get("phone")}`,
        `관심 프로그램: ${fd.get("tool")}`,
        `요청 유형: ${fd.get("request_type")}`,
        "",
        String(fd.get("message") ?? ""),
      ].join("\n"),
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <form className="mkt-form mkt-panel" onSubmit={onSubmit}>
      <label>
        회사명 / 이름
        <input name="company" required placeholder="회사명 또는 이름" />
      </label>
      <label>
        연락처
        <input name="phone" required placeholder="이메일 또는 전화" />
      </label>
      <label>
        관심 프로그램
        <select name="tool" defaultValue={tool}>
          <option value="">선택</option>
          <option value="source-scan">소스코드·보안 진단</option>
          <option value="web-quality">웹 품질 진단</option>
          <option value="chk-db-std">DB 표준 점검</option>
          <option value="db-manager">DBManager</option>
          <option value="er-modeler">ER Modeler</option>
          <option value="deliverable-manager">DeliverableManager</option>
          <option value="my-gantt">MyGantt</option>
          <option value="receipt-to-pdf">ReceiptToPDF (별도)</option>
          <option value="other">기타 / 신규 개발</option>
        </select>
      </label>
      <label>
        요청 유형
        <select name="request_type" defaultValue={type || "customize"}>
          <option value="customize">커스터마이징</option>
          <option value="new">신규 기능 개발</option>
          <option value="quote">견적 상담</option>
          <option value="standalone">독립 도구 (ReceiptToPDF 등)</option>
        </select>
      </label>
      <label>
        요청 내용
        <textarea name="message" rows={5} required placeholder="원하는 기능이나 현재 업무를 간단히 적어주세요" />
      </label>
      <button type="submit" className="mkt-btn mkt-btn-primary">
        메일로 문의 보내기
      </button>
      <p style={{ fontSize: 12, color: "var(--mkt-text-dimmer)", marginTop: 12 }}>
        수신: {CONTACT_EMAIL} · tel: {CONTACT_PHONE} · 메일 앱이 열립니다.
      </p>    </form>
  );
}
