/** 게시판(후기·Q&A) — 서버/브라우저 공용 타입·상수 */
import { APPS } from "@/lib/apps";

export type BoardPostType = "review" | "qna";
export type BoardStatus = "pending" | "published" | "hidden";

export type BoardPublicPost = {
  id: string;
  post_type: BoardPostType;
  tool: string | null;
  tool_label: string;
  rating: number | null;
  title: string;
  body: string;
  nickname: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

export type BoardAdminPost = BoardPublicPost & {
  status: BoardStatus;
  updated_at: string;
};

export type BoardStats = { count: number; average: number | null };

export const BOARD_LIMITS = {
  title: 100,
  body: 3000,
  nickname: 30,
  answer: 3000,
} as const;

export const BOARD_TYPE_LABEL: Record<BoardPostType, string> = {
  review: "후기",
  qna: "Q&A",
};

export const BOARD_STATUS_LABEL: Record<BoardStatus, string> = {
  pending: "승인 대기",
  published: "게시",
  hidden: "숨김",
};

/** 게시판에서 고를 수 있는 도구 (포털 앱 목록 + 일반) */
export const BOARD_TOOLS: { id: string; name: string }[] = [
  ...APPS.map((a) => ({ id: a.id, name: a.name })),
  { id: "general", name: "일반 / 기타" },
];

const TOOL_NAME = new Map(BOARD_TOOLS.map((t) => [t.id, t.name]));

export function boardToolLabel(tool: string | null | undefined): string {
  if (!tool) return "일반 / 기타";
  return TOOL_NAME.get(tool) ?? tool;
}

export function isBoardTool(tool: string): boolean {
  return TOOL_NAME.has(tool);
}

export function isBoardPostType(v: string): v is BoardPostType {
  return v === "review" || v === "qna";
}

export function isBoardStatus(v: string): v is BoardStatus {
  return v === "pending" || v === "published" || v === "hidden";
}

export function formatBoardDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}
