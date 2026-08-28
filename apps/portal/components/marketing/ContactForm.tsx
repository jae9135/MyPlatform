"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/marketingCatalog";

export function ContactForm() {
  const sp = useSearchParams();
  const tool = sp.get("tool") ?? "";
  const type = sp.get("type") ?? "";
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setBusy(true);
    setErr("");
    setMsg("");
    setWarn("");

    const fd = new FormData(formEl);
    const payload = {
      company: String(fd.get("company") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      tool: String(fd.get("tool") ?? ""),
      request_type: String(fd.get("request_type") ?? "customize"),
      message: String(fd.get("message") ?? ""),
    };

    let submitted = false;
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        message?: string;
        detail?: string;
        error?: string;
        warning?: boolean;
      };
      if (!res.ok || !j.ok) {
        throw new Error(j.detail || j.error || `HTTP ${res.status}`);
      }
      submitted = true;
      setMsg(j.message || "문의가 접수되었습니다.");
      if (j.warning && j.detail) {
        setWarn(j.detail);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
      if (submitted) {
        try {
          formEl.reset();
        } catch {
          /* React/브라우저 환경에서 reset 참조가 끊길 수 있음 */
        }
        setFormKey((k) => k + 1);
      }
    }
  }

  return (
    <form key={formKey} className="mkt-form mkt-panel" onSubmit={(e) => void onSubmit(e)}>
      <label>
        회사명 / 이름
        <input name="company" required placeholder="회사명 또는 이름" disabled={busy} />
      </label>
      <label>
        연락처
        <input name="phone" required placeholder="이메일 또는 전화" disabled={busy} />
      </label>
      <label>
        관심 프로그램
        <select name="tool" defaultValue={tool} disabled={busy}>
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
        <select name="request_type" defaultValue={type || "customize"} disabled={busy}>
          <option value="customize">커스터마이징</option>
          <option value="new">신규 기능 개발</option>
          <option value="quote">견적 상담</option>
          <option value="standalone">독립 도구 (ReceiptToPDF 등)</option>
        </select>
      </label>
      <label>
        요청 내용
        <textarea
          name="message"
          rows={5}
          required
          placeholder="원하는 기능이나 현재 업무를 간단히 적어주세요"
          disabled={busy}
        />
      </label>
      <button type="submit" className="mkt-btn mkt-btn-primary" disabled={busy}>
        {busy ? "전송 중…" : "문의 보내기"}
      </button>
      {msg ? <p className="msg ok" style={{ marginTop: 12 }}>{msg}</p> : null}
      {warn ? <p className="msg warn" style={{ marginTop: 12 }}>{warn}</p> : null}
      {err ? <p className="msg error" style={{ marginTop: 12 }}>{err}</p> : null}
      <p style={{ fontSize: 12, color: "var(--mkt-text-dimmer)", marginTop: 12 }}>
        수신: {CONTACT_EMAIL} · tel: {CONTACT_PHONE} · 서버로 접수되며 담당자가 확인합니다.
      </p>
    </form>
  );
}
