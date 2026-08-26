"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchScanApi } from "@/lib/localScanApi";
import { readJsonResponse } from "@/lib/formUpload";
import { notifyMainSourceScanHistory } from "@/lib/sourceScanPopout";

type HistoryItem = {
  job_id?: string;
  target_name?: string;
  scanned_at?: string;
  fail?: number;
  mode?: string;
  not_scanned?: number;
};

export default function SourceScanHistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchScanApi("v1/source-scan/history?limit=100");
      const j = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(String(j.detail || `이력 조회 실패 (HTTP ${res.status})`));
      }
      setHistory((j.history as HistoryItem[]) || []);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="source-scan-popout">
      <section className="panel source-scan-popout-panel">
        <div className="source-scan-popout-head">
          <h1>진단 이력</h1>
          <button type="button" className="btn ghost" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </div>
        <p className="hint">행을 클릭하면 진단 화면에 해당 결과를 불러옵니다.</p>
        {loading ? <p className="hint">불러오는 중…</p> : null}
        {error ? <p className="msg err">{error}</p> : null}
        {!loading && !error && !history.length ? <p className="hint">저장된 이력이 없습니다.</p> : null}
        {history.length ? (
          <div className="table-wrap source-scan-popout-table">
            <table className="result-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>대상</th>
                  <th>결함</th>
                  <th>분석 불가</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.job_id || h.scanned_at}
                    className="source-scan-history-row"
                    onClick={() => h.job_id && notifyMainSourceScanHistory(h.job_id)}
                  >
                    <td>{h.scanned_at?.slice(0, 19).replace("T", " ") || "-"}</td>
                    <td>{h.target_name || "-"}</td>
                    <td>{h.fail ?? 0}</td>
                    <td>{h.not_scanned ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
