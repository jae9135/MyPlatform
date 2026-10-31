"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  BOARD_STATUS_LABEL,
  BOARD_TYPE_LABEL,
  type BoardAdminPost,
  type BoardStatus,
} from "@/lib/boardShared";

type Filter = "all" | BoardStatus;

export function BoardAdmin() {
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<BoardAdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/admin/board${q}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail ?? res.statusText);
      setRows(j.rows ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: { status?: BoardStatus; answer?: string | null }) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/admin/board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail ?? res.statusText);
      const row = j.row as BoardAdminPost;
      setRows((prev) =>
        filter !== "all" && row.status !== filter
          ? prev.filter((r) => r.id !== id)
          : prev.map((r) => (r.id === id ? row : r)),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("이 글을 영구 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/board?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail ?? res.statusText);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-section-head">
        <h2>게시판 (후기 · Q&amp;A)</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="상태 필터"
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--pl-line)",
              background: "#fff",
              color: "var(--pl-text)",
              font: "inherit",
              fontSize: 13,
            }}
          >
            <option value="pending">승인 대기</option>
            <option value="published">게시 중</option>
            <option value="hidden">숨김</option>
            <option value="all">전체</option>
          </select>
          <button type="button" className="btn ghost" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>
      <p className="admin-hint">
        공개 <code>/community</code>에 작성된 글입니다. 글은 등록 즉시 게시되며(링크가 포함된 글만{" "}
        <b>승인 대기</b>), 부적절한 글은 <b>숨김</b>·<b>삭제</b>하세요. Q&amp;A는 답변을 저장하면 글 아래에
        운영자 답변으로 표시됩니다. 모든 글을 승인 후 게시하려면 <code>BOARD_MODERATION=pre</code>.
      </p>

      {error ? <p className="msg err">{error}</p> : null}

      {loading ? (
        <p className="admin-hint">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="admin-hint">해당하는 글이 없습니다.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>종류</th>
                <th>프로그램</th>
                <th>제목</th>
                <th>닉네임</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const busy = busyId === r.id;
                const draft = answerDraft[r.id] ?? r.answer ?? "";
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                      <td>
                        {BOARD_TYPE_LABEL[r.post_type]}
                        {r.rating ? ` ★${r.rating}` : ""}
                        {r.post_type === "qna" ? (r.answer ? " · 답변됨" : " · 미답변") : ""}
                      </td>
                      <td>{r.tool_label}</td>
                      <td>{r.title}</td>
                      <td>{r.nickname}</td>
                      <td>{BOARD_STATUS_LABEL[r.status]}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
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
                          <pre className="admin-inquiry-message">{r.body}</pre>
                          <div style={{ marginTop: 12 }}>
                            <label
                              className="admin-subheading"
                              htmlFor={`ans-${r.id}`}
                              style={{ display: "block" }}
                            >
                              운영자 답변 {r.post_type === "review" ? "(선택)" : ""}
                            </label>
                            <textarea
                              id={`ans-${r.id}`}
                              rows={4}
                              value={draft}
                              onChange={(e) =>
                                setAnswerDraft((d) => ({ ...d, [r.id]: e.target.value }))
                              }
                              style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 8,
                                border: "1px solid var(--pl-line)",
                                background: "#fff",
                                color: "var(--pl-text)",
                                font: "inherit",
                                fontSize: 13,
                                marginTop: 6,
                              }}
                              disabled={busy}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => void patch(r.id, { answer: draft })}
                            >
                              답변 저장
                            </button>
                            {r.status !== "published" ? (
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void patch(r.id, { status: "published" })}
                              >
                                게시
                              </button>
                            ) : null}
                            {r.status !== "hidden" ? (
                              <button
                                type="button"
                                className="btn ghost"
                                disabled={busy}
                                onClick={() => void patch(r.id, { status: "hidden" })}
                              >
                                숨김
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={busy}
                              onClick={() => void remove(r.id)}
                              style={{ color: "var(--pl-err)" }}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
