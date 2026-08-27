"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalNav } from "@/lib/PortalNav";
import {
  fetchScanApi,
  fetchScanEnvWithRetry,
  fetchScanJobApi,
  postScanMultipart,
  wrapScanFetchError,
} from "@/lib/localScanApi";
import { EnvSourceBadge, EnvToolsSkeleton } from "@/components/LocalScanSettings";
import { readJsonResponse } from "@/lib/formUpload";

const IPMS_DEFAULT_URL = "http://14.35.194.178:12000/ipms.online/";

const TARGET_OPTIONS = [
  { id: "manual", label: "URL 직접 입력" },
  { id: "my-gantt", label: "MyGantt (포털)" },
  { id: "er-modeler", label: "ER Modeler" },
  { id: "db-manager", label: "DBManager" },
  { id: "chk-db-std", label: "DB 표준 점검" },
  { id: "deliverable-manager", label: "DeliverableManager" },
  { id: "ipms-online", label: "IPMS Online" },
];

type ScenarioCandidate = {
  state_id: string;
  label: string;
  description: string;
  recommended?: boolean;
  selectable?: boolean;
};

type PerfSummary = {
  total_requests?: number;
  total_failures?: number;
  fail_ratio?: number;
  avg_response_time_ms?: number;
  p95_ms?: number;
  rps?: number;
  duration_sec?: number;
  users?: number;
};

type PerfResult = {
  ok?: boolean;
  summary?: PerfSummary;
  time_series?: { elapsed_sec: number; rps: number; avg_ms: number; p95_ms: number; users: number }[];
  endpoints?: { name: string; num_requests: number; avg_ms: number; p95_ms: number }[];
  base_url?: string;
  target_name?: string;
};

type HistoryItem = {
  job_id: string;
  saved_at?: string;
  target?: string;
  target_name?: string;
  base_url?: string;
  users?: number;
  rps?: number;
  fail_ratio?: number;
};

export default function PerfTestPage() {
  const [env, setEnv] = useState<Record<string, unknown> | null>(null);
  const [envErr, setEnvErr] = useState("");
  const [target, setTarget] = useState("manual");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:3000");
  const [access, setAccess] = useState<"public" | "auth">("public");
  const [users, setUsers] = useState(5);
  const [spawnRate, setSpawnRate] = useState(1);
  const [durationSec, setDurationSec] = useState(30);
  const [recordHar, setRecordHar] = useState(false);
  const [confirmHighLoad, setConfirmHighLoad] = useState(false);
  const [manualUrls, setManualUrls] = useState("");
  const [candidates, setCandidates] = useState<ScenarioCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scenarioMsg, setScenarioMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string; live?: Record<string, unknown> } | null>(null);
  const [result, setResult] = useState<PerfResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadEnv = useCallback(async () => {
    setEnvErr("");
    try {
      const res = await fetchScanEnvWithRetry("v1/perf-test/environment");
      const j = await readJsonResponse(res);
      setEnv(j as Record<string, unknown>);
    } catch (e) {
      setEnvErr(wrapScanFetchError(e, { envProbe: true }).message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetchScanApi("v1/perf-test/history?limit=20");
      const j = await readJsonResponse(res);
      setHistory(Array.isArray(j.items) ? j.items : []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadEnv();
    void loadHistory();
  }, [loadEnv, loadHistory]);

  useEffect(() => {
    if (target === "ipms-online" && !baseUrl.includes("ipms")) {
      setBaseUrl(IPMS_DEFAULT_URL);
    }
    if (target !== "manual" && target !== "ipms-online") {
      setBaseUrl("http://127.0.0.1:3000");
    }
  }, [target, baseUrl]);

  async function loadScenarios() {
    setScenarioMsg("시나리오 불러오는 중…");
    setCandidates([]);
    try {
      const q = new URLSearchParams({ target });
      if (baseUrl) q.set("page_url", baseUrl);
      if (target === "ipms-online") q.set("access", access);
      const res = await fetchScanApi(`v1/perf-test/scenarios?${q}`);
      const j = await readJsonResponse(res);
      const list = Array.isArray(j.candidates) ? (j.candidates as ScenarioCandidate[]) : [];
      setCandidates(list);
      const defaults = Array.isArray(j.defaults_selected)
        ? (j.defaults_selected as string[])
        : list.filter((c) => c.recommended !== false && c.selectable !== false).map((c) => c.state_id);
      setSelectedIds(defaults);
      if (j.base_url && typeof j.base_url === "string") setBaseUrl(j.base_url);
      setScenarioMsg(list.length ? `${list.length}개 시나리오` : "시나리오 없음");
    } catch (e) {
      setScenarioMsg(wrapScanFetchError(e).message);
    }
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function buildForm(): FormData {
    const fd = new FormData();
    fd.set("target", target === "manual" ? "" : target);
    fd.set("base_url", baseUrl);
    fd.set("state_ids", JSON.stringify(selectedIds));
    fd.set("users", String(users));
    fd.set("spawn_rate", String(spawnRate));
    fd.set("duration_sec", String(durationSec));
    fd.set("record_har", recordHar ? "true" : "false");
    fd.set("confirm_high_load", confirmHighLoad ? "true" : "false");
    fd.set("access", access);
    fd.set("manual_urls", manualUrls);
    fd.set("async_progress", "true");
    return fd;
  }

  async function pollJob(jobId: string): Promise<PerfResult | null> {
    for (;;) {
      await new Promise((r) => setTimeout(r, 800));
      const res = await fetchScanJobApi(`v1/perf-test/jobs/${jobId}`);
      const j = await readJsonResponse(res);
      setProgress({
        pct: Number(j.pct) || 0,
        message: String(j.message || ""),
        live: (j.live_stats as Record<string, unknown>) || undefined,
      });
      const st = String(j.status || "");
      if (st === "done") return (j.result as PerfResult) || null;
      if (st === "error" || st === "cancelled") {
        throw new Error(String(j.error || j.message || st));
      }
    }
  }

  async function runTest() {
    setError("");
    setResult(null);
    setBusy(true);
    setProgress({ pct: 0, message: "검증 중…" });
    try {
      const vfd = buildForm();
      const vRes = await postScanMultipart("v1/perf-test/validate", vfd);
      const v = await readJsonResponse(vRes);
      if (!v.ok) {
        throw new Error(Array.isArray(v.errors) ? v.errors.join("; ") : "검증 실패");
      }
      const rRes = await postScanMultipart("v1/perf-test/run", buildForm());
      const start = await readJsonResponse(rRes);
      if (!start.ok && !start.job_id) {
        throw new Error(Array.isArray(start.errors) ? start.errors.join("; ") : "시작 실패");
      }
      const jobId = String(start.job_id || "");
      if (!jobId) throw new Error("job_id 없음");
      const payload = await pollJob(jobId);
      setResult(payload);
      void loadHistory();
    } catch (e) {
      setError(wrapScanFetchError(e).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const envReady = Boolean(env?.load_allowed && env?.locust_installed);
  const summary = result?.summary;

  const liveLine = useMemo(() => {
    const live = progress?.live;
    if (!live) return "";
    return `VU ${live.users ?? "—"} · ${live.rps ?? "—"} rps · avg ${live.avg_ms ?? "—"} ms · p95 ${live.p95_ms ?? "—"} ms`;
  }, [progress]);

  return (
    <>
      <PortalNav />
      <main className="page">
        <header className="hero">
          <h1>성능 진단</h1>
          <p className="muted">
            Locust HTTP 부하 · 웹 품질 시나리오 공유 · TPS · 응답시간 · 오류율 (로컬 API 전용)
          </p>
        </header>

        <section className="panel">
          <h2>도구·환경</h2>
          <EnvSourceBadge />
          {envErr ? <p className="msg error">{envErr}</p> : null}
          {!env && !envErr ? <EnvToolsSkeleton /> : null}
          {env ? (
            <ul className="source-scan-env-grid">
              <li>
                <strong>부하 실행</strong> {env.load_allowed ? "허용 (로컬)" : "차단 (클라우드)"}
              </li>
              <li>
                <strong>Locust</strong> {env.locust_installed ? "설치됨" : "미설치 — pip install locust"}
              </li>
              <li>
                <strong>VU 상한</strong> {String(env.max_users ?? "100")}
              </li>
            </ul>
          ) : null}
          <button type="button" className="btn secondary" onClick={() => void loadEnv()}>
            환경 다시 확인
          </button>
        </section>

        <section className="panel">
          <h2>부하 설정</h2>
          <div className="source-scan-advanced-grid">
            <div className="source-scan-field">
              <label>대상</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {TARGET_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="source-scan-field">
              <label>Base URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:3000" />
            </div>
            {target === "ipms-online" ? (
              <div className="source-scan-field">
                <label>IPMS 접근</label>
                <select value={access} onChange={(e) => setAccess(e.target.value as "public" | "auth")}>
                  <option value="public">공개</option>
                  <option value="auth">로그인</option>
                </select>
              </div>
            ) : null}
            <div className="source-scan-field">
              <label>동시 사용자 (VU)</label>
              <input type="number" min={1} max={100} value={users} onChange={(e) => setUsers(Number(e.target.value))} />
            </div>
            <div className="source-scan-field">
              <label>램프업 (명/초)</label>
              <input type="number" min={0.1} step={0.1} value={spawnRate} onChange={(e) => setSpawnRate(Number(e.target.value))} />
            </div>
            <div className="source-scan-field">
              <label>지속 시간 (초)</label>
              <input type="number" min={5} max={3600} value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} />
            </div>
          </div>

          {target !== "manual" ? (
            <div className="source-scan-actions">
              <button type="button" className="btn secondary" onClick={() => void loadScenarios()}>
                시나리오 불러오기
              </button>
              <span className="muted">{scenarioMsg}</span>
            </div>
          ) : null}

          {candidates.length > 0 ? (
            <ul className="source-scan-option-list">
              {candidates.map((c) => (
                <li key={c.state_id}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.state_id)}
                      onChange={() => toggleId(c.state_id)}
                      disabled={c.selectable === false}
                    />
                    <span>
                      <strong>{c.label}</strong> <code>{c.state_id}</code>
                    </span>
                  </label>
                  {c.description ? <p className="source-scan-option-desc">{c.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="source-scan-field" style={{ marginTop: "1rem" }}>
            <label>추가 URL (쉼표·줄바꿈)</label>
            <textarea
              rows={2}
              value={manualUrls}
              onChange={(e) => setManualUrls(e.target.value)}
              placeholder="/apps/my-gantt"
            />
          </div>

          <ul className="source-scan-option-list">
            <li>
              <label className="check-row">
                <input type="checkbox" checked={recordHar} onChange={(e) => setRecordHar(e.target.checked)} />
                Playwright HAR 녹화 (1회 실행 후 HTTP 트랜잭션 추출)
              </label>
            </li>
            <li>
              <label className="check-row">
                <input type="checkbox" checked={confirmHighLoad} onChange={(e) => setConfirmHighLoad(e.target.checked)} />
                고부하 확인 (VU &gt; 20 또는 외부 URL)
              </label>
            </li>
          </ul>

          <div className="source-scan-actions-primary">
            <button type="button" className="btn primary" disabled={busy || !envReady} onClick={() => void runTest()}>
              {busy ? "실행 중…" : "성능검사 실행"}
            </button>
          </div>
          {progress ? (
            <div className="source-scan-progress">
              <div className="bar" style={{ width: `${progress.pct}%` }} />
              <p>{progress.message}</p>
              {liveLine ? <p className="muted">{liveLine}</p> : null}
            </div>
          ) : null}
          {error ? <p className="msg error">{error}</p> : null}
        </section>

        {summary ? (
          <section className="panel">
            <h2>결과 요약</h2>
            <table className="data-table compact">
              <tbody>
                <tr>
                  <th>총 요청</th>
                  <td>{summary.total_requests ?? "—"}</td>
                  <th>오류율</th>
                  <td>{summary.fail_ratio != null ? `${(summary.fail_ratio * 100).toFixed(2)}%` : "—"}</td>
                </tr>
                <tr>
                  <th>TPS (rps)</th>
                  <td>{summary.rps ?? "—"}</td>
                  <th>평균 응답</th>
                  <td>{summary.avg_response_time_ms != null ? `${summary.avg_response_time_ms} ms` : "—"}</td>
                </tr>
                <tr>
                  <th>p95</th>
                  <td>{summary.p95_ms != null ? `${summary.p95_ms} ms` : "—"}</td>
                  <th>VU · 시간</th>
                  <td>
                    {summary.users ?? "—"} · {summary.duration_sec ?? "—"}s
                  </td>
                </tr>
              </tbody>
            </table>
            {result?.endpoints?.length ? (
              <>
                <h3>엔드포인트 Top</h3>
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>경로</th>
                      <th>요청</th>
                      <th>avg ms</th>
                      <th>p95 ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.endpoints.slice(0, 15).map((ep) => (
                      <tr key={ep.name}>
                        <td>{ep.name}</td>
                        <td>{ep.num_requests}</td>
                        <td>{ep.avg_ms}</td>
                        <td>{ep.p95_ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </section>
        ) : null}

        {history.length > 0 ? (
          <section className="panel">
            <h2>검사 이력</h2>
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>대상</th>
                  <th>VU</th>
                  <th>rps</th>
                  <th>오류율</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.job_id}>
                    <td>{h.saved_at?.slice(0, 19) ?? h.job_id.slice(0, 8)}</td>
                    <td>{h.target_name || h.target || h.base_url}</td>
                    <td>{h.users ?? "—"}</td>
                    <td>{h.rps ?? "—"}</td>
                    <td>{h.fail_ratio != null ? `${(h.fail_ratio * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>
    </>
  );
}
