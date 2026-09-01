"use client";

import { useCallback, useEffect, useState } from "react";

type Stats = {
  home_all: number;
  home_total: number;
  home_today: number;
  home_7d: number;
  daily: { visit_date: string; views: number; last_viewed_at: string | null }[];
  recent: { id: number; visited_at: string }[];
};

const KST: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

function formatKstDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", KST);
}

function formatKstDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatKstTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function VisitStatsAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/visit-stats");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? res.statusText);
      }
      const j = await res.json();
      setStats({
        home_all: Number(j.home_all) || 0,
        home_total: Number(j.home_total) || 0,
        home_today: Number(j.home_today) || 0,
        home_7d: Number(j.home_7d) || 0,
        daily: Array.isArray(j.daily) ? j.daily : [],
        recent: Array.isArray(j.recent) ? j.recent : [],
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="admin-panel">
      <div className="admin-section-head">
        <h2>홈페이지 방문</h2>
        <button type="button" className="btn ghost" onClick={() => void load()} disabled={loading}>
          새로고침
        </button>
      </div>
      <p className="admin-hint">
        공개 홈(<code>/</code>) 페이지뷰입니다. 브라우저 세션당 1회 집계됩니다.
      </p>

      {error ? <p className="msg err">{error}</p> : null}

      {loading && !stats ? (
        <p className="admin-hint">불러오는 중…</p>
      ) : stats ? (
        <>
          <div className="admin-stat-row">
            <div className="admin-stat-card">
              <div className="admin-stat-label">오늘</div>
              <div className="admin-stat-value">{stats.home_today}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">최근 7일</div>
              <div className="admin-stat-value">{stats.home_7d}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">최근 30일</div>
              <div className="admin-stat-value">{stats.home_total}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">전체 누적</div>
              <div className="admin-stat-value">{stats.home_all}</div>
            </div>
          </div>

          {stats.recent.length > 0 ? (
            <div className="admin-table-wrap" style={{ marginTop: 16 }}>
              <h3 className="admin-subheading">최근 방문 (세션별)</h3>
              <table className="admin-table compact">
                <thead>
                  <tr>
                    <th>방문 일시 (KST)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((r) => (
                    <tr key={r.id}>
                      <td>{formatKstDateTime(r.visited_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {stats.daily.length > 0 ? (
            <div className="admin-table-wrap" style={{ marginTop: 16 }}>
              <h3 className="admin-subheading">일별 집계</h3>
              <table className="admin-table compact">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>마지막 방문 시각</th>
                    <th>방문(페이지뷰)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.daily.slice(0, 14).map((d) => (
                    <tr key={d.visit_date}>
                      <td>{formatKstDate(d.visit_date)}</td>
                      <td>{formatKstTime(d.last_viewed_at)}</td>
                      <td>{d.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : stats.recent.length === 0 ? (
            <p className="admin-hint">아직 집계된 방문이 없습니다. 홈페이지를 열면 카운트됩니다.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
