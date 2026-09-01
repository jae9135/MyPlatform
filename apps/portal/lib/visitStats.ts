import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export type VisitDailyRow = {
  path: string;
  visit_date: string;
  views: number;
  last_viewed_at: string | null;
};

export type VisitLogRow = {
  id: number;
  path: string;
  visited_at: string;
};

export type VisitSummary = {
  home_all: number;
  home_total: number;
  home_today: number;
  home_7d: number;
  daily: VisitDailyRow[];
  recent: VisitLogRow[];
};

const HOME_PATH = "/";

function todayKst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function daysAgoKst(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function normalizeVisitPath(path: string): string {
  const p = path.trim() || HOME_PATH;
  if (!p.startsWith("/")) return `/${p}`;
  return p.split("?")[0] || HOME_PATH;
}

export async function recordPageView(path: string): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const normalized = normalizeVisitPath(path);
  const visitDate = todayKst();
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin();

  const { data: existing, error: selErr } = await sb
    .from("portal_visit_daily")
    .select("views")
    .eq("path", normalized)
    .eq("visit_date", visitDate)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  if (existing) {
    const { error } = await sb
      .from("portal_visit_daily")
      .update({ views: Number(existing.views) + 1, last_viewed_at: now })
      .eq("path", normalized)
      .eq("visit_date", visitDate);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from("portal_visit_daily").insert({
      path: normalized,
      visit_date: visitDate,
      views: 1,
      last_viewed_at: now,
    });
    if (error) throw new Error(error.message);
  }

  const { error: logErr } = await sb.from("portal_visit_log").insert({
    path: normalized,
    visited_at: now,
  });
  if (logErr) throw new Error(logErr.message);
}

export async function getVisitSummary(path = HOME_PATH): Promise<VisitSummary> {
  const normalized = normalizeVisitPath(path);
  const empty: VisitSummary = {
    home_all: 0,
    home_total: 0,
    home_today: 0,
    home_7d: 0,
    daily: [],
    recent: [],
  };
  if (!isSupabaseAdminConfigured()) return empty;

  const sb = getSupabaseAdmin();

  const { data: allRows, error: allErr } = await sb
    .from("portal_visit_daily")
    .select("views")
    .eq("path", normalized);
  if (allErr) throw new Error(allErr.message);

  let home_all = 0;
  for (const row of allRows ?? []) {
    home_all += Number(row.views) || 0;
  }

  const since = daysAgoKst(30);
  const { data, error } = await sb
    .from("portal_visit_daily")
    .select("path, visit_date, views, last_viewed_at")
    .eq("path", normalized)
    .gte("visit_date", since)
    .order("visit_date", { ascending: false });

  if (error) throw new Error(error.message);

  const { data: recentRows, error: recentErr } = await sb
    .from("portal_visit_log")
    .select("id, path, visited_at")
    .eq("path", normalized)
    .order("visited_at", { ascending: false })
    .limit(30);

  if (recentErr) throw new Error(recentErr.message);

  const daily = (data ?? []) as VisitDailyRow[];
  const recent = (recentRows ?? []) as VisitLogRow[];
  const today = todayKst();
  const weekStart = daysAgoKst(6);

  let home_total = 0;
  let home_today = 0;
  let home_7d = 0;

  for (const row of daily) {
    const v = Number(row.views) || 0;
    home_total += v;
    if (row.visit_date === today) home_today += v;
    if (row.visit_date >= weekStart) home_7d += v;
  }

  return { home_all, home_total, home_today, home_7d, daily, recent };
}
