"use client";

import Link from "next/link";
import { useState } from "react";
import { StarInput } from "./StarRating";
import { BOARD_LIMITS, BOARD_TOOLS, type BoardPostType } from "@/lib/boardShared";

type Props = {
  /** true = 모든 글 관리자 승인 후 게시 (BOARD_MODERATION=pre) */
  preModeration?: boolean;
  defaultType?: BoardPostType;
  defaultTool?: string;
  onDone?: (published: boolean, message: string) => void;
  onCancel?: () => void;
};

export function BoardWriteForm({
  preModeration = false,
  defaultType = "review",
  defaultTool = "",
  onDone,
  onCancel,
}: Props) {
  const [type, setType] = useState<BoardPostType>(defaultType);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [formKey, setFormKey] = useState(0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr("");
    setMsg("");
    if (type === "review" && rating < 1) {
      setErr("별점을 선택해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_type: type,
          tool: String(fd.get("tool") ?? ""),
          rating: type === "review" ? rating : null,
          nickname: String(fd.get("nickname") ?? ""),
          title: String(fd.get("title") ?? ""),
          body,
          website: String(fd.get("website") ?? ""),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        message?: string;
        detail?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.detail || `등록 실패 (HTTP ${res.status})`);
      setMsg(j.message || "접수되었습니다.");
      setRating(0);
      setBody("");
      setFormKey((k) => k + 1);
      onDone?.(j.status === "published", j.message || "접수되었습니다.");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cm-write" aria-label="글쓰기">
      <h2>후기 · 질문 남기기</h2>
      <p className="cm-write-hint">
        {preModeration
          ? "작성한 글은 관리자 확인 후 공개됩니다."
          : "등록하면 바로 게시됩니다. (링크가 포함된 글은 관리자 확인 후 공개)"}{" "}
        연락처·개인정보는 적지 마세요. 부적절한 글은 관리자가 숨길 수 있습니다. 견적·비공개 상담은{" "}
        <Link href="/contact">문의하기</Link>를 이용해 주세요.
      </p>
      <form key={formKey} className="mkt-form" onSubmit={(e) => void onSubmit(e)}>
        <div className="cm-type-pick" role="radiogroup" aria-label="글 종류">
          <label>
            <input
              type="radio"
              name="post_type"
              value="review"
              checked={type === "review"}
              onChange={() => setType("review")}
              disabled={busy}
            />
            사용 후기
          </label>
          <label>
            <input
              type="radio"
              name="post_type"
              value="qna"
              checked={type === "qna"}
              onChange={() => setType("qna")}
              disabled={busy}
            />
            질문 (Q&A)
          </label>
        </div>

        <div className="cm-write-row">
          <label>
            프로그램
            <select name="tool" defaultValue={defaultTool} disabled={busy}>
              <option value="">선택 안 함</option>
              {BOARD_TOOLS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            닉네임
            <input
              name="nickname"
              required
              maxLength={BOARD_LIMITS.nickname}
              placeholder="표시될 이름"
              autoComplete="nickname"
              disabled={busy}
            />
          </label>
        </div>

        {type === "review" ? (
          <label>
            별점
            <br />
            <StarInput value={rating} onChange={setRating} disabled={busy} />
          </label>
        ) : null}

        <label>
          제목
          <input
            name="title"
            required
            maxLength={BOARD_LIMITS.title}
            placeholder={type === "review" ? "한 줄 평" : "궁금한 점을 요약해 주세요"}
            disabled={busy}
          />
        </label>

        <label>
          내용 <span className="cm-counter">{body.length} / {BOARD_LIMITS.body}</span>
          <textarea
            name="body"
            rows={6}
            required
            minLength={5}
            maxLength={BOARD_LIMITS.body}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              type === "review"
                ? "어떤 업무에 써 보셨나요? 좋았던 점, 아쉬운 점을 알려 주세요."
                : "사용 중 막힌 부분이나 궁금한 점을 적어 주세요. (오류라면 화면·메시지를 함께)"
            }
            disabled={busy}
          />
        </label>

        {/* 봇 차단용 — 사람에게는 보이지 않는 칸 */}
        <div className="cm-hp" aria-hidden>
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="cm-write-actions">
          <button className="mkt-btn mkt-btn-primary" type="submit" disabled={busy}>
            {busy ? "등록 중…" : "등록"}
          </button>
          {onCancel ? (
            <button className="mkt-btn" type="button" onClick={onCancel} disabled={busy}>
              닫기
            </button>
          ) : null}
        </div>
        {msg ? <p className="cm-msg ok" role="status">{msg}</p> : null}
        {err ? <p className="cm-msg err" role="alert">{err}</p> : null}
      </form>
    </section>
  );
}
