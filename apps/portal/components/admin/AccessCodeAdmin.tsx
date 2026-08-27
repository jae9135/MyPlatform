"use client";

import { useCallback, useEffect, useState } from "react";
import { kindLabel, type AccessCodeKind } from "@/lib/accessCodes";

type Row = {
  id: string;
  kind: AccessCodeKind;
  kindLabel: string;
  label: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
};

export function AccessCodeAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<AccessCodeKind>("day");
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/access-codes");
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
    load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setIssued(null);
    try {
      const res = await fetch("/api/admin/access-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail ?? "발급 실패");
      setIssued(j.plainCode as string);
      setLabel("");
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("이 코드를 폐기할까요?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/access-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "revoke" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail ?? "폐기 실패");
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-codes">
      <section className="admin-panel">
        <h2>액세스 코드 발급</h2>
        <p className="admin-hint">
          발급된 코드는 <strong>한 번만</strong> 표시됩니다. 고객에게 복사해 전달하세요. 로그인 화면에서
          동일하게 암호 입력란에 입력합니다.
        </p>
        <form className="admin-form" onSubmit={onCreate}>
          <label>
            종류
            <select value={kind} onChange={(e) => setKind(e.target.value as AccessCodeKind)} disabled={busy}>
              <option value="full">30일 (정식)</option>
              <option value="day">1일</option>
              <option value="once">1회</option>
            </select>
          </label>
          <label>
            메모 (회사·담당자)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: OO기관 POC"
              disabled={busy}
            />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {kindLabel(kind)} 코드 생성
          </button>
        </form>
        {issued ? (
          <div className="admin-issued">
            <strong>발급 완료 — 아래 코드를 복사하세요</strong>
            <code>{issued}</code>
          </div>
        ) : null}
      </section>

      {error ? <p className="msg err">{error}</p> : null}

      <section className="admin-panel">
        <h2>발급 목록</h2>
        {loading ? (
          <p className="admin-hint">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="admin-hint">발급된 코드가 없습니다.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>종류</th>
                  <th>메모</th>
                  <th>사용</th>
                  <th>상태</th>
                  <th>발급일</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.kindLabel}</td>
                    <td>{r.label || "—"}</td>
                    <td>
                      {r.use_count}
                      {r.max_uses != null ? ` / ${r.max_uses}` : ""}
                    </td>
                    <td>{r.revoked ? "폐기" : r.expires_at && new Date(r.expires_at) < new Date() ? "만료" : "유효"}</td>
                    <td>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                    <td>
                      {!r.revoked ? (
                        <button type="button" className="btn ghost" onClick={() => onRevoke(r.id)} disabled={busy}>
                          폐기
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
