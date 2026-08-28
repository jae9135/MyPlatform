"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  company: string;
  phone: string;
  tool: string | null;
  tool_label: string;
  request_type: string;
  request_type_label: string;
  message: string;
  emailed: boolean;
  created_at: string;
};

export function ContactInquiriesAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/contact-inquiries");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? res.statusText);
      }
      const j = await res.json();
      setRows(j.rows ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="admin-panel">
      <div className="admin-section-head">
        <h2>문의 접수 목록</h2>
        <button type="button" className="btn ghost" onClick={() => void load()} disabled={loading}>
          새로고침
        </button>
      </div>
      <p className="admin-hint">
        공개 <code>/contact</code> 폼에서 접수된 문의입니다. Supabase{" "}
        <code>contact_inquiries</code>와 동기화됩니다.
      </p>

      {error ? <p className="msg err">{error}</p> : null}

      {loading ? (
        <p className="admin-hint">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="admin-hint">접수된 문의가 없습니다.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>회사/이름</th>
                <th>연락처</th>
                <th>프로그램</th>
                <th>유형</th>
                <th>메일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                    <td>{r.company}</td>
                    <td>{r.phone}</td>
                    <td>{r.tool_label}</td>
                    <td>{r.request_type_label}</td>
                    <td>{r.emailed ? "발송" : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      >
                        {expanded === r.id ? "닫기" : "내용"}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id ? (
                    <tr className="admin-detail-row">
                      <td colSpan={7}>
                        <pre className="admin-inquiry-message">{r.message}</pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
