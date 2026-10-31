"use client";

import { Stars } from "./StarRating";
import { BOARD_TYPE_LABEL, formatBoardDate, type BoardPublicPost } from "@/lib/boardShared";

export function BoardPostCard({ post, showTool = true }: { post: BoardPublicPost; showTool?: boolean }) {
  return (
    <article className="cm-post" id={`post-${post.id}`}>
      <div className="cm-post-head">
        <span className={`cm-badge${post.post_type === "qna" ? " qna" : ""}`}>
          {BOARD_TYPE_LABEL[post.post_type]}
        </span>
        {showTool ? <span className="cm-badge tool">{post.tool_label}</span> : null}
        {post.post_type === "review" && post.rating ? <Stars value={post.rating} /> : null}
        {post.post_type === "qna" && post.answer ? (
          <span className="cm-badge answered">답변 완료</span>
        ) : null}
      </div>
      <h3 className="cm-post-title">{post.title}</h3>
      <p className="cm-post-body">{post.body}</p>
      <div className="cm-post-meta">
        {post.nickname} · {formatBoardDate(post.created_at)}
      </div>
      {post.answer ? (
        <div className="cm-answer">
          <div className="cm-answer-label">
            운영자 답변{post.answered_at ? ` · ${formatBoardDate(post.answered_at)}` : ""}
          </div>
          <p className="cm-post-body">{post.answer}</p>
        </div>
      ) : null}
    </article>
  );
}
