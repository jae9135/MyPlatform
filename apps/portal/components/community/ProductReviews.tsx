"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BoardPostCard } from "./BoardPostCard";
import { Stars } from "./StarRating";
import type { BoardPublicPost, BoardStats } from "@/lib/boardShared";
import "./community.css";

/**
 * 상품 상세 — 해당 도구의 최근 후기 + 평균 별점 (게시판 미설정이면 숨김).
 * initial: 서버에서 미리 불러온 후기 → 검색엔진이 읽는 HTML 에 포함. 이후 브라우저에서 최신으로 갱신.
 */
export function ProductReviews({
  tool,
  toolName,
  initial = null,
}: {
  tool: string;
  toolName: string;
  initial?: { rows: BoardPublicPost[]; stats: BoardStats | null } | null;
}) {
  const [rows, setRows] = useState<BoardPublicPost[] | null>(initial ? initial.rows : null);
  const [stats, setStats] = useState<BoardStats | null>(initial ? initial.stats : null);
  const [unavailable, setUnavailable] = useState(false);
  const hasInitial = initial !== null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = new URLSearchParams({ type: "review", tool, limit: "3", stats: "1" });
        const res = await fetch(`/api/board?${q}`, { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          rows?: BoardPublicPost[];
          stats?: BoardStats | null;
        };
        if (!alive) return;
        if (!res.ok || !j.ok) {
          // 서버에서 받은 후기가 있으면 그대로 유지
          if (!hasInitial) setUnavailable(true);
          return;
        }
        setRows(j.rows ?? []);
        setStats(j.stats ?? null);
      } catch {
        if (alive && !hasInitial) setUnavailable(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tool, hasInitial]);

  if (unavailable) return null;

  const writeHref = `/community?tool=${encodeURIComponent(tool)}&write=1`;
  const listHref = `/community?type=review&tool=${encodeURIComponent(tool)}`;

  return (
    <div className="mkt-panel" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>사용 후기</h2>
      {rows === null ? (
        <p className="cm-intro">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="cm-empty" style={{ marginBottom: 14 }}>
          아직 {toolName} 후기가 없습니다. 써 보셨다면 첫 후기를 남겨 주세요.
        </div>
      ) : (
        <>
          {stats && stats.count > 0 ? (
            <div className="cm-summary">
              {stats.average !== null ? (
                <>
                  <span className="cm-summary-score">{stats.average.toFixed(1)}</span>
                  <Stars value={stats.average} />
                </>
              ) : null}
              <span className="cm-summary-count">후기 {stats.count}개</span>
            </div>
          ) : null}
          <div className="cm-list" style={{ marginBottom: 14 }}>
            {rows.map((p) => (
              <BoardPostCard key={p.id} post={p} showTool={false} />
            ))}
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="mkt-btn mkt-btn-sm mkt-btn-primary" href={writeHref}>
          후기 남기기
        </Link>
        {rows && rows.length > 0 ? (
          <Link className="mkt-btn mkt-btn-sm" href={listHref}>
            후기 전체 보기
          </Link>
        ) : null}
      </div>
    </div>
  );
}
