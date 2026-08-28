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
import {
  exportPerfReportExcel,
  exportPerfReportHtml,
  exportPerfReportJson,
  type PerfReportData,
} from "@/lib/perfTestReport";
import {
  getDefaultPerfPortalPaths,
  PERF_TEST_PORTAL_URLS,
  type PerfPortalUrlItem,
} from "@/lib/perfTestPortalUrls";

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

type PortalUrlItem = PerfPortalUrlItem;

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

type PerfEndpoint = {
  name: string;
  method?: string;
  num_requests: number;
  num_failures?: number;
  avg_ms: number;
  p95_ms: number;
};

type RequestPreview = {
  method?: string;
  path?: string;
  name?: string;
};

type PerfResult = {
  ok?: boolean;
  ran_at?: string;
  target?: string;
  target_name?: string;
  base_url?: string;
  request_source?: string;
  har_recorded?: boolean;
  users?: number;
  duration_sec?: number;
  spawn_rate?: number;
  summary?: PerfSummary;
  time_series?: { elapsed_sec: number; rps: number; avg_ms: number; p95_ms: number; users: number }[];
  endpoints?: PerfEndpoint[];
  requests_preview?: RequestPreview[];
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

function fmtPct(ratio?: number) {
  if (ratio == null) return "—";
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatApiErrorDetail(status: number, body: Record<string, unknown>): string {
  const detail = String(body.detail || body.error || "").trim();
  if (status === 401) {
    if (detail.toLowerCase() === "unauthorized") {
      return "API 인증 실패 — apps/portal/.env.local 과 apps/api/.env.local 의 API_ACCESS_KEY 를 동일하게 설정하거나, 포털에 다시 로그인하세요.";
    }
    return detail || "인증 실패 (401)";
  }
  return detail || `API 오류 (HTTP ${status})`;
}

function applyPortalUrlPayload(
  j: Record<string, unknown>,
  setPortalUrlItems: (items: PortalUrlItem[]) => void,
  setSelectedPaths: (paths: string[]) => void,
): number {
  const list = Array.isArray(j.items) ? (j.items as PortalUrlItem[]) : [];
  if (list.length) setPortalUrlItems(list);
  const defaults = Array.isArray(j.defaults_selected)
    ? (j.defaults_selected as string[])
    : list.filter((x) => x.recommended !== false).map((x) => x.path);
  if (defaults.length) setSelectedPaths(defaults);
  return list.length;
}

export default function PerfTestPage() {
  const [env, setEnv] = useState<Record<string, unknown> | null>(null);
  const [envLoading, setEnvLoading] = useState(true);
  const [envErr, setEnvErr] = useState("");
  const [target, setTarget] = useState("manual");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:3000");
  const [access, setAccess] = useState<"public" | "auth">("public");
  const [users, setUsers] = useState(5);
  const [spawnRate, setSpawnRate] = useState(1);
  const [durationSec, setDurationSec] = useState(30);
  const [recordHar, setRecordHar] = useState(false);
  const [confirmHighLoad, setConfirmHighLoad] = useState(false);
  const [portalUrlItems, setPortalUrlItems] = useState<PortalUrlItem[]>(PERF_TEST_PORTAL_URLS);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(getDefaultPerfPortalPaths());
  const [customUrls, setCustomUrls] = useState("");
  const [urlListMsg, setUrlListMsg] = useState(
    `${PERF_TEST_PORTAL_URLS.length}개 페이지 (기본 목록)`,
  );
  const [urlListLoading, setUrlListLoading] = useState(false);
  const [candidates, setCandidates] = useState<ScenarioCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scenarioMsg, setScenarioMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string; live?: Record<string, unknown> } | null>(null);
  const [result, setResult] = useState<PerfResult | null>(null);
  const [lastJobId, setLastJobId] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadEnv = useCallback(async () => {
    setEnvLoading(true);
    setEnvErr("");
    try {
      const portalEnvRes = await fetch("/api/portal/perf-env", {
        credentials: "include",
        cache: "no-store",
      });
      if (portalEnvRes.ok) {
        const j = await readJsonResponse(portalEnvRes);
        setEnv(j as Record<string, unknown>);
        return;
      }
      if (portalEnvRes.status === 401) {
        const j = await readJsonResponse(portalEnvRes).catch(() => ({}));
        throw new Error(formatApiErrorDetail(401, j));
      }

      const healthRes = await fetchScanApi("health", undefined, 8000);
      if (healthRes.ok) {
        const health = await readJsonResponse(healthRes);
        const perf = health.perf_test as Record<string, unknown> | undefined;
        if (perf && typeof perf === "object") {
          setEnv({ ok: true, ...perf });
          if (!portalEnvRes.ok) {
            setEnvErr("포털 환경 API 대신 /health 로 조회했습니다.");
          }
          return;
        }
      }

      const eRes = await fetchScanEnvWithRetry("v1/perf-test/environment");
      if (eRes.ok) {
        const j = await readJsonResponse(eRes);
        setEnv(j as Record<string, unknown>);
        return;
      }

      const detailRes = await fetchScanApi("health/detail", undefined, 12000);
      if (detailRes.ok) {
        const detail = await readJsonResponse(detailRes);
        const perf = detail.perf_test as Record<string, unknown> | undefined;
        if (perf) {
          setEnv({ ok: true, ...perf });
          setEnvErr(
            `환경 API HTTP ${eRes.status} — health/detail 로 대체 표시했습니다. API_ACCESS_KEY·포트를 확인하세요.`,
          );
          return;
        }
      }

      let detailMsg = `API 연결 실패 (HTTP ${eRes.status})`;
      try {
        const errBody = await readJsonResponse(eRes);
        detailMsg = formatApiErrorDetail(eRes.status, errBody);
      } catch {
        if (!portalEnvRes.ok) {
          try {
            const pe = await readJsonResponse(portalEnvRes);
            detailMsg = formatApiErrorDetail(portalEnvRes.status, pe);
          } catch {
            /* ignore */
          }
        }
      }
      throw new Error(detailMsg);
    } catch (e) {
      setEnv(null);
      setEnvErr(wrapScanFetchError(e, { envProbe: true }).message);
    } finally {
      setEnvLoading(false);
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

  const loadPortalUrls = useCallback(async () => {
    setUrlListLoading(true);
    setUrlListMsg("URL 목록 불러오는 중…");
    try {
      const portalRes = await fetch("/api/portal/perf-portal-urls", {
        credentials: "include",
        cache: "no-store",
      });
      if (portalRes.ok) {
        const j = await readJsonResponse(portalRes);
        const count = applyPortalUrlPayload(j, setPortalUrlItems, setSelectedPaths);
        setUrlListMsg(`${count}개 페이지 · API 목록 반영`);
        return;
      }

      const res = await fetchScanApi("v1/perf-test/portal-urls");
      if (res.ok) {
        const j = await readJsonResponse(res);
        const count = applyPortalUrlPayload(j, setPortalUrlItems, setSelectedPaths);
        setUrlListMsg(`${count}개 페이지 · API 목록 반영`);
        return;
      }

      const errBody = await readJsonResponse(res).catch(() => ({}));
      const count = PERF_TEST_PORTAL_URLS.length;
      setUrlListMsg(
        `${count}개 페이지 (기본 목록) · API 갱신 실패: ${formatApiErrorDetail(res.status, errBody)}`,
      );
    } catch (e) {
      setUrlListMsg(
        `${PERF_TEST_PORTAL_URLS.length}개 페이지 (기본 목록) · ${wrapScanFetchError(e).message}`,
      );
    } finally {
      setUrlListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEnv();
    void loadHistory();
    void loadPortalUrls();
  }, [loadEnv, loadHistory, loadPortalUrls]);

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

  function togglePath(path: string) {
    setSelectedPaths((prev) => (prev.includes(path) ? prev.filter((x) => x !== path) : [...prev, path]));
  }

  function selectAllPaths() {
    setSelectedPaths(portalUrlItems.map((x) => x.path));
  }

  function selectRecommendedPaths() {
    const rec = portalUrlItems.filter((x) => x.recommended !== false).map((x) => x.path);
    setSelectedPaths(rec.length ? rec : portalUrlItems.map((x) => x.path));
  }

  function resolvedManualUrls(): string {
    const fromList = selectedPaths.filter(Boolean);
    const extra = customUrls
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const merged = [...fromList, ...extra];
    return merged.join("\n");
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
    fd.set("manual_urls", resolvedManualUrls());
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
    if (target !== "ipms-online" && !resolvedManualUrls().trim()) {
      setError("부하 대상 URL을 1개 이상 선택하세요.");
      return;
    }
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
      setLastJobId(jobId);
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

  const loadAllowed = Boolean(env?.load_allowed);
  const locustInstalled = Boolean(env?.locust_installed);
  const envReady = loadAllowed && locustInstalled;
  const summary = result?.summary;

  const liveLine = useMemo(() => {
    const live = progress?.live;
    if (!live) return "";
    return `VU ${live.users ?? "—"} · ${live.rps ?? "—"} rps · avg ${live.avg_ms ?? "—"} ms · p95 ${live.p95_ms ?? "—"} ms`;
  }, [progress]);

  const failPctClass =
    summary?.fail_ratio != null && summary.fail_ratio > 0.05 ? "warn" : "good";

  const requestSourceLabel = useMemo(() => {
    const src = result?.request_source;
    if (src === "har") return "Playwright HAR 녹화";
    if (src === "scenario") return "웹 품질 시나리오";
    if (src === "manual") return "URL 체크 목록";
    return src || "—";
  }, [result?.request_source]);

  function buildReportData(): PerfReportData | null {
    if (!result?.summary) return null;
    return {
      job_id: lastJobId || undefined,
      ran_at: result.ran_at ?? new Date().toISOString(),
      target: result.target ?? target,
      target_name: result.target_name,
      base_url: result.base_url ?? baseUrl,
      users: result.users ?? users,
      spawn_rate: result.spawn_rate ?? spawnRate,
      duration_sec: result.duration_sec ?? durationSec,
      request_source: requestSourceLabel,
      summary: result.summary,
      endpoints: result.endpoints,
      requests_preview: result.requests_preview,
    };
  }

  return (
    <>
      <PortalNav />
      <main className="page perf-page">
        <header className="hero">
          <h1>성능 진단</h1>
          <p className="perf-hero-lead">
            Locust HTTP 부하 테스트 · 웹 품질 시나리오 공유 · TPS · 응답시간 · 오류율
          </p>
          <div className="perf-badge-row">
            <span className="perf-badge">Locust</span>
            <span className="perf-badge">로컬 API</span>
            <span className="perf-badge">웹 품질 시나리오</span>
          </div>
        </header>

        <section className="panel">
          <div className="perf-env-head">
            <h2>도구 · 환경</h2>
            <EnvSourceBadge />
          </div>

          {envErr ? <p className={`msg ${env ? "warn" : "error"}`}>{envErr}</p> : null}
          {envLoading ? (
            <>
              <EnvToolsSkeleton />
              <p className="hint perf-env-loading">
                환경 조회 중… API가 꺼져 있으면 최대 약 12초 후 오류가 표시됩니다.{" "}
                <code>.\scripts\start-api-source-scan.ps1</code> 실행 후 「환경 다시 확인」을
                누르세요.
              </p>
            </>
          ) : null}

          {env && !envLoading ? (
            <>
              <div className="perf-env-cards">
                <div className={`perf-env-card ${loadAllowed ? "ok" : "warn"}`}>
                  <div className="perf-env-card-label">부하 실행</div>
                  <div className="perf-env-card-value">
                    {loadAllowed ? "허용 (로컬)" : "차단 (클라우드)"}
                  </div>
                </div>
                <div className={`perf-env-card ${locustInstalled ? "ok" : "warn"}`}>
                  <div className="perf-env-card-label">Locust</div>
                  <div className="perf-env-card-value">
                    {locustInstalled ? "설치됨" : "미설치"}
                  </div>
                </div>
                <div className="perf-env-card ok">
                  <div className="perf-env-card-label">VU 상한</div>
                  <div className="perf-env-card-value">{String(env.max_users ?? "100")}</div>
                </div>
              </div>

              <div className={`perf-setup-guide ${envReady ? "ready" : ""}`}>
                <h3>{envReady ? "실행 준비 완료" : "설치 · 실행 가이드"}</h3>
                {envReady ? (
                  <ol className="perf-setup-steps">
                    <li>
                      <strong>Base URL</strong>을 부하 대상(보통 포털 <code>http://127.0.0.1:3000</code>
                      )으로 맞춥니다.
                    </li>
                    <li>
                      <strong>부하 대상 URL</strong>에서 검사할 페이지를 체크하거나, 대상 앱을 고른 뒤{" "}
                      <strong>시나리오 불러오기</strong>를 누릅니다.
                    </li>
                    <li>
                      VU·지속 시간을 설정하고 <strong>성능검사 실행</strong>을 클릭합니다. (처음엔 VU 5 ·
                      30초 권장)
                    </li>
                  </ol>
                ) : (
                  <ol className="perf-setup-steps">
                    {!loadAllowed ? (
                      <li>
                        <strong>로컬 API</strong>가 필요합니다. Render(클라우드)에서는 부하 실행이
                        차단됩니다. 포털 <code>.env.local</code>의{" "}
                        <code>NEXT_PUBLIC_API_BASE_URL</code>을 <code>http://127.0.0.1:8001</code>로
                        설정하세요.
                      </li>
                    ) : null}
                    {!locustInstalled ? (
                      <li>
                        API 터미널에서 Locust를 설치합니다.
                        <pre className="wq-code-block">{`cd C:\\Mywork\\MyPlatform-2.0\\apps\\api
pip install -r requirements.txt`}</pre>
                        또는 프로젝트 루트에서{" "}
                        <code>.\scripts\start-api-source-scan.ps1</code> (의존성 포함 기동)
                      </li>
                    ) : null}
                    <li>
                      <strong>터미널 1</strong> — API:{" "}
                      <code>.\scripts\start-api-source-scan.ps1</code>
                    </li>
                    <li>
                      <strong>터미널 2</strong> — 포털:{" "}
                      <code>cd apps\\portal</code> → <code>npm run dev</code>
                    </li>
                    <li>
                      설치·재시작 후 아래 <strong>환경 다시 확인</strong> → Locust·로컬 API가 모두
                      초록이면 실행 가능합니다.
                    </li>
                  </ol>
                )}
              </div>
            </>
          ) : null}

          <div className="source-scan-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn secondary"
              disabled={envLoading}
              onClick={() => void loadEnv()}
            >
              {envLoading ? "조회 중…" : "환경 다시 확인"}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>부하 설정</h2>

          <div className="perf-settings-grid">
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
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:3000"
              />
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
              <input
                type="number"
                min={1}
                max={100}
                value={users}
                onChange={(e) => setUsers(Number(e.target.value))}
              />
            </div>
            <div className="source-scan-field">
              <label>램프업 (명/초)</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={spawnRate}
                onChange={(e) => setSpawnRate(Number(e.target.value))}
              />
            </div>
            <div className="source-scan-field">
              <label>지속 시간 (초)</label>
              <input
                type="number"
                min={5}
                max={3600}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
              />
            </div>
          </div>

          {target !== "ipms-online" ? (
            <div className="perf-scenario-panel">
              <div className="perf-scenario-panel-head">
                <h3>부하 대상 URL</h3>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={urlListLoading}
                    onClick={() => void loadPortalUrls()}
                  >
                    {urlListLoading ? "불러오는 중…" : "URL 목록 새로고침"}
                  </button>
                  <button type="button" className="btn ghost" onClick={selectRecommendedPaths}>
                    권장만
                  </button>
                  <button type="button" className="btn ghost" onClick={selectAllPaths}>
                    전체 선택
                  </button>
                </div>
              </div>
              <p className="hint">
                {urlListMsg || "포털 페이지 경로를 선택합니다. Base URL에 붙여 Locust가 GET 요청합니다."}
              </p>
              {selectedPaths.length === 0 && !customUrls.trim() ? (
                <p className="msg warn">선택된 URL이 없습니다. 최소 1개 이상 체크하세요.</p>
              ) : (
                <p className="hint">
                  선택 {selectedPaths.length}개
                  {customUrls.trim() ? " + 직접 입력" : ""} ·{" "}
                  <code>{resolvedManualUrls().split("\n").filter(Boolean).join(", ")}</code>
                </p>
              )}
              {portalUrlItems.length > 0 ? (
                <ul className="source-scan-option-list">
                  {portalUrlItems.map((item) => (
                    <li key={item.id}>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={selectedPaths.includes(item.path)}
                          onChange={() => togglePath(item.path)}
                        />
                        <span>
                          <strong>{item.name}</strong> <code>{item.path}</code>
                          {item.requires_auth ? (
                            <span className="perf-url-badge auth">로그인 필요</span>
                          ) : (
                            <span className="perf-url-badge public">공개</span>
                          )}
                        </span>
                      </label>
                      {item.description ? (
                        <p className="source-scan-option-desc">{item.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="source-scan-field source-scan-field-full" style={{ marginTop: 12 }}>
                <label>추가 경로 (직접 입력 · 쉼표 · 줄바꿈)</label>
                <textarea
                  rows={2}
                  value={customUrls}
                  onChange={(e) => setCustomUrls(e.target.value)}
                  placeholder="/apps/custom-page"
                />
              </div>
            </div>
          ) : null}

          {target !== "manual" ? (
            <div className="perf-scenario-panel">
              <div className="perf-scenario-panel-head">
                <h3>웹 품질 시나리오</h3>
                <div className="btn-row">
                  <button type="button" className="btn ghost" onClick={() => void loadScenarios()}>
                    시나리오 불러오기
                  </button>
                </div>
              </div>
              <p className="hint">{scenarioMsg || "대상 앱의 URL 후보를 불러옵니다."}</p>
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
            </div>
          ) : null}

          <div className="perf-section-divider" />

          <div className="perf-options-row">
            <label className="check-row" title={target === "manual" ? "대상 앱 선택 시에만 사용 가능" : undefined}>
              <input
                type="checkbox"
                checked={recordHar}
                disabled={target === "manual"}
                onChange={(e) => setRecordHar(e.target.checked)}
              />
              Playwright HAR 녹화
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={confirmHighLoad}
                onChange={(e) => setConfirmHighLoad(e.target.checked)}
              />
              고부하 확인 (VU &gt; 20 또는 외부 URL)
            </label>
          </div>
          <div className="perf-option-help">
            <p>
              <strong>Playwright HAR 녹화</strong> — 대상 앱을 선택했을 때, Playwright가 페이지를 한 번 열고
              네트워크 트래픽(HAR)을 기록합니다. 기록된 HTTP 요청이 Locust 부하 대상이 됩니다. 시나리오 URL
              목록 대신 실제 브라우저가 호출한 API·리소스를 검사할 때 사용합니다. (API 서버에 Playwright
              설치 필요 · URL 직접 입력 모드에서는 사용 불가)
            </p>
            <p>
              <strong>고부하 확인</strong> — 안전 확인용 체크입니다. VU 20명 초과 시 반드시 체크해야 실행됩니다.
              localhost가 아닌 외부 URL에 VU 10명 초과로 테스트할 때도 체크를 권장합니다. 운영·공용 서버에
              의도치 않은 고부하를 방지합니다.
            </p>
          </div>

          <div className="perf-run-block">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !envReady}
              onClick={() => void runTest()}
            >
              {busy ? "실행 중…" : "성능검사 실행"}
            </button>
            {!envReady ? (
              <p className="perf-run-hint">Locust 설치 + 로컬 API 연결 후 실행할 수 있습니다.</p>
            ) : (
              <p className="perf-run-hint">
                권장: VU 5 · 30초 · Base URL <code>http://127.0.0.1:3000</code> · 공개 URL(
                <code>/login</code>) 또는 로그인 필요 페이지는 리다이렉트만 측정됩니다.
              </p>
            )}
          </div>

          {progress ? (
            <div className="run-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="hint">{progress.message}</p>
              {liveLine ? <p className="perf-live-stats">{liveLine}</p> : null}
              {progress.live?.total_requests != null ? (
                <p className="hint">
                  누적 HTTP 요청 {String(progress.live.total_requests)}건
                  {progress.live.fail_ratio != null
                    ? ` · 오류율 ${(Number(progress.live.fail_ratio) * 100).toFixed(1)}%`
                    : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="msg error">{error}</p> : null}
        </section>

        {summary ? (
          <section className="panel">
            <div className="perf-result-head">
              <h2>결과 요약</h2>
              <div className="btn-row perf-export-row">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const data = buildReportData();
                    if (data) exportPerfReportHtml(data);
                  }}
                >
                  HTML 보고서
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const data = buildReportData();
                    if (data) exportPerfReportExcel(data);
                  }}
                >
                  Excel
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const data = buildReportData();
                    if (data) exportPerfReportJson(data);
                  }}
                >
                  JSON
                </button>
              </div>
            </div>
            <p className="hint perf-result-meta">
              {result?.target_name || result?.target || "manual"} · {result?.base_url ?? baseUrl} · 검사 출처:{" "}
              {requestSourceLabel}
              {result?.ran_at ? ` · ${result.ran_at.slice(0, 19).replace("T", " ")}` : ""}
            </p>
            <div className="perf-metrics">
              <div className="perf-metric">
                <div className="perf-metric-label">TPS (rps)</div>
                <div className="perf-metric-value good">{summary.rps ?? "—"}</div>
              </div>
              <div className="perf-metric">
                <div className="perf-metric-label">평균 응답</div>
                <div className="perf-metric-value">
                  {summary.avg_response_time_ms != null ? `${summary.avg_response_time_ms} ms` : "—"}
                </div>
              </div>
              <div className="perf-metric">
                <div className="perf-metric-label">p95</div>
                <div className="perf-metric-value">
                  {summary.p95_ms != null ? `${summary.p95_ms} ms` : "—"}
                </div>
              </div>
              <div className="perf-metric">
                <div className="perf-metric-label">오류율</div>
                <div className={`perf-metric-value ${failPctClass}`}>{fmtPct(summary.fail_ratio)}</div>
              </div>
              <div className="perf-metric">
                <div className="perf-metric-label">총 요청</div>
                <div className="perf-metric-value">{summary.total_requests ?? "—"}</div>
              </div>
              <div className="perf-metric">
                <div className="perf-metric-label">VU · 시간</div>
                <div className="perf-metric-value" style={{ fontSize: "1.1rem" }}>
                  {summary.users ?? "—"} · {summary.duration_sec ?? "—"}s
                </div>
              </div>
            </div>

            {result?.requests_preview?.length ? (
              <>
                <h3>검사 URL 목록</h3>
                <p className="hint">Locust가 부하를 건 HTTP 경로입니다.</p>
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>메서드</th>
                      <th>경로</th>
                      <th>이름</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.requests_preview.map((r, i) => (
                      <tr key={`${r.path ?? r.name ?? i}-${i}`}>
                        <td>{i + 1}</td>
                        <td>{r.method ?? "GET"}</td>
                        <td>
                          <code>{r.path ?? r.name ?? "—"}</code>
                        </td>
                        <td>{r.name && r.name !== r.path ? r.name : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            {result?.endpoints?.length ? (
              <>
                <h3>항목별 성능</h3>
                <p className="hint">Locust 실행 중 경로별 집계 (요청 수 내림차순)</p>
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>경로</th>
                      <th>메서드</th>
                      <th>요청</th>
                      <th>실패</th>
                      <th>avg ms</th>
                      <th>p95 ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.endpoints.map((ep) => (
                      <tr key={`${ep.method ?? "GET"}-${ep.name}`}>
                        <td>{ep.name}</td>
                        <td>{ep.method ?? "GET"}</td>
                        <td>{ep.num_requests}</td>
                        <td>{ep.num_failures ?? 0}</td>
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

        <section className="panel">
          <h2>검사 이력</h2>
          {history.length > 0 ? (
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
                    <td>{fmtPct(h.fail_ratio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="perf-history-empty">아직 저장된 이력이 없습니다. 첫 검사를 실행해 보세요.</p>
          )}
        </section>
      </main>
    </>
  );
}
