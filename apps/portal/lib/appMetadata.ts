import type { Metadata } from "next";
import { APPS } from "@/lib/apps";

/** 프로그램 화면(/apps/<id>) 탭 제목 — 브라우저 탭·즐겨찾기·방문 기록에서 프로그램을 구분 */
export function appMetadata(id: string): Metadata {
  const app = APPS.find((a) => a.id === id);
  return { title: app ? app.name : "프로그램" };
}
