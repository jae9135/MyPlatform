"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatUtcIsoToKst } from "@/lib/formatDateTime";
import {
  aggregateByScenarioLabel,
  buildPerfFailDiagnosis,
  buildPerfInsights,
  endpointRowClass,
  parseEndpointName,
  type PerfEndpointRow,
} from "@/lib/perfTestInsights";

const IPMS_DEFAULT_URL = "http://14.35.194.178:12000/ipms.online/";
const MANUAL_BASE_URL_PLACEHOLDER = "https://example.com/";

const SESSION_STATUS = {
  checking: "로컬 세션 점검 중…",
  launching: "로그인 창 실행 중…",
  loginRequired: "로그인하세요 — API 서버 Chromium 창에서 로그인을 완료하세요.",
  done: "로그인 완료",
} as const;

function isIpmsLikeUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const path = (parsed.pathname || "").toLowerCase();
    return path.includes("ipms.online");
  } catch {
    return raw.toLowerCase().includes("ipms.online");
  }
}

/** 로컬 MyPlatform 포털(127.0.0.1:3000 등) — 체크리스트 URL 사용 가능 */
function isPortalLocalBaseUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const host = parsed.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return false;
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    if (port !== "3000") return false;
    const path = (parsed.pathname || "/").replace(/\/+$/, "") || "/";
    return path === "/";
  } catch {
    return false;
  }
}

function parseManualPathLines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 체크리스트·직접 입력 경로 비교용 정규화 */
function normalizeManualPath(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return t.startsWith("/") ? t : `/${t.replace(/^\/+/, "")}`;
}

function dedupeManualPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const norm = normalizeManualPath(raw);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

function scenarioAccessTier(c: ScenarioCandidate): "public" | "auth" {
  const t = (c.access || "auth").trim().toLowerCase();
  return t === "public" ? "public" : "auth";
}

/** 로그인 필요 체크 + 세션 준비 — 해제 시 로그아웃으로 간주 */
function sessionActiveForPerf(needLogin: boolean, sessionReady: boolean): boolean {
  return needLogin && sessionReady;
}

function scenarioCheckEnabled(c: ScenarioCandidate, sessionActive: boolean): boolean {
  return scenarioAccessTier(c) !== "auth" || sessionActive;
}

function portalUrlCheckEnabled(item: PortalUrlItem, sessionActive: boolean): boolean {
  return !item.requires_auth || sessionActive;
}

function PerfCheckBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="perf-url-badge ok">점검가능</span>
  ) : (
    <span className="perf-url-badge skip">점검불가</span>
  );
}

function buildAccessParam(includePublic: boolean, includeAuth: boolean): string {
  const tiers: string[] = [];
  if (includePublic) tiers.push("public");
  if (includeAuth) tiers.push("auth");
  return tiers.join(",") || "public";
}

function defaultBaseUrlForTarget(targetId: string): string {
  if (targetId === "ipms-online") return IPMS_DEFAULT_URL;
  if (targetId === "manual") return "";
  return "http://127.0.0.1:3000";
}

function baseUrlPlaceholderForTarget(targetId: string): string {
  if (targetId === "manual") return MANUAL_BASE_URL_PLACEHOLDER;
  if (targetId === "ipms-online") return IPMS_DEFAULT_URL;
  return "http://127.0.0.1:3000";
}

function sessionProgressMessage(
  status: string,
  pct: number,
  apiMessage?: string,
): string {
  if (status === "done") return SESSION_STATUS.done;
  if (status === "checking") return SESSION_STATUS.checking;
  if (status === "running" || status === "queued") {
    if (pct >= 10) return SESSION_STATUS.loginRequired;
    return SESSION_STATUS.launching;
  }
  return apiMessage?.trim() || SESSION_STATUS.launching;
}

const PERF_LOGIN_SESSION_KEY = "perf-test-login-session";

type PersistedLoginSession = {
  jobId: string;
  pageUrl: string;
};

function loadPersistedLoginSession(): PersistedLoginSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PERF_LOGIN_SESSION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { jobId?: string; pageUrl?: string };
    if (j?.jobId?.trim() && j?.pageUrl?.trim()) {
      return { jobId: j.jobId.trim(), pageUrl: j.pageUrl.trim() };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function savePersistedLoginSession(jobId: string, pageUrl: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      PERF_LOGIN_SESSION_KEY,
      JSON.stringify({ jobId: jobId.trim(), pageUrl: pageUrl.trim() }),
    );
  } catch {
    /* ignore */
  }
}

function clearPersistedLoginSession() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PERF_LOGIN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

type CachedBrowserSession = {
  jobId: string;
  pageUrl: string;
};

const TARGET_OPTIONS = [
  { id: "manual", label: "URL 직접 입력" },
  { id: "portal", label: "Portal" },
  { id: "my-gantt", label: "MyGantt" },
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
  access?: string;
};

type SkippedScenario = {
  state_id?: string;
  label?: string;
  access?: string;
  reason?: string;
};

type ScenarioPreviewItem = {
  state_id?: string;
  label?: string;
  open_ok?: boolean;
  open_error?: string;
  duration_ms?: number;
};

type ScenarioHarStatus = {
  state_id?: string;
  label?: string;
  open_ok?: boolean;
  open_error?: string;
  har_request_count?: number;
};

type ScenarioPreviewResult = {
  ok?: boolean;
  errors?: string[];
  warnings?: string[];
  summary?: { total?: number; ok?: number; fail?: number };
  items?: ScenarioPreviewItem[];
  skipped?: SkippedScenario[];
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
  har_fallback_reason?: string;
  har_targets?: number;
  scenario_har?: ScenarioHarStatus[];
  session_used?: boolean;
  skipped_scenarios?: SkippedScenario[];
  users?: number;
  duration_sec?: number;
  spawn_rate?: number;
  summary?: PerfSummary;
  time_series?: { elapsed_sec: number; rps: number; avg_ms: number; p95_ms: number; users: number }[];
  endpoints?: PerfEndpointRow[];
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

type SessionProgress = {
  job_id: string;
  status: string;
  pct: number;
  message: string;
  error?: string;
  step_label?: string;
};


function isIpmsSiteUrl(url: string): boolean {
  const raw = url.trim().toLowerCase();
  return raw.includes("ipms");
}

function perfSessionNextStepHint(mode: "app" | "manual-checklist" | "manual-paths"): string {
  if (mode === "manual-paths") {
    return "다음: 아래 「부하 경로」 입력 확인 → (선택) HAR 녹화 → 「성능검사 실행」";
  }
  if (mode === "manual-checklist") {
    return "다음: 아래 「부하 대상 URL」 체크 → (선택) HAR 녹화 → 「성능검사 실행」";
  }
  return "다음: 「화면 시나리오」 체크 → (선택) HAR 녹화 → 「성능검사 실행」";
}

function manualSessionMode(targetId: string): "app" | "manual-checklist" | "manual-paths" {
  if (targetId === "portal") return "manual-checklist";
  if (targetId === "manual") return "manual-paths";
  return "app";
}

function fmtPct(ratio?: number) {
  if (ratio == null) return "—";
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatHistoryWhen(savedAt?: string, jobId?: string): string {
  if (savedAt?.trim()) return formatUtcIsoToKst(savedAt);
  return jobId ? jobId.slice(0, 8) : "—";
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

function EndpointNameCell({ name }: { name: string }) {
  const { label, path } = parseEndpointName(name);
  if (label && path) {
    return (
      <span>
        {label}
        <span className="perf-endpoint-path">
          {" "}
          · <code>{path}</code>
        </span>
      </span>
    );
  }
  if (path) return <code>{path}</code>;
  return <>{label || name}</>;
}

function EndpointPerfTable({
  rows,
  emptyHint,
}: {
  rows: PerfEndpointRow[];
  emptyHint?: string;
}) {
  if (!rows.length) {
    return <p className="hint perf-history-empty">{emptyHint ?? "집계된 항목이 없습니다."}</p>;
  }
  return (
    <div className="perf-table-wrap">
      <table className="perf-data-table perf-endpoints-table">
        <colgroup>
          <col className="perf-col-name" />
          <col className="perf-col-method" />
          <col className="perf-col-num" />
          <col className="perf-col-num" />
          <col className="perf-col-num" />
          <col className="perf-col-num" />
        </colgroup>
        <thead>
          <tr>
            <th className="perf-cell-left">항목 / 경로</th>
            <th>메서드</th>
            <th>요청</th>
            <th>실패</th>
            <th>avg ms</th>
            <th>p95 ms</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ep, i) => (
            <tr
              key={`${ep.method ?? "GET"}-${ep.name}-${i}`}
              className={ep.pending ? "" : endpointRowClass(ep.p95_ms, ep.num_failures ?? 0)}
            >
              <td className="perf-cell-left perf-endpoint-name">
                <EndpointNameCell name={ep.name} />
              </td>
              <td>{ep.method ?? "GET"}</td>
              <td>{ep.pending ? "—" : (ep.num_requests ?? 0)}</td>
              <td>{ep.pending ? "—" : ep.num_failures ?? 0}</td>
              <td>{ep.pending ? "—" : ep.avg_ms}</td>
              <td>{ep.pending ? "—" : ep.p95_ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function applyPortalUrlPayload(
  j: Record<string, unknown>,
  setPortalUrlItems: (items: PortalUrlItem[]) => void,
  setSelectedPaths: (paths: string[]) => void,
  sessionActive: boolean,
): number {
  const list = Array.isArray(j.items) ? (j.items as PortalUrlItem[]) : [];
  if (list.length) setPortalUrlItems(list);
  const rawDefaults = Array.isArray(j.defaults_selected)
    ? (j.defaults_selected as string[])
    : list.filter((x) => x.recommended === true).map((x) => x.path);
  const defaults = rawDefaults.filter((path) => {
    const item = list.find((x) => x.path === path);
    return item ? portalUrlCheckEnabled(item, sessionActive) : false;
  });
  if (defaults.length) {
    setSelectedPaths(defaults);
  } else {
    const fallback = list
      .filter((x) => x.recommended && portalUrlCheckEnabled(x, sessionActive))
      .map((x) => x.path);
    if (fallback.length) setSelectedPaths(fallback);
  }
  return list.length;
}

export default function PerfTestPage() {
  const [env, setEnv] = useState<Record<string, unknown> | null>(null);
  const [envLoading, setEnvLoading] = useState(true);
  const [envErr, setEnvErr] = useState("");
  const [target, setTarget] = useState("portal");
  const [baseUrlInput, setBaseUrlInput] = useState("http://127.0.0.1:3000");
  const [appliedBaseUrl, setAppliedBaseUrl] = useState("http://127.0.0.1:3000");
  const [accessPublic, setAccessPublic] = useState(true);
  const [accessAuth, setAccessAuth] = useState(true);
  const [users, setUsers] = useState(5);
  const [spawnRate, setSpawnRate] = useState(1);
  const [durationSec, setDurationSec] = useState(30);
  const [recordHar, setRecordHar] = useState(false);
  const [confirmHighLoad, setConfirmHighLoad] = useState(false);
  const [portalUrlItems, setPortalUrlItems] = useState<PortalUrlItem[]>(PERF_TEST_PORTAL_URLS);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(getDefaultPerfPortalPaths());
  const [customUrls, setCustomUrls] = useState("");
  const [portalExtraPaths, setPortalExtraPaths] = useState("");
  const [urlListMsg, setUrlListMsg] = useState(
    `${PERF_TEST_PORTAL_URLS.length}개 페이지 (기본 목록)`,
  );
  const [urlListLoading, setUrlListLoading] = useState(false);
  const [candidates, setCandidates] = useState<ScenarioCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scenarioMsg, setScenarioMsg] = useState("");
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<ScenarioPreviewResult | null>(null);
  const [previewMsg, setPreviewMsg] = useState("");
  const previewBlockRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string; live?: Record<string, unknown> } | null>(null);
  const [result, setResult] = useState<PerfResult | null>(null);
  const [lastJobId, setLastJobId] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [needLogin, setNeedLogin] = useState(false);
  const [sessionJobId, setSessionJobId] = useState("");
  const [sessionPageUrl, setSessionPageUrl] = useState("");
  const [sessionStorageFile, setSessionStorageFile] = useState<File | null>(null);
  const [sessionProgress, setSessionProgress] = useState<SessionProgress | null>(null);
  const [sessionValidated, setSessionValidated] = useState(false);

  const accessParam = buildAccessParam(accessPublic, accessAuth);
  const sessionsByUrlRef = useRef<Record<string, CachedBrowserSession>>({});
  const uploadSessionByUrlRef = useRef<Record<string, File>>({});
  const baseUrlDirty = baseUrlInput.trim() !== appliedBaseUrl.trim();
  const sessionViaUpload = Boolean(sessionStorageFile);
  const sessionViaBrowser = Boolean(
    sessionJobId.trim() && sessionPageUrl.trim() === appliedBaseUrl.trim(),
  );
  const portalSessionGate = !isPortalLocalBaseUrl(appliedBaseUrl) || sessionValidated;
  const sessionReady = (sessionViaUpload || sessionViaBrowser) && portalSessionGate;
  const sessionActive = sessionActiveForPerf(needLogin, sessionReady);
  const sessionActiveRef = useRef(sessionActive);
  sessionActiveRef.current = sessionActive;

  function cacheBrowserSession(jobId: string, pageUrl: string) {
    const url = pageUrl.trim();
    if (!url || !jobId.trim()) return;
    sessionsByUrlRef.current[url] = { jobId: jobId.trim(), pageUrl: url };
    savePersistedLoginSession(jobId.trim(), url);
  }

  function cacheUploadSession(pageUrl: string, file: File) {
    const url = pageUrl.trim();
    if (!url) return;
    uploadSessionByUrlRef.current[url] = file;
  }

  function restoreSessionForUrl(pageUrl: string) {
    void restoreSessionForUrlAsync(pageUrl);
  }

  async function restoreSessionForUrlAsync(pageUrl: string) {
    const url = pageUrl.trim();
    if (!url) {
      setSessionJobId("");
      setSessionPageUrl("");
      setSessionStorageFile(null);
      setSessionProgress(null);
      setSessionValidated(false);
      return;
    }

    const uploadFile = uploadSessionByUrlRef.current[url];
    if (uploadFile) {
      setSessionStorageFile(uploadFile);
      setSessionJobId("");
      setSessionPageUrl(url);
      setSessionValidated(false);
      setSessionProgress({
        job_id: "upload",
        status: "checking",
        pct: 50,
        message: SESSION_STATUS.checking,
      });
      const ok = await validateUploadSession(uploadFile, url);
      if (ok) {
        setSessionProgress({
          job_id: "upload",
          status: "done",
          pct: 100,
          message: SESSION_STATUS.done,
        });
      } else {
        setSessionStorageFile(null);
        delete uploadSessionByUrlRef.current[url];
      }
      return;
    }

    const cached = sessionsByUrlRef.current[url];
    const persisted = loadPersistedLoginSession();
    const jobId =
      cached?.jobId || (persisted?.pageUrl === url ? persisted.jobId : "");
    if (jobId) {
      setSessionJobId(jobId);
      setSessionPageUrl(url);
      setSessionStorageFile(null);
      setSessionValidated(false);
      setSessionProgress({
        job_id: jobId,
        status: "checking",
        pct: 50,
        message: SESSION_STATUS.checking,
      });
      const ok = await validateBrowserSession(jobId, url);
      if (ok) {
        cacheBrowserSession(jobId, url);
        setSessionProgress({
          job_id: jobId,
          status: "done",
          pct: 100,
          message: SESSION_STATUS.done,
        });
      }
      return;
    }

    setSessionJobId("");
    setSessionPageUrl("");
    setSessionStorageFile(null);
    setSessionProgress(null);
    setSessionValidated(false);
  }

  const showIpmsControls = target === "ipms-online" && isIpmsLikeUrl(appliedBaseUrl);
  const showScenarioPanel =
    target !== "manual" && target !== "portal" && !baseUrlDirty && (target !== "ipms-online" || showIpmsControls);

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

      if (!portalEnvRes.ok && portalEnvRes.status === 503) {
        const j = await readJsonResponse(portalEnvRes).catch(() => ({}));
        const msg = formatApiErrorDetail(portalEnvRes.status, j);
        if (msg) throw new Error(msg);
      }

      const healthRes = await fetchScanApi("health", undefined, 8000, { forceProxy: true });
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

      const detailRes = await fetchScanApi("health/detail", undefined, 12000, { forceProxy: true });
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
        const count = applyPortalUrlPayload(
          j,
          setPortalUrlItems,
          setSelectedPaths,
          sessionActiveRef.current,
        );
        setUrlListMsg(`${count}개 페이지 · API 목록 반영`);
        return;
      }

      const res = await fetchScanApi("v1/perf-test/portal-urls");
      if (res.ok) {
        const j = await readJsonResponse(res);
        const count = applyPortalUrlPayload(
          j,
          setPortalUrlItems,
          setSelectedPaths,
          sessionActiveRef.current,
        );
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
  }, [loadEnv, loadHistory]);

  useEffect(() => {
    if (target === "portal" && isPortalLocalBaseUrl(appliedBaseUrl)) {
      void loadPortalUrls();
    }
  }, [target, appliedBaseUrl, loadPortalUrls]);

  useEffect(() => {
    if (sessionJobId.trim() || sessionStorageFile) return;
    const persisted = loadPersistedLoginSession();
    if (!persisted || persisted.pageUrl !== appliedBaseUrl.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchScanApi(`v1/web-quality/ipms/session/${persisted.jobId}`);
        const j = await readJsonResponse(res);
        if (cancelled || !res.ok || j.status !== "done") return;
        setSessionJobId(persisted.jobId);
        setSessionPageUrl(persisted.pageUrl);
        setSessionValidated(false);
        setSessionProgress({
          job_id: persisted.jobId,
          status: "checking",
          pct: 50,
          message: SESSION_STATUS.checking,
        });
        const ok = await validateBrowserSession(persisted.jobId, persisted.pageUrl);
        if (cancelled || !ok) return;
        cacheBrowserSession(persisted.jobId, persisted.pageUrl);
        setSessionProgress({
          job_id: persisted.jobId,
          status: "done",
          pct: 100,
          message: SESSION_STATUS.done,
        });
      } catch {
        if (!cancelled) clearPersistedLoginSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appliedBaseUrl, sessionJobId, sessionStorageFile]);

  const loadScenarios = useCallback(async (opts?: { clearList?: boolean }) => {
    if (target === "manual" || target === "portal") return;
    if (target === "ipms-online" && showIpmsControls && !accessPublic && !accessAuth) {
      setCandidates([]);
      setSelectedIds([]);
      setScenarioMsg("공개·로그인 시나리오 중 하나 이상 체크하세요.");
      setScenarioLoading(false);
      return;
    }
    setScenarioLoading(true);
    if (opts?.clearList !== false) {
      setScenarioMsg("시나리오 불러오는 중…");
    }
    try {
      const q = new URLSearchParams({ target });
      if (appliedBaseUrl) q.set("page_url", appliedBaseUrl);
      if (target === "ipms-online" && showIpmsControls) q.set("access", accessParam);
      const res = await fetchScanApi(`v1/perf-test/scenarios?${q}`);
      const j = await readJsonResponse(res);
      const list = Array.isArray(j.candidates) ? (j.candidates as ScenarioCandidate[]) : [];
      setCandidates(list);
      const defaultsRaw = Array.isArray(j.defaults_selected)
        ? (j.defaults_selected as string[])
        : list.filter((c) => c.recommended !== false && c.selectable !== false).map((c) => c.state_id);
      const defaults = defaultsRaw.filter((id) => {
        const c = list.find((x) => x.state_id === id);
        return c ? scenarioCheckEnabled(c, sessionActiveRef.current) : false;
      });
      setSelectedIds(defaults);
      setScenarioMsg(list.length ? `${list.length}개 시나리오` : "시나리오 없음");
      setPreviewResult(null);
      setPreviewMsg("");
    } catch (e) {
      setScenarioMsg(wrapScanFetchError(e).message);
    } finally {
      setScenarioLoading(false);
    }
  }, [target, appliedBaseUrl, accessParam, showIpmsControls, accessPublic, accessAuth]);

  function applyBaseUrl() {
    const trimmed = baseUrlInput.trim();
    if (!trimmed) {
      setError("Base URL을 입력하세요.");
      return;
    }
    setError("");
    scenarioFetchKeyRef.current = "";
    setAppliedBaseUrl(trimmed);
    restoreSessionForUrl(trimmed);
    if (target === "portal") {
      if (isPortalLocalBaseUrl(trimmed)) {
        void loadPortalUrls();
        setUrlListMsg("포털 페이지 체크리스트 — 로그인 필요 항목은 세션 준비 후 선택 가능");
      } else {
        setUrlListMsg("Portal 탭은 로컬 포털 Base URL(http://127.0.0.1:3000)을 적용하세요.");
      }
    } else if (target === "manual") {
      if (!isPortalLocalBaseUrl(trimmed)) {
        if (!customUrls.trim()) {
          setCustomUrls("/");
        }
        setUrlListMsg("외부 Base URL — 아래 경로를 직접 입력하세요 (Base URL path 기준 상대 경로).");
      } else {
        setUrlListMsg("로컬 포털 체크리스트는 「Portal」 탭을 사용하세요. 여기는 경로 직접 입력만 합니다.");
      }
    }
  }

  const scenarioFetchKeyRef = useRef("");
  const scenarioTargetRef = useRef("");

  useEffect(() => {
    if (target === "manual" || target === "portal") {
      scenarioFetchKeyRef.current = "";
      scenarioTargetRef.current = "";
      setCandidates([]);
      setSelectedIds([]);
      setScenarioMsg("");
      return;
    }
    if (scenarioTargetRef.current !== target) {
      setCandidates([]);
      setSelectedIds([]);
      scenarioTargetRef.current = target;
      scenarioFetchKeyRef.current = "";
      setScenarioMsg("시나리오 불러오는 중…");
    }
    if (target === "ipms-online" && !isIpmsLikeUrl(appliedBaseUrl)) {
      setCandidates([]);
      setSelectedIds([]);
      setScenarioMsg("IPMS URL이 아닙니다. IPMS 주소를 적용하거나 「URL 직접 입력」 탭을 사용하세요.");
      return;
    }
    const fetchKey = `${target}|${appliedBaseUrl}|${accessParam}`;
    if (scenarioFetchKeyRef.current === fetchKey) {
      return;
    }
    scenarioFetchKeyRef.current = fetchKey;
    void loadScenarios({ clearList: true });
  }, [target, appliedBaseUrl, accessParam, loadScenarios]);

  async function pollSessionJob(jobId: string, targetUrl: string): Promise<void> {
    for (let i = 0; i < 900; i++) {
      const res = await fetchScanApi(`v1/web-quality/ipms/session/${jobId}`);
      const j = await readJsonResponse(res);
      if (!res.ok) throw new Error(String(j.message || j.detail || "세션 상태 조회 실패"));
      setSessionProgress({
        job_id: jobId,
        status: String(j.status || ""),
        pct: Number(j.pct) || 0,
        message: sessionProgressMessage(
          String(j.status || ""),
          Number(j.pct) || 0,
          String(j.message || ""),
        ),
        error: j.error ? String(j.error) : undefined,
        step_label: j.step_label ? String(j.step_label) : undefined,
      });
      if (j.status === "done") {
        const ok = await validateBrowserSession(jobId, targetUrl);
        if (!ok) return;
        setSessionJobId(jobId);
        setSessionPageUrl(targetUrl.trim());
        cacheBrowserSession(jobId, targetUrl.trim());
        setSessionProgress({
          job_id: jobId,
          status: "done",
          pct: 100,
          message: SESSION_STATUS.done,
        });
        return;
      }
      if (j.status === "error") throw new Error(String(j.error || j.message || "세션 생성 실패"));
      if (j.status === "cancelled") throw new Error("세션 생성이 취소되었습니다.");
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error("세션 생성 시간 초과");
  }

  async function cancelSession() {
    const jobId = sessionProgress?.job_id?.trim();
    if (!jobId) return;
    try {
      const res = await fetchScanApi(`v1/web-quality/jobs/${jobId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const j = await readJsonResponse(res);
        throw new Error(String(j.detail || `취소 실패 (HTTP ${res.status})`));
      }
      setSessionProgress(null);
      setError("세션 생성이 취소되었습니다.");
    } catch (e) {
      setError(wrapScanFetchError(e).message);
    }
  }

  async function cancelRun() {
    const jobId = lastJobId.trim();
    if (!jobId || !busy) return;
    try {
      const res = await fetchScanApi(`v1/perf-test/jobs/${jobId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const j = await readJsonResponse(res);
        throw new Error(String(j.detail || `취소 실패 (HTTP ${res.status})`));
      }
      setProgress((prev) =>
        prev ? { ...prev, message: "취소 요청됨 — 작업 종료 대기 중…" } : prev,
      );
    } catch (e) {
      setError(wrapScanFetchError(e).message);
    }
  }

  async function tryConnectExistingSession(): Promise<boolean> {
    if (sessionStorageFile) {
      if (sessionValidated) return true;
      return validateUploadSession(sessionStorageFile, appliedBaseUrl);
    }
    if (sessionJobId.trim() && sessionPageUrl.trim() === appliedBaseUrl.trim()) {
      if (sessionValidated) return true;
      const ok = await validateBrowserSession(sessionJobId, appliedBaseUrl);
      if (ok) {
        setSessionProgress({
          job_id: sessionJobId,
          status: "done",
          pct: 100,
          message: SESSION_STATUS.done,
        });
      }
      return ok;
    }
    const persisted = loadPersistedLoginSession();
    if (!persisted || persisted.pageUrl !== appliedBaseUrl.trim()) return false;
    try {
      const res = await fetchScanApi(`v1/web-quality/ipms/session/${persisted.jobId}`);
      const j = await readJsonResponse(res);
      if (!res.ok || j.status !== "done") {
        clearPersistedLoginSession();
        return false;
      }
      const ok = await validateBrowserSession(persisted.jobId, persisted.pageUrl);
      if (!ok) {
        clearPersistedLoginSession();
        return false;
      }
      setSessionJobId(persisted.jobId);
      setSessionPageUrl(persisted.pageUrl);
      sessionsByUrlRef.current[persisted.pageUrl] = {
        jobId: persisted.jobId,
        pageUrl: persisted.pageUrl,
      };
      setSessionProgress({
        job_id: persisted.jobId,
        status: "done",
        pct: 100,
        message: SESSION_STATUS.done,
      });
      return true;
    } catch {
      clearPersistedLoginSession();
      return false;
    }
  }

  async function handleNeedLoginChange(checked: boolean) {
    setNeedLogin(checked);
    if (!checked) return;

    setSessionProgress({
      job_id: "",
      status: "checking",
      pct: 10,
      message: SESSION_STATUS.checking,
    });
    setError("");

    if (sessionStorageFile) {
      setSessionValidated(false);
      setSessionProgress({
        job_id: "upload",
        status: "checking",
        pct: 50,
        message: SESSION_STATUS.checking,
      });
      const ok = await validateUploadSession(sessionStorageFile, appliedBaseUrl);
      if (ok) {
        setSessionProgress({
          job_id: "upload",
          status: "done",
          pct: 100,
          message: SESSION_STATUS.done,
        });
      }
      return;
    }

    if (sessionJobId.trim() && sessionPageUrl.trim() === appliedBaseUrl.trim()) {
      setSessionValidated(false);
      setSessionProgress({
        job_id: sessionJobId,
        status: "checking",
        pct: 50,
        message: SESSION_STATUS.checking,
      });
      const ok = await validateBrowserSession(sessionJobId, appliedBaseUrl);
      if (ok) {
        setSessionProgress({
          job_id: sessionJobId,
          status: "done",
          pct: 100,
          message: SESSION_STATUS.done,
        });
      }
      return;
    }

    const connected = await tryConnectExistingSession();
    if (connected) return;

    if (baseUrlDirty) {
      setSessionProgress(null);
      setError("Base URL 변경 후 「Base URL 적용」을 누른 뒤 로그인 세션을 연결하세요.");
      return;
    }
    if (!appliedBaseUrl.trim()) {
      setSessionProgress(null);
      setError("Base URL을 입력·적용한 뒤 로그인 세션을 연결하세요.");
      return;
    }

    setSessionProgress({
      job_id: "",
      status: "running",
      pct: 15,
      message: SESSION_STATUS.loginRequired,
    });
    void startBrowserSession();
  }

  async function startBrowserSession() {
    const targetUrl = appliedBaseUrl.trim();
    if (!targetUrl) {
      setError("Base URL을 적용한 뒤 세션을 생성하세요.");
      return;
    }
    setSessionJobId("");
    setSessionPageUrl("");
    setSessionStorageFile(null);
    setSessionValidated(false);
    setSessionProgress({
      job_id: "",
      status: "running",
      pct: 5,
      message: SESSION_STATUS.launching,
    });
    setError("");
    try {
      const fd = new FormData();
      fd.append("page_url", targetUrl);
      const detect = isIpmsSiteUrl(targetUrl) ? "ipms" : "generic";
      const path =
        detect === "ipms" ? "v1/web-quality/ipms/session" : "v1/web-quality/session";
      if (detect === "generic") fd.append("detect", "generic");
      const res = await postScanMultipart(path, fd);
      const j = await readJsonResponse(res);
      if (!res.ok || !j.job_id) {
        throw new Error(String(j.detail || j.message || `세션 생성 실패 (HTTP ${res.status})`));
      }
      const jobId = String(j.job_id);
      setSessionProgress({
        job_id: jobId,
        status: "running",
        pct: 15,
        message: SESSION_STATUS.loginRequired,
      });
      await pollSessionJob(jobId, targetUrl);
    } catch (e) {
      setError(wrapScanFetchError(e).message);
      setSessionProgress(null);
    }
  }

  function toggleId(id: string) {
    const c = candidates.find((x) => x.state_id === id);
    if (c && !scenarioCheckEnabled(c, sessionActive)) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function togglePath(path: string) {
    const item = portalUrlItems.find((x) => x.path === path);
    if (item && !portalUrlCheckEnabled(item, sessionActive)) return;
    setSelectedPaths((prev) => (prev.includes(path) ? prev.filter((x) => x !== path) : [...prev, path]));
  }

  function selectAllPaths() {
    setSelectedPaths(
      portalUrlItems.filter((x) => portalUrlCheckEnabled(x, sessionActive)).map((x) => x.path),
    );
  }

  function selectRecommendedPaths() {
    const rec = portalUrlItems
      .filter((x) => x.recommended === true && portalUrlCheckEnabled(x, sessionActive))
      .map((x) => x.path);
    setSelectedPaths(rec.length ? rec : ["/"]);
  }

  function clearAllPaths() {
    setSelectedPaths([]);
  }

  function selectAllScenarios() {
    setSelectedIds(
      selectableCandidates
        .filter((c) => scenarioCheckEnabled(c, sessionActive))
        .map((c) => c.state_id),
    );
  }

  function selectRecommendedScenarios() {
    const rec = candidates
      .filter((c) => c.recommended && c.selectable !== false && scenarioCheckEnabled(c, sessionActive))
      .map((c) => c.state_id);
    setSelectedIds(
      rec.length
        ? rec
        : selectableCandidates
            .filter((c) => c.recommended !== false && scenarioCheckEnabled(c, sessionActive))
            .map((c) => c.state_id),
    );
  }

  function clearAllScenarios() {
    setSelectedIds([]);
  }

  const portalExtraPreview = useMemo(() => parseManualPathLines(portalExtraPaths), [portalExtraPaths]);

  const portalUrlPreview = useMemo(() => {
    const fromList = selectedPaths.filter(Boolean);
    return dedupeManualPaths([...fromList, ...portalExtraPreview]);
  }, [selectedPaths, portalExtraPreview]);

  const manualUrlPreview = useMemo(
    () => dedupeManualPaths(parseManualPathLines(customUrls)),
    [customUrls],
  );

  function resolvedManualUrls(): string {
    if (target === "portal") return portalUrlPreview.join("\n");
    return manualUrlPreview.join("\n");
  }

  const showPortalUrlChecklist =
    target === "portal" && isPortalLocalBaseUrl(appliedBaseUrl) && portalUrlItems.length > 0;

  const sessionWordingMode = manualSessionMode(target);

  const portalRunnablePathCount = useMemo(() => {
    const fromChecklist = selectedPaths.filter((path) => {
      const item = portalUrlItems.find((x) => x.path === path);
      return item ? portalUrlCheckEnabled(item, sessionActive) : false;
    }).length;
    return fromChecklist + portalExtraPreview.length;
  }, [selectedPaths, portalUrlItems, sessionActive, portalExtraPreview]);

  const skippedPortalPathsPreview = useMemo(
    () =>
      selectedPaths
        .filter((path) => {
          const item = portalUrlItems.find((x) => x.path === path);
          return item?.requires_auth && !sessionActive;
        })
        .map((path) => portalUrlItems.find((x) => x.path === path)?.name || path),
    [selectedPaths, portalUrlItems, sessionActive],
  );

  const isUrlTarget = target === "manual" || target === "portal";

  const targetPrefsRef = useRef<
    Record<
      string,
      {
        baseUrlInput: string;
        appliedBaseUrl: string;
        needLogin: boolean;
        result: PerfResult | null;
        lastJobId: string;
        error: string;
      }
    >
  >({});

  function switchTarget(nextTarget: string) {
    if (nextTarget === target) return;
    targetPrefsRef.current[target] = {
      baseUrlInput,
      appliedBaseUrl,
      needLogin,
      result,
      lastJobId,
      error,
    };
    setProgress(null);
    scenarioFetchKeyRef.current = "";
    setPreviewResult(null);
    setPreviewMsg("");

    const saved = targetPrefsRef.current[nextTarget];
    let nextApplied = "";
    if (saved) {
      setBaseUrlInput(saved.baseUrlInput);
      setAppliedBaseUrl(saved.appliedBaseUrl);
      setNeedLogin(saved.needLogin);
      setResult(saved.result);
      setLastJobId(saved.lastJobId);
      setError(saved.error);
      nextApplied = saved.appliedBaseUrl;
    } else {
      const next = defaultBaseUrlForTarget(nextTarget);
      setBaseUrlInput(next);
      setAppliedBaseUrl(next);
      setResult(null);
      setLastJobId("");
      setError("");
      nextApplied = next;
      if (nextTarget === "manual") {
        setCustomUrls("");
        setNeedLogin(false);
        setUrlListMsg("Base URL 입력 후 「Base URL 적용」, 아래에 부하 경로 입력");
      } else if (nextTarget === "portal") {
        setNeedLogin(false);
        setUrlListMsg("포털 페이지 체크리스트 — 로그인 필요 항목은 세션 준비 후 선택 가능");
      } else {
        setNeedLogin(false);
      }
    }
    restoreSessionForUrl(nextApplied);
    setTarget(nextTarget);
  }

  function buildForm(opts?: { includeSession?: boolean }): FormData {
    const fd = new FormData();
    fd.set("target", isUrlTarget ? "" : target);
    fd.set("base_url", appliedBaseUrl);
    fd.set("state_ids", JSON.stringify(selectedIds));
    fd.set("users", String(users));
    fd.set("spawn_rate", String(spawnRate));
    fd.set("duration_sec", String(durationSec));
    fd.set("record_har", recordHar ? "true" : "false");
    fd.set("confirm_high_load", confirmHighLoad ? "true" : "false");
    fd.set("access", accessParam);
    fd.set("manual_urls", isUrlTarget ? resolvedManualUrls() : "");
    fd.set("async_progress", "true");
    const includeSession = opts?.includeSession ?? sessionActive;
    if (includeSession && sessionReady) {
      if (sessionJobId.trim()) fd.set("session_job_id", sessionJobId.trim());
      if (sessionStorageFile) fd.append("session_storage", sessionStorageFile);
    }
    return fd;
  }

  async function validateUploadSession(file: File, targetUrl: string): Promise<boolean> {
    if (!isPortalLocalBaseUrl(targetUrl)) {
      setSessionValidated(true);
      return true;
    }
    try {
      const fd = new FormData();
      fd.set("base_url", targetUrl.trim());
      fd.append("session_storage", file);
      const res = await postScanMultipart("v1/perf-test/session/validate", fd);
      const j = await readJsonResponse(res);
      if (j.valid) {
        setSessionValidated(true);
        return true;
      }
      const msg = String(j.message || "포털 세션(mp_portal) 검증 실패");
      setSessionValidated(false);
      setSessionProgress({
        job_id: "upload",
        status: "error",
        pct: 0,
        message: msg,
        error: msg,
      });
      setPreviewMsg(msg);
      return false;
    } catch (e) {
      setSessionValidated(false);
      setPreviewMsg(wrapScanFetchError(e).message);
      return false;
    }
  }

  async function validateBrowserSession(jobId: string, targetUrl: string): Promise<boolean> {
    if (!isPortalLocalBaseUrl(targetUrl)) {
      setSessionValidated(true);
      return true;
    }
    try {
      const q = new URLSearchParams({ job_id: jobId, base_url: targetUrl.trim() });
      const res = await fetchScanApi(`v1/perf-test/session/validate?${q}`);
      const j = await readJsonResponse(res);
      if (j.valid) {
        setSessionValidated(true);
        return true;
      }
      const msg = String(j.message || "포털 세션(mp_portal) 검증 실패");
      setSessionJobId("");
      setSessionPageUrl("");
      setSessionValidated(false);
      clearPersistedLoginSession();
      delete sessionsByUrlRef.current[targetUrl.trim()];
      setSessionProgress({
        job_id: jobId,
        status: "error",
        pct: 0,
        message: msg,
        error: msg,
      });
      setPreviewMsg(msg);
      return false;
    } catch (e) {
      setSessionValidated(false);
      setPreviewMsg(wrapScanFetchError(e).message);
      return false;
    }
  }

  async function previewScenarios() {
    setError("");
    setPreviewResult(null);
    setPreviewMsg("");
    if (baseUrlDirty) {
      setPreviewMsg("Base URL 변경 후 「Base URL 적용」을 누르세요.");
      return;
    }
    if (!appliedBaseUrl.trim()) {
      setPreviewMsg("Base URL을 입력·적용하세요.");
      return;
    }
    if (candidates.length === 0) {
      setPreviewMsg("시나리오를 불러올 수 없습니다.");
      return;
    }
    if (selectedIds.length === 0) {
      setPreviewMsg("미리볼 시나리오를 1개 이상 선택하세요.");
      return;
    }
    if (runnableSelectedCount === 0) {
      setPreviewMsg("선택한 시나리오가 모두 로그인 필요인데 세션이 없습니다.");
      return;
    }
    setPreviewLoading(true);
    setPreviewMsg("Playwright로 화면을 여는 중…");
    try {
      const fd = buildForm({ includeSession: sessionReady });
      const res = await postScanMultipart("v1/perf-test/scenarios/preview", fd);
      const j = (await readJsonResponse(res)) as ScenarioPreviewResult;
      if (!j.ok) {
        throw new Error(Array.isArray(j.errors) ? j.errors.join("; ") : "미리보기 실패");
      }
      setPreviewResult(j);
      const ok = j.summary?.ok ?? 0;
      const fail = j.summary?.fail ?? 0;
      setPreviewMsg(`미리보기 완료 — 성공 ${ok} / 실패 ${fail}`);
      requestAnimationFrame(() => {
        previewBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e) {
      setPreviewResult(null);
      setPreviewMsg(wrapScanFetchError(e).message);
    } finally {
      setPreviewLoading(false);
    }
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
        throw new Error(
          st === "cancelled" ? "성능검사가 취소되었습니다." : String(j.error || j.message || st),
        );
      }
    }
  }

  async function runTest() {
    setError("");
    setResult(null);
    if (baseUrlDirty) {
      setError("Base URL 변경 후 「Base URL 적용」을 누르세요.");
      return;
    }
    if (!appliedBaseUrl.trim()) {
      setError("Base URL을 입력·적용하세요.");
      return;
    }
    if (target === "ipms-online" && !isIpmsLikeUrl(appliedBaseUrl)) {
      setError("IPMS 탭에서는 IPMS URL을 적용하거나 「URL 직접 입력」 탭을 사용하세요.");
      return;
    }
    if (target === "portal" && !isPortalLocalBaseUrl(appliedBaseUrl)) {
      setError("Portal 탭은 로컬 포털 Base URL(http://127.0.0.1:3000)을 적용하세요.");
      return;
    }
    if (isUrlTarget && !resolvedManualUrls().trim()) {
      setError("부하 대상 URL을 1개 이상 선택하세요.");
      return;
    }
    if (!isUrlTarget && candidates.length === 0) {
      setError("시나리오를 불러올 수 없습니다. API 연결과 대상 앱 설정을 확인하세요.");
      return;
    }
    if (!isUrlTarget && selectedIds.length === 0) {
      setError("시나리오를 1개 이상 선택하세요.");
      return;
    }
    if (target === "portal" && portalUrlPreview.length > 0 && portalRunnablePathCount === 0) {
      setError(
        "선택한 URL이 모두 로그인 필요인데 세션이 없습니다. 「로그인 필요」를 체크하고 세션을 준비하거나 공개 페이지만 선택하세요.",
      );
      return;
    }
    if (!isUrlTarget && runnableSelectedCount === 0 && selectedIds.length > 0) {
      setError(
        "선택한 시나리오가 모두 로그인 필요인데 세션이 없습니다. 「로그인 필요」를 체크하고 세션을 준비하거나 공개 시나리오만 선택하세요.",
      );
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
    if (src === "har") {
      const n = result?.har_targets;
      const suffix =
        n != null && n > 0
          ? target === "manual" || target === "portal" || result?.target === "manual"
            ? ` · 직접 URL ${n}개`
            : ` · 시나리오 ${n}개`
          : "";
      return `Playwright HAR 녹화${suffix}`;
    }
    if (src === "scenario") {
      if (result?.har_fallback_reason) return "웹 품질 시나리오 (HAR 실패 → 대체)";
      return "웹 품질 시나리오";
    }
    if (src === "manual") {
      if (result?.har_fallback_reason) return "URL 직접 입력 (HAR 실패 → 대체)";
      return "URL 체크 목록";
    }
    return src || "—";
  }, [result?.request_source, result?.har_fallback_reason, result?.har_targets, result?.target, target]);

  const endpointRows = useMemo(() => {
    if (result?.endpoints?.length) return result.endpoints;
    if (result?.requests_preview?.length) {
      return result.requests_preview.map((r) => ({
        name: r.name || r.path || "—",
        method: r.method || "GET",
        num_requests: 0,
        num_failures: 0,
        avg_ms: 0,
        p95_ms: 0,
        pending: true,
      }));
    }
    return [];
  }, [result?.endpoints, result?.requests_preview]);

  const scenarioSummaryRows = useMemo(() => {
    if (!result?.har_recorded || result?.target === "manual") return [];
    if (!endpointRows.some((e) => parseEndpointName(e.name).label)) return [];
    return aggregateByScenarioLabel(endpointRows);
  }, [result?.har_recorded, result?.target, endpointRows]);

  const selectableCandidates = useMemo(
    () => candidates.filter((c) => c.selectable !== false),
    [candidates],
  );

  const selectedCandidates = useMemo(
    () => selectableCandidates.filter((c) => selectedIds.includes(c.state_id)),
    [selectableCandidates, selectedIds],
  );

  const runnableSelectedCount = useMemo(
    () =>
      selectedCandidates.filter(
        (c) => scenarioCheckEnabled(c, sessionActive),
      ).length,
    [selectedCandidates, sessionActive],
  );

  const skippedSelectedPreview = useMemo(
    () =>
      selectedCandidates
        .filter((c) => scenarioAccessTier(c) === "auth" && !sessionActive)
        .map((c) => c.label || c.state_id),
    [selectedCandidates, sessionActive],
  );

  const targetHint = useMemo(() => {
    if (target === "portal") {
      return "MyPlatform 포털 페이지 체크리스트. 로그인 필요 항목은 「로그인 필요」 체크 후 세션 준비 시 선택 가능합니다.";
    }
    if (target === "manual") {
      return "임의 Base URL + 경로 직접 입력. 회색 placeholder는 예시일 뿐 — 입력 후 「Base URL 적용」";
    }
    if (target === "ipms-online") {
      return "IPMS 사전 정의 시나리오 — 공개·로그인 메뉴를 동시에 불러올 수 있습니다.";
    }
    const label = TARGET_OPTIONS.find((o) => o.id === target)?.label ?? target;
    return `${label} 앱 시나리오는 로그인·세션 필요(access=auth)로 분류됩니다. 세션 없으면 실행 시 제외됩니다.`;
  }, [target]);

  const perfInsights = useMemo(() => buildPerfInsights(endpointRows), [endpointRows]);

  const slowInsights = useMemo(
    () => perfInsights.filter((x) => x.severity === "warn" || x.severity === "critical"),
    [perfInsights],
  );

  const failDiagnosis = useMemo(() => {
    if (summary?.fail_ratio == null) return [];
    return buildPerfFailDiagnosis(
      result?.base_url ?? appliedBaseUrl,
      endpointRows,
      summary.fail_ratio,
    );
  }, [summary?.fail_ratio, result?.base_url, appliedBaseUrl, endpointRows]);

  function buildReportData(): PerfReportData | null {
    if (!result?.summary) return null;
    return {
      job_id: lastJobId || undefined,
      ran_at: result.ran_at ?? new Date().toISOString(),
      target: result.target ?? target,
      target_name: result.target_name,
      base_url: result.base_url ?? appliedBaseUrl,
      users: result.users ?? users,
      spawn_rate: result.spawn_rate ?? spawnRate,
      duration_sec: result.duration_sec ?? durationSec,
      request_source: requestSourceLabel,
      summary: result.summary,
      endpoints: result.endpoints,
      requests_preview: result.requests_preview,
    };
  }

  function renderSessionPanel() {
    return (
      <div className="wq-runtime-block perf-session-block">
        <h3 style={{ marginTop: 0 }}>로그인 세션 (HAR · Locust)</h3>
        <p className="hint">
          로그인 필요 사이트는 API 서버에서 Chromium을 열어{" "}
          <strong>storage_state</strong>를 저장합니다. 로컬 포털은{" "}
          <strong>/login</strong>에서 암호 로그인까지 완료해야 시나리오·HAR에 사용됩니다.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={needLogin}
            onChange={(e) => void handleNeedLoginChange(e.target.checked)}
          />
          로그인 필요 (세션 없으면 공개 페이지만 측정)
        </label>
        {!needLogin && sessionReady ? (
          <p className="hint perf-session-persisted">
            저장된 로그인 세션이 있습니다. 체크하면 자동 연결 · 로그인 필요 시나리오를 점검할 수 있습니다.
          </p>
        ) : null}
        {needLogin ? (
          <>
            <div className="btn-row" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="btn"
                disabled={
                  !appliedBaseUrl.trim() ||
                  baseUrlDirty ||
                  sessionProgress?.status === "running" ||
                  sessionProgress?.status === "queued"
                }
                onClick={() => void startBrowserSession()}
              >
                {sessionProgress?.status === "running" || sessionProgress?.status === "queued"
                  ? "세션 생성 중…"
                  : "로그인 세션 자동 생성"}
              </button>
              {sessionProgress?.status === "running" || sessionProgress?.status === "queued" ? (
                <button type="button" className="btn ghost" onClick={() => void cancelSession()}>
                  세션 취소
                </button>
              ) : null}
            </div>
            {sessionProgress &&
            (sessionProgress.status === "checking" ||
              sessionProgress.status === "running" ||
              sessionProgress.status === "queued" ||
              sessionProgress.status === "done" ||
              sessionProgress.status === "error") ? (
              <div className="run-progress source-scan-progress" style={{ marginTop: "0.5rem" }}>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${sessionProgress.pct}%` }}
                  />
                </div>
                <p
                  className={`hint${
                    sessionProgress.status === "done"
                      ? " perf-session-done-msg"
                      : sessionProgress.status === "error"
                        ? " err"
                        : ""
                  }`}
                >
                  {sessionProgress.status === "error"
                    ? sessionProgress.message
                    : `${Math.round(sessionProgress.pct)}% · ${sessionProgress.message}`}
                </p>
                {sessionViaBrowser && sessionValidated && sessionProgress.status === "done" ? (
                  <p className="hint perf-session-browser-done">
                    <span className="wq-chip ok">브라우저 세션 연결됨</span>
                    {" · "}
                    {perfSessionNextStepHint(sessionWordingMode)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {sessionProgress?.status !== "running" && sessionProgress?.status !== "queued" ? (
              <label className="source-scan-field source-scan-field-full" style={{ marginTop: "0.75rem" }}>
                <span>또는 storage_state JSON 업로드</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSessionStorageFile(file);
                    if (file) {
                      const url = appliedBaseUrl.trim();
                      setSessionJobId("");
                      setSessionPageUrl(url);
                      setSessionValidated(false);
                      clearPersistedLoginSession();
                      cacheUploadSession(url, file);
                      setSessionProgress({
                        job_id: "upload",
                        status: "checking",
                        pct: 50,
                        message: SESSION_STATUS.checking,
                      });
                      void validateUploadSession(file, url).then((ok) => {
                        if (ok) {
                          setSessionProgress({
                            job_id: "upload",
                            status: "done",
                            pct: 100,
                            message: SESSION_STATUS.done,
                          });
                        } else {
                          setSessionStorageFile(null);
                          delete uploadSessionByUrlRef.current[url];
                        }
                      });
                    } else {
                      setSessionValidated(false);
                      setSessionProgress(null);
                    }
                  }}
                />
                {sessionViaUpload && sessionValidated ? (
                  <p className="hint perf-session-upload-done">
                    <span className="wq-chip ok">JSON 업로드됨</span>
                    {" · "}
                    {perfSessionNextStepHint(sessionWordingMode)}
                  </p>
                ) : null}
              </label>
            ) : (
              <p className="hint" style={{ marginTop: "0.75rem" }}>
                Chromium 로그인 진행 중 — 완료 후 브라우저 세션이 자동 연결됩니다.
              </p>
            )}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <main className="wq-page perf-page">
      <PortalNav />
      <section className="hero">
          <h1>성능 진단</h1>
          <p>Locust HTTP 부하 테스트 · 웹 품질 시나리오 공유 · TPS · 응답시간 · 오류율</p>
        </section>

        <section className="panel">
          <div className="env-panel-head">
            <h2>도구·환경 상태</h2>
            <div className="env-panel-head-actions">
              <EnvSourceBadge />
              <button
                type="button"
                className="btn ghost env-refresh-btn"
                disabled={envLoading}
                onClick={() => void loadEnv()}
              >
                {envLoading ? "확인 중…" : "환경 다시 확인"}
              </button>
            </div>
          </div>

          {envErr ? <p className={`msg ${env ? "warn" : "err"}`}>{envErr}</p> : null}
          {envLoading ? <EnvToolsSkeleton /> : null}

          {env && !envLoading ? (
            <>
              <div className="perf-env-cards">
                <div className={`perf-env-card ${loadAllowed ? "ok" : "warn"}`}>
                  <div className="perf-env-card-label">부하 실행</div>
                  <div className="perf-env-card-value">{loadAllowed ? "허용 (로컬)" : "차단 (클라우드)"}</div>
                </div>
                <div className={`perf-env-card ${locustInstalled ? "ok" : "warn"}`}>
                  <div className="perf-env-card-label">Locust</div>
                  <div className="perf-env-card-value">{locustInstalled ? "설치됨" : "미설치"}</div>
                </div>
                <div className={`perf-env-card ${envReady ? "ok" : "warn"}`}>
                  <div className="perf-env-card-label">상태</div>
                  <div className="perf-env-card-value">{envReady ? "실행 가능" : "설정 필요"}</div>
                </div>
              </div>

              {!envReady ? (
                <div className="perf-setup-guide">
                  <h3>설치 · 실행 가이드</h3>
                  <ol className="perf-setup-steps">
                    {!loadAllowed ? (
                      <li>
                        포털 <code>.env.local</code> — <code>NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001</code>
                      </li>
                    ) : null}
                    {!locustInstalled ? (
                      <li>
                        API: <code>pip install -r requirements.txt</code> 또는{" "}
                        <code>.\scripts\start-api-source-scan.ps1</code>
                      </li>
                    ) : null}
                    <li>터미널 1 — API · 터미널 2 — <code>npm run dev:portal</code></li>
                  </ol>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="panel">
          <h2>부하 설정</h2>

          <div className="tabs wq-mode-tabs" role="tablist">
            {TARGET_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                className={`tab ${target === o.id ? "active" : ""}`}
                aria-selected={target === o.id}
                onClick={() => switchTarget(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="wq-step-block">
            <p className="hint">{targetHint}</p>
            <div className="form-grid perf-base-url-grid">
              <label className="perf-base-url-field">
                Base URL
                <input
                  className={target === "manual" ? "perf-url-placeholder-input" : undefined}
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  placeholder={baseUrlPlaceholderForTarget(target)}
                />
              </label>
              {target === "manual" ? (
                <p className="hint perf-base-url-sample">
                  placeholder <code>{MANUAL_BASE_URL_PLACEHOLDER}</code> 는 예시입니다 — 비워 두거나 직접 입력하세요.
                </p>
              ) : null}
              <div className="perf-base-url-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={!baseUrlDirty || scenarioLoading}
                  onClick={() => applyBaseUrl()}
                >
                  Base URL 적용
                </button>
                {baseUrlDirty ? (
                  <p className="hint">URL 변경됨 — 적용 후 시나리오·부하 대상이 갱신됩니다.</p>
                ) : appliedBaseUrl.trim() ? (
                  <p className="hint">적용 URL: <code>{appliedBaseUrl}</code></p>
                ) : (
                  <p className="hint">적용 URL: (미입력)</p>
                )}
              </div>
              {showIpmsControls ? (
                <div className="perf-access-tiers">
                  <span className="perf-access-tiers-label">시나리오 범위</span>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={accessPublic}
                      onChange={(e) => setAccessPublic(e.target.checked)}
                    />
                    공개 (알림·이용안내·통계)
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={accessAuth}
                      onChange={(e) => setAccessAuth(e.target.checked)}
                    />
                    로그인 (민원·내정보)
                  </label>
                </div>
              ) : null}
              <label>
                동시 사용자 (VU)
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={users}
                  onChange={(e) => setUsers(Number(e.target.value))}
                />
              </label>
              <label>
                램프업 (명/초)
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={spawnRate}
                  onChange={(e) => setSpawnRate(Number(e.target.value))}
                />
              </label>
              <label>
                지속 시간 (초)
                <input
                  type="number"
                  min={5}
                  max={3600}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                />
              </label>
            </div>
            {renderSessionPanel()}
          </div>

          {target === "ipms-online" && !showIpmsControls && !baseUrlDirty ? (
            <p className="msg warn">
              적용된 Base URL이 IPMS Online(<code>ipms.online</code>)이 아닙니다. IPMS 시나리오·접근 옵션은 표시하지 않습니다.
              <code>ipms.admin</code> 등 다른 경로는 「URL 직접 입력」 탭을 사용하세요.
            </p>
          ) : null}

          {target === "portal" ? (
            <div className="wq-scenario-block">
              <div className="wq-scenario-head">
                <h3>부하 대상 URL</h3>
                {showPortalUrlChecklist ? (
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={urlListLoading}
                      onClick={() => void loadPortalUrls()}
                    >
                      {urlListLoading ? "불러오는 중…" : "URL 목록 새로고침"}
                    </button>
                    <button type="button" className="btn ghost" onClick={selectAllPaths}>
                      전체 선택
                    </button>
                    <button type="button" className="btn ghost" onClick={selectRecommendedPaths}>
                      권장만
                    </button>
                    <button type="button" className="btn ghost" onClick={clearAllPaths}>
                      모두 해제
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="hint">
                {showPortalUrlChecklist
                  ? urlListMsg || "포털 페이지 경로를 선택합니다. 로그인 필요 항목은 세션 준비 후 선택 가능합니다."
                  : urlListMsg || "로컬 포털 Base URL(http://127.0.0.1:3000)을 적용하세요."}
              </p>
              {portalUrlPreview.length === 0 ? (
                <p className="msg warn">대상 경로가 없습니다. 최소 1개 이상 선택하세요.</p>
              ) : (
                <p className="hint">
                  Locust 대상 {portalRunnablePathCount}개 / 선택 {portalUrlPreview.length}개 ·{" "}
                  <code>{portalUrlPreview.join(", ")}</code>
                  {skippedPortalPathsPreview.length > 0 ? (
                    <> (점검불가 제외: {skippedPortalPathsPreview.join(", ")})</>
                  ) : null}
                </p>
              )}
              {showPortalUrlChecklist ? (
                <ul className="wq-scenario-list">
                  {portalUrlItems.map((item) => {
                    const checkEnabled = portalUrlCheckEnabled(item, sessionActive);
                    return (
                      <li key={item.id}>
                        <label className={`check-row${checkEnabled ? "" : " is-disabled"}`}>
                          <input
                            type="checkbox"
                            checked={selectedPaths.includes(item.path)}
                            disabled={!checkEnabled}
                            onChange={() => togglePath(item.path)}
                          />
                          <span>
                            {item.name}
                            <span className="wq-scenario-meta">
                              {" "}
                              · <code>{item.path}</code>
                              {item.requires_auth ? (
                                <span className="perf-url-badge auth">로그인 필요</span>
                              ) : (
                                <span className="perf-url-badge public">공개</span>
                              )}
                              {item.requires_auth ? (
                                <PerfCheckBadge enabled={sessionActive} />
                              ) : (
                                <PerfCheckBadge enabled />
                              )}
                              {item.recommended === true ? " · 권장" : ""}
                            </span>
                          </span>
                        </label>
                        {item.description ? <p className="wq-scenario-desc">{item.description}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <label className="source-scan-field source-scan-field-full" style={{ marginTop: "0.75rem" }}>
                <span>추가 경로 (직접 입력 · 쉼표 · 줄바꿈)</span>
                <textarea
                  rows={2}
                  value={portalExtraPaths}
                  onChange={(e) => setPortalExtraPaths(e.target.value)}
                  placeholder="/apps/custom-page"
                />
              </label>
            </div>
          ) : null}

          {target === "manual" ? (
            <div className="wq-scenario-block">
              <div className="wq-scenario-head">
                <h3>부하 대상 URL</h3>
              </div>
              <p className="hint">
                {urlListMsg ||
                  "Base URL path 기준 상대 경로를 입력합니다. 예: Base가 …/ipms.admin 이면 / 또는 /api/list"}
              </p>
              {manualUrlPreview.length === 0 ? (
                <p className="msg warn">대상 경로가 없습니다. 최소 1개 이상 입력하세요.</p>
              ) : (
                <p className="hint">
                  Locust 대상 {manualUrlPreview.length}개 ·{" "}
                  <code>{manualUrlPreview.join(", ")}</code>
                </p>
              )}
              <label className="source-scan-field source-scan-field-full" style={{ marginTop: "0.75rem" }}>
                <span>부하 경로 (직접 입력 · 쉼표 · 줄바꿈 · 필수)</span>
                <textarea
                  rows={4}
                  value={customUrls}
                  onChange={(e) => setCustomUrls(e.target.value)}
                  placeholder="/&#10;/main/list&#10;/api/health"
                />
              </label>
              {manualUrlPreview.length > 0 ? (
                <ul className="wq-scenario-list perf-manual-preview">
                  {manualUrlPreview.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {showScenarioPanel ? (
            <div className="wq-scenario-block">
              <div className="wq-scenario-head">
                <h3>화면 시나리오</h3>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={previewLoading || !selectedIds.length || runnableSelectedCount === 0}
                    onClick={() => void previewScenarios()}
                  >
                    {previewLoading ? "화면 여는 중…" : "선택 시나리오 미리보기"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={scenarioLoading}
                    onClick={() => {
                      scenarioFetchKeyRef.current = "";
                      void loadScenarios({ clearList: false });
                    }}
                  >
                    {scenarioLoading ? "불러오는 중…" : "시나리오 다시 불러오기"}
                  </button>
                  <button type="button" className="btn ghost" onClick={selectAllScenarios} disabled={!selectableCandidates.length}>
                    전체 선택
                  </button>
                  <button type="button" className="btn ghost" onClick={selectRecommendedScenarios} disabled={!selectableCandidates.length}>
                    권장만
                  </button>
                  <button type="button" className="btn ghost" onClick={clearAllScenarios} disabled={!selectableCandidates.length}>
                    모두 해제
                  </button>
                </div>
              </div>
              <p className="hint">
                {scenarioLoading && !candidates.length
                  ? "시나리오 불러오는 중…"
                  : scenarioMsg || "체크된 시나리오 경로에 Locust GET 부하를 겁니다."}
              </p>
              <p className="hint perf-preview-vs-har-hint">
                「선택 시나리오 미리보기」는 Playwright로 화면만 열어 확인합니다 (HAR·Locust 부하 없음).
                HTTP 요청 캡처는 아래 「Playwright HAR 녹화」를 켠 뒤 「성능검사 실행」할 때만 수행됩니다.
              </p>
              {!scenarioLoading && selectedIds.length === 0 && candidates.length > 0 ? (
                <p className="msg warn">선택된 시나리오가 없습니다. 최소 1개 이상 체크하세요.</p>
              ) : selectedIds.length > 0 ? (
                <p className="hint">
                  선택 {selectedIds.length}개 시나리오
                  {runnableSelectedCount < selectedIds.length ? (
                    <>
                      {" "}
                      · 실행 가능 {runnableSelectedCount}개
                      {skippedSelectedPreview.length > 0 ? (
                        <> (점검불가: {skippedSelectedPreview.join(", ")})</>
                      ) : null}
                    </>
                  ) : null}
                </p>
              ) : null}
              {selectableCandidates.length > 0 ? (
                <ul className="wq-scenario-list">
                  {selectableCandidates.map((c) => {
                    const checked = selectedIds.includes(c.state_id);
                    const checkEnabled = scenarioCheckEnabled(c, sessionActive);
                    const isAuth = scenarioAccessTier(c) === "auth";
                    return (
                      <li key={c.state_id}>
                        <label className={`check-row${checkEnabled ? "" : " is-disabled"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!checkEnabled}
                            onChange={() => toggleId(c.state_id)}
                          />
                          <span>
                            {c.label}
                            <span className="wq-scenario-meta">
                              {" "}
                              · <code>{c.state_id}</code>
                              {isAuth ? (
                                <span className="perf-url-badge auth">로그인</span>
                              ) : (
                                <span className="perf-url-badge public">공개</span>
                              )}
                              {isAuth ? (
                                <PerfCheckBadge enabled={sessionActive} />
                              ) : (
                                <PerfCheckBadge enabled />
                              )}
                              {c.recommended ? " · 권장" : ""}
                            </span>
                          </span>
                        </label>
                        {c.description ? <p className="wq-scenario-desc">{c.description}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {previewMsg ? (
                <p className={`msg perf-scenario-preview-msg${previewMsg.includes("실패") || previewMsg.includes("오류") ? " err" : previewLoading ? "" : previewResult?.summary?.fail ? " warn" : " good"}`}>
                  {previewMsg}
                </p>
              ) : null}
              <div ref={previewBlockRef}>
              {previewResult?.items && previewResult.items.length > 0 ? (
                <div
                  className={`msg perf-scenario-preview${previewResult.summary?.fail ? " warn" : " good"}`}
                >
                  <p>
                    화면 미리보기 — 성공 {previewResult.summary?.ok ?? 0} / 실패{" "}
                    {previewResult.summary?.fail ?? 0}
                    {previewResult.warnings?.length ? (
                      <> · {previewResult.warnings.join(" ")}</>
                    ) : null}
                  </p>
                  <ul className="perf-scenario-preview-list">
                    {previewResult.items.map((item) => (
                      <li
                        key={item.state_id || item.label}
                        className={item.open_ok ? "ok" : "fail"}
                      >
                        <span className="perf-scenario-preview-label">{item.label || item.state_id}</span>
                        <span className="perf-scenario-preview-meta">
                          {item.open_ok ? "열림" : "실패"}
                          {item.duration_ms != null ? ` · ${item.duration_ms} ms` : ""}
                          {item.open_error ? ` — ${item.open_error}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              </div>
            </div>
          ) : null}

          <label className="check-row" style={{ marginTop: "0.75rem" }}>
            <input
              type="checkbox"
              checked={recordHar}
              onChange={(e) => setRecordHar(e.target.checked)}
            />
            Playwright HAR 녹화
          </label>
          <label className="check-row" style={{ marginTop: "0.5rem" }}>
            <input
              type="checkbox"
              checked={confirmHighLoad}
              onChange={(e) => setConfirmHighLoad(e.target.checked)}
            />
            고부하 확인 (VU &gt; 20)
          </label>
          <p className="hint">
            HAR — 「성능검사 실행」 시에만 동작합니다. 미리보기와 별개이며, 선택한{" "}
            {isUrlTarget ? "부하 경로" : "시나리오"}를 Playwright로 순차 녹화(수 초)한 뒤 Locust 부하를
            측정합니다. 녹화 시간은 TPS·응답시간에 포함되지 않습니다.
          </p>

          <div className="source-scan-actions">
            <div className="source-scan-actions-primary">
              <button
                type="button"
                className="btn"
                disabled={
                  busy ||
                  !envReady ||
                  (target === "portal" &&
                    portalUrlPreview.length > 0 &&
                    portalRunnablePathCount === 0) ||
                  (!isUrlTarget &&
                    selectedIds.length > 0 &&
                    runnableSelectedCount === 0)
                }
                onClick={() => void runTest()}
              >
                {busy ? "실행 중…" : "성능검사 실행"}
              </button>
              {busy ? (
                <button type="button" className="btn ghost" onClick={() => void cancelRun()}>
                  취소
                </button>
              ) : null}
            </div>
          </div>
          {!envReady ? (
            <p className="hint">Locust 설치 + 로컬 API 연결 후 실행할 수 있습니다.</p>
          ) : (
            <p className="hint">
              {target === "portal" ? (
                <>
                  포털 페이지 체크리스트 · 로그인 필요 항목은 「로그인 필요」 체크 후 세션 준비 ·
                  Base URL <code>http://127.0.0.1:3000</code>
                </>
              ) : target === "manual" ? (
                <>
                  외부 URL(<code>ipms.permit</code> 등)은 부하 경로 직접 입력 ·
                  로그인 필요 시 「로그인 필요」 체크 후 세션을 준비하세요.
                </>
              ) : (
                <>
                  선택한 시나리오 경로에 Locust GET 부하 · 포털 앱 로그인 필요 시 storage_state 세션 사용 ·
                  Base URL <code>http://127.0.0.1:3000</code>
                </>
              )}
            </p>
          )}

          {progress ? (
            <div className="run-progress source-scan-progress">
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
          {error ? <p className="msg err">{error}</p> : null}
        </section>

        {summary ? (
          <>
            <section className="panel perf-result-panel">
            <div className="perf-result-head">
              <div>
                <h2>결과 요약</h2>
                <p className="hint perf-result-meta">
                  {result?.target_name || result?.target || "manual"} · {result?.base_url ?? appliedBaseUrl} ·{" "}
                  {requestSourceLabel}
                  {result?.session_used ? " · 로그인 세션" : ""}
                  {result?.ran_at ? ` · ${formatUtcIsoToKst(result.ran_at)}` : ""}
                </p>
              </div>
              <div className="btn-row perf-export-row">
                <button type="button" className="btn ghost" onClick={() => { const d = buildReportData(); if (d) exportPerfReportHtml(d); }}>
                  HTML
                </button>
                <button type="button" className="btn ghost" onClick={() => { const d = buildReportData(); if (d) exportPerfReportExcel(d); }}>
                  Excel
                </button>
                <button type="button" className="btn ghost" onClick={() => { const d = buildReportData(); if (d) exportPerfReportJson(d); }}>
                  JSON
                </button>
              </div>
            </div>

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
                <div className="perf-metric-value perf-metric-value-sm">
                  {summary.users ?? "—"} · {summary.duration_sec ?? "—"}s
                </div>
              </div>
            </div>

            {result?.har_fallback_reason ? (
              <p className="msg warn perf-fail-hint">
                HAR 녹화 실패 —{" "}
                {result?.target === "manual" || target === "manual" || target === "portal"
                  ? "입력 URL 목록으로 대체 실행했습니다."
                  : "시나리오 URL로 대체 실행했습니다."}{" "}
                {result.har_fallback_reason}
              </p>
            ) : result?.har_recorded ? (
              <p className="hint perf-fail-hint">
                HAR 녹화는 Locust 시작 전 준비 단계입니다 (
                {result?.har_targets != null && result.har_targets > 0
                  ? `${result.har_targets}개 ${result?.target === "manual" || target === "manual" ? "경로" : "시나리오"} 순차 녹화 · `
                  : ""}
                {summary.duration_sec ?? "—"}s 부하 구간만 TPS·응답시간 집계). HAR OFF와 URL·수치를 직접 비교하기
                어렵습니다.
              </p>
            ) : null}

            {result?.scenario_har && result.scenario_har.length > 0 ? (
              <div className="msg perf-scenario-har-status">
                <p>HAR 시나리오별 화면 열기 결과</p>
                <ul className="perf-scenario-preview-list">
                  {result.scenario_har.map((item) => (
                    <li
                      key={item.state_id || item.label}
                      className={item.open_ok ? "ok" : "fail"}
                    >
                      <span className="perf-scenario-preview-label">{item.label || item.state_id}</span>
                      <span className="perf-scenario-preview-meta">
                        {item.open_ok ? "열림" : "실패"}
                        {item.har_request_count != null ? ` · HTTP ${item.har_request_count}건` : ""}
                        {item.open_error ? ` — ${item.open_error}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result?.skipped_scenarios && result.skipped_scenarios.length > 0 ? (
              <div className="msg warn perf-skipped-scenarios">
                <p>
                  로그인 세션 없음 — {result.skipped_scenarios.length}개 시나리오는 측정에서 제외되었습니다.
                </p>
                <ul>
                  {result.skipped_scenarios.map((s) => (
                    <li key={s.state_id || s.label}>
                      {s.label || s.state_id}
                      {s.reason ? ` — ${s.reason}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.fail_ratio != null && summary.fail_ratio > 0.05 ? (
              <div className="msg warn perf-fail-hint">
                <p>오류율이 높습니다 ({fmtPct(summary.fail_ratio)}).</p>
                {failDiagnosis.length > 0 ? (
                  <ul className="perf-fail-diagnosis">
                    {failDiagnosis.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {slowInsights.length > 0 ? (
              <div className="perf-insights-block">
                <h3>느린 구간 · 조치 힌트</h3>
                <p className="hint">
                  p95 기준으로 정렬 · 500ms 이상 주의 · 2초 이상 또는 오류는 긴급 (Locust HTTP 경로 단위)
                </p>
                <ul className="perf-insights-list">
                  {slowInsights.map((ins) => (
                    <li key={`${ins.method}-${ins.name}`} className={`perf-insight perf-insight-${ins.severity}`}>
                      <div className="perf-insight-head">
                        <strong>
                          <EndpointNameCell name={ins.name} />
                        </strong>
                        <span className="perf-insight-meta">
                          {ins.method} · avg {ins.avg_ms} ms · p95 {ins.p95_ms} ms
                          {ins.num_failures > 0 ? ` · 실패 ${ins.num_failures}` : ""}
                        </span>
                      </div>
                      <ul className="perf-insight-hints">
                        {ins.hints.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ) : summary && endpointRows.some((e) => !e.pending && (e.num_requests ?? 0) > 0) ? (
              <p className="hint perf-insights-ok">
                항목별 p95가 500ms 미만입니다. 부하(VU·시간)를 늘리거나 HAR 녹화로 세부 URL을 더 수집해 보세요.
              </p>
            ) : null}

            <div className="perf-result-detail">
              {scenarioSummaryRows.length > 0 ? (
                <div className="perf-scenario-summary-block">
                  <h3>시나리오별 요약</h3>
                  <p className="hint">
                    HAR 녹화 — 선택 시나리오별 URL 합산 ({scenarioSummaryRows.length}개 시나리오)
                  </p>
                  <EndpointPerfTable rows={scenarioSummaryRows} />
                </div>
              ) : null}

              <h3>{scenarioSummaryRows.length > 0 ? "URL별 상세" : "항목별 성능"}</h3>
              <p className="hint">
                {result?.har_recorded
                  ? `HAR 캡처 URL별 집계 (${endpointRows.length}개 · 시나리오 라벨 · 경로)`
                  : `Locust 경로·시나리오별 집계 (${endpointRows.length}개 항목)`}
                {!result?.har_recorded && endpointRows.length === 1
                  ? " — 시나리오 여러 개 선택 시 항목별로 나뉩니다."
                  : ""}
              </p>
              <EndpointPerfTable rows={endpointRows} />
            </div>
            </section>

            <section className="panel perf-history-panel">
              <h2>검사 이력</h2>
              {history.length > 0 ? (
                <div className="perf-table-wrap">
                  <table className="perf-data-table perf-history-table">
                    <thead>
                      <tr>
                        <th>일시 (KST)</th>
                        <th className="perf-cell-left">대상</th>
                        <th>VU</th>
                        <th>rps</th>
                        <th>오류율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.job_id}>
                          <td className="perf-history-date">
                            {formatHistoryWhen(h.saved_at, h.job_id)}
                          </td>
                          <td className="perf-cell-left">{h.target_name || h.target || h.base_url}</td>
                          <td>{h.users ?? "—"}</td>
                          <td>{h.rps ?? "—"}</td>
                          <td>{fmtPct(h.fail_ratio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="perf-history-empty">아직 저장된 이력이 없습니다.</p>
              )}
            </section>
          </>
        ) : (
          <section className="panel perf-panel-compact">
            <h2>검사 이력</h2>
            {history.length > 0 ? (
              <div className="perf-table-wrap">
                <table className="perf-data-table perf-history-table">
                  <thead>
                    <tr>
                      <th>일시 (KST)</th>
                      <th className="perf-cell-left">대상</th>
                      <th>VU</th>
                      <th>rps</th>
                      <th>오류율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.job_id}>
                        <td className="perf-history-date">
                          {formatHistoryWhen(h.saved_at, h.job_id)}
                        </td>
                        <td className="perf-cell-left">{h.target_name || h.target || h.base_url}</td>
                        <td>{h.users ?? "—"}</td>
                        <td>{h.rps ?? "—"}</td>
                        <td>{fmtPct(h.fail_ratio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="perf-history-empty">아직 저장된 이력이 없습니다. 첫 검사를 실행해 보세요.</p>
            )}
          </section>
        )}
    </main>
  );
}
