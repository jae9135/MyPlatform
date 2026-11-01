"use client";

import { useCallback, useState } from "react";
import { BOARD_LIMITS, formatBoardDate, type BoardPublicComment } from "@/lib/boardShared";

/**
 * 글 아래 댓글 — 「댓글 N」을 누르면 펼쳐서 불러오고, 바로 작성할 수 있음.
 * 링크가 들어간 댓글은 관리자 확인 후 게시 (서버에서 판단).
 */
export function BoardComments({ postId, initialCount = 0 }: { postId: string; initialCount?: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BoardPublicComment[] | null>(null);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await fetch(`/api/board/comments?post=${encodeURIComponent(postId)}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: BoardPublicComment[]; detail?: string };
      if (!res.ok || !j.ok) throw new Error(j.detail || `댓글을 불러오지 못했습니다. (HTTP ${res.status})`);
      setRows(j.rows ?? []);
      setCount((j.rows ?? []).length);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null) void load();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/board/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          nickname: String(fd.get("nickname") ?? ""),
          body,
          website: String(fd.get("website") ?? ""),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; message?: string; detail?: string };
      if (!res.ok || !j.ok) throw new Error(j.detail || `등록 실패 (HTTP ${res.status})`);
      setMsg(j.message || "등록되었습니다.");
      setBody("");
      setFormKey((k) => k + 1);
      if (j.status === "published") await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  const panelId = `comments-${postId}`;

  return (
    <div className="cm-comments">
      <button
        type="button"
        className="cm-comment-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        댓글 {count}
        <span aria-hidden="true">{open ? " ▲" : " ▼"}</span>
      </button>

      {open ? (
        <div id={panelId} className="cm-comment-panel">
          {loading ? <p className="cm-comment-empty">불러오는 중…</p> : null}
          {loadErr ? <p className="cm-msg err">{loadErr}</p> : null}
          {rows && rows.length === 0 && !loading ? (
            <p className="cm-comment-empty">첫 댓글을 남겨 주세요.</p>
          ) : null}
          {rows && rows.length > 0 ? (
            <ul className="cm-comment-list">
              {rows.map((c) => (
                <li key={c.id} className={`cm-comment${c.is_admin ? " is-admin" : ""}`}>
                  <div className="cm-comment-meta">
                    <strong>{c.nickname}</strong>
                    {c.is_admin ? <span className="cm-badge answered">운영자</span> : null}
                    <span>{formatBoardDate(c.created_at)}</span>
                  </div>
                  <p className="cm-comment-body">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <form key={formKey} className="cm-comment-form" onSubmit={(e) => void onSubmit(e)}>
            <label className="cm-hp" aria-hidden="true">
              웹사이트
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <label>
              <span className="cm-sr">닉네임</span>
              <input
                name="nickname"
                required
                maxLength={BOARD_LIMITS.nickname}
                placeholder="닉네임"
                autoComplete="nickname"
                disabled={busy}
              />
            </label>
            <label className="cm-comment-text">
              <span className="cm-sr">댓글 내용</span>
              <textarea
                name="body"
                required
                rows={2}
                minLength={2}
                maxLength={BOARD_LIMITS.comment}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="댓글을 입력하세요 (연락처·개인정보는 적지 마세요)"
                disabled={busy}
              />
            </label>
            <button type="submit" className="mkt-btn mkt-btn-primary mkt-btn-sm" disabled={busy || body.trim().length < 2}>
              {busy ? "등록 중…" : "댓글 등록"}
            </button>
          </form>
          {msg ? <p className="cm-msg ok">{msg}</p> : null}
          {err ? <p className="cm-msg err">{err}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
