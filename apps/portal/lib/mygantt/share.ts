import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createEmptyProject, normalizeTask, type Project } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

let client: SupabaseClient | null = null;

export function isShareConfigured(): boolean {
  return Boolean(
    url &&
      anonKey &&
      !url.includes("YOUR_PROJECT") &&
      !anonKey.includes("YOUR_ANON_KEY") &&
      anonKey !== "your_anon_key",
  );
}

export function getSupabase(): SupabaseClient {
  if (!isShareConfigured()) {
    throw new Error(
      "Supabase가 설정되지 않았습니다. 포털 .env.local의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 확인하세요.",
    );
  }
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

export type ShareRef = {
  id: string;
  editKey: string | null;
};

export function getShareFromUrl(): ShareRef | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("p")?.trim();
  if (!id) return null;
  const editKey = params.get("k")?.trim() || null;
  return { id, editKey };
}

export function buildShareUrl(
  id: string,
  kind: "view" | "edit",
  editKey?: string | null,
): string {
  const u = new URL(window.location.href);
  u.searchParams.set("p", id);
  if (kind === "edit" && editKey) u.searchParams.set("k", editKey);
  else u.searchParams.delete("k");
  return u.toString();
}

export function setShareInUrl(ref: ShareRef | null) {
  const u = new URL(window.location.href);
  if (ref?.id) {
    u.searchParams.set("p", ref.id);
    if (ref.editKey) u.searchParams.set("k", ref.editKey);
    else u.searchParams.delete("k");
  } else {
    u.searchParams.delete("p");
    u.searchParams.delete("k");
  }
  window.history.replaceState({}, "", u.toString());
}

function hydrate(parsed: Project): Project {
  const base = createEmptyProject();
  return {
    ...base,
    ...parsed,
    holidays: parsed.holidays ?? [],
    tasks: (parsed.tasks ?? []).map((t) => normalizeTask(t)),
    displayWeek: parsed.displayWeek || 1,
    asOfDate: parsed.asOfDate || base.asOfDate,
  };
}

export async function fetchSharedProject(id: string): Promise<Project> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("gantt_get", { p_id: id });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("공유 프로젝트를 찾을 수 없습니다.");
  return hydrate(data as Project);
}

export async function createSharedProject(
  project: Project,
): Promise<{ id: string; editKey: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("gantt_create", { p_data: project });
  if (error) throw new Error(error.message);
  const row = data as { id?: string; edit_key?: string };
  if (!row?.id || !row.edit_key) {
    throw new Error("공유 링크 생성 결과가 올바르지 않습니다.");
  }
  return { id: row.id, editKey: row.edit_key };
}

export async function saveSharedProject(
  id: string,
  editKey: string,
  project: Project,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("gantt_save", {
    p_id: id,
    p_key: editKey,
    p_data: project,
  });
  if (error) throw new Error(error.message);
}
