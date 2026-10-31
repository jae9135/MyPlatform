"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BoardPostCard } from "./BoardPostCard";
import { BoardWriteForm } from "./BoardWriteForm";
import { BOARD_TOOLS, isBoardPostType, isBoardTool, type BoardPostType, type BoardPublicPost } from "@/lib/boardShared";
import "./community.css";

const PAGE_SIZE = 10;
type TypeFilter = "all" | BoardPostType;

export function CommunityBoard({
  initial = null,
}: {
  /** 서버에서 미리 불러온 첫 페이지 — HTML 에 포함되어 검색엔진이 읽음 */
  initial?: { rows: BoardPublicPost[]; total: number } | null;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const typeParam = sp.get("type") ?? "";
  const toolParam = sp.get("tool") ?? "";
  const typeFilter: TypeFilter = isBoardPostType(typeParam) ? typeParam : "all";
  const toolFilter = isBoardTool(toolParam) ? toolParam : "";

  const [writeOpen, setWriteOpen] = useState(sp.get("write") === "1");
  const [rows, setRows] = useState<BoardPublicPost[]>(initial?.rows ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preModeration, setPreModeration] = useState(false);

  const setFilters = useCallback(
    (next: { type?: TypeFilter; tool?: string }) => {
      const q = new URLSearchParams();
      const t = next.type ?? typeFilter;
      const tool = next.tool ?? toolFilter;
      if (t !== "all") q.set("type", t);
      if (tool) q.set("tool", tool);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, toolFilter, typeFilter],
  );

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
        if (typeFilter !== "all") q.set("type", typeFilter);
        if (toolFilter) q.set("tool", toolFilter);
        const res = await fetch(`/api/board?${q}`, { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          rows?: BoardPublicPost[];
          total?: number;
          detail?: string;
          moderation?: string;
        };
        if (!res.ok || !j.ok) throw new Error(j.detail || `HTTP ${res.status}`);
        setRows((prev) => (offset === 0 ? j.rows ?? [] : [...prev, ...(j.rows ?? [])]));
        setTotal(j.total ?? 0);
        setPreModeration(j.moderation === "pre");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (offset === 0) setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [toolFilter, typeFilter],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const writeType: BoardPostType = typeFilter === "qna" ? "qna" : "review";

  return (
    <div>
      <p className="cm-intro">
        프로그램을 써 보신 소감이나 사용 중 궁금한 점을 남겨 주세요. 질문에는 운영자가 직접 답변합니다.
        <br />
        견적·맞춤 개발·비공개 상담은 <Link href="/contact">문의하기</Link>로 보내 주세요.
      </p>

      {notice ? (
        <p className="msg ok cm-msg" role="status" style={{ marginBottom: 16 }}>
          {notice}
        </p>
      ) : null}

      {writeOpen ? (
        <BoardWriteForm
          key={`${writeType}-${toolFilter}`}
          preModeration={preModeration}
          defaultType={writeType}
          defaultTool={toolFilter}
          onCancel={() => setWriteOpen(false)}
          onDone={(published, message) => {
            setNotice(message);
            setWriteOpen(false);
            if (published) void load(0);
          }}
        />
      ) : null}

      <div className="cm-toolbar">
        <div className="cm-tabs" role="group" aria-label="글 종류">
          {(
            [
              ["all", "전체"],
              ["review", "후기"],
              ["qna", "Q&A"],
            ] as [TypeFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="cm-tab"
              aria-pressed={typeFilter === value}
              onClick={() => setFilters({ type: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cm-filters">
          <select
            className="cm-select"
            aria-label="프로그램"
            value={toolFilter}
            onChange={(e) => setFilters({ tool: e.target.value })}
          >
            <option value="">모든 프로그램</option>
            {BOARD_TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {!writeOpen ? (
            <button
              type="button"
              className="mkt-btn mkt-btn-primary"
              onClick={() => {
                setNotice("");
                setWriteOpen(true);
              }}
            >
              글쓰기
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="cm-msg err" role="alert">
          목록을 불러오지 못했습니다: {error}
        </p>
      ) : null}

      {!error && !loading && rows.length === 0 ? (
        <div className="cm-empty">
          아직 게시된 글이 없습니다. 첫 {typeFilter === "qna" ? "질문을" : "후기를"} 남겨 주세요!
        </div>
      ) : null}

      <h2 className="sr-only">게시글 목록</h2>
      <div className="cm-list">
        {rows.map((p) => (
          <BoardPostCard key={p.id} post={p} showTool={!toolFilter} />
        ))}
      </div>

      {loading ? <p className="cm-intro" style={{ marginTop: 16 }}>불러오는 중…</p> : null}

      {!loading && rows.length < total ? (
        <div className="cm-more">
          <button type="button" className="mkt-btn" onClick={() => void load(rows.length)}>
            더 보기 ({rows.length} / {total})
          </button>
        </div>
      ) : null}
    </div>
  );
}
