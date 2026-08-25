"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalNav } from "@/lib/PortalNav";
import { API_BASE } from "@/lib/apiBase";
import {
  clientSideZipValidate,
  readJsonResponse,
  shouldUploadDirect,
  wrapFetchError,
} from "@/lib/formUpload";
import {
  fetchScanApi,
  isLocalPortalHost,
  postScanMultipart,
  wrapScanFetchError,
} from "@/lib/localScanApi";
import {
  CloudLargeZipHint,
  EnvSourceBadge,
  EnvToolsSkeleton,
} from "@/components/LocalScanSettings";
import {
  type FixGuideEntry,
  resolveFindingFix,
} from "@/lib/webQualityFix";
import { buildWqPrefs, loadWqPrefs, saveWqPrefs } from "@/lib/wqPrefs";

const PAGE_SIZE = 80;
const IPMS_DEFAULT_URL = "http://14.35.194.178:12000/ipms.online/";

type TabId =
  | "all"
  | "standard"
  | "compat"
  | "a11y"
  | "captures"
  | "not_scanned"
  | "manual"
  | "diff";

type Finding = {
  id: string;
  target: string;
  location: string;
  rule_id: string;
  category: string;
  status: string;
  severity: string;
  message: string;
  fix?: string;
  fix_url?: string;
  axe_id?: string;
  detail?: string;
  state_label?: string;
  state_description?: string;
  screenshot_id?: string;
  screenshot_url?: string;
  screenshot_filename?: string;
};

type Screenshot = {
  id: string;
  kind: "state" | "element";
  state_id: string;
  label: string;
  description: string;
  filename: string;
  finding_id?: string;
  selector?: string;
  data_url?: string;
};

const EXTERNAL_URL_PLACEHOLDER = "https://example.com/";

type ScanMode = "ipms-public" | "ipms-auth" | "external" | "java-upload";

type WqJobProgress = {
  job_id: string;
  status: string;
  pct: number;
  message: string;
  step_label?: string;
  error?: string;
};

function ipmsAccessForMode(mode: ScanMode): "public" | "auth" | null {
  if (mode === "ipms-public") return "public";
  if (mode === "ipms-auth") return "auth";
  return null;
}

function isIpmsMode(mode: ScanMode): boolean {
  return mode === "ipms-public" || mode === "ipms-auth";
}

function isAsyncScanMode(mode: ScanMode): boolean {
  return isIpmsMode(mode) || mode === "external";
}

type ScenarioCandidate = {
  state_id: string;
  label: string;
  description: string;
  kind: string;
  recommended: boolean;
  selectable: boolean;
  skip_reason?: string;
  risk?: string[];
  confidence?: string;
  source?: { files?: string[]; evidence?: string };
};

type ScenarioPayload = Record<string, unknown> & {
  candidates?: ScenarioCandidate[];
  extractable?: boolean;
  warnings?: string[];
  defaults_selected?: string[];
  static_only_hint?: string;
  file_stats?: { java?: number; views?: number };
};

function candidatesFromPayload(j: Record<string, unknown>): ScenarioCandidate[] {
  return Array.isArray(j.candidates) ? (j.candidates as ScenarioCandidate[]) : [];
}

const KIND_LABEL: Record<string, string> = {
  page: "화면",
  tab: "탭",
  dialog: "다이얼로그",
  popover: "팝오버",
  skip: "제외",
};

const RISK_LABEL: Record<string, string> = {
  file_input: "파일 선택",
  confirm: "확인창",
  "window.print": "인쇄 미리보기",
  external_service: "외부 서비스",
  destructive: "데이터 변경",
};

type DiffBlock = {
  new_count?: number;
  resolved_count?: number;
  unchanged_count?: number;
  new?: Finding[];
  resolved?: Finding[];
  unchanged?: Finding[];
};

type ScanResult = {
  ok: boolean;
  job_id?: string;
  mode?: ScanMode | "ipms-online";
  target: string;
  target_name: string;
  base_url: string;
  page_url?: string;
  scanned_at: string;
  runtime_available: boolean;
  runtime_error?: string;
  findings: Finding[];
  screenshots?: Screenshot[];
  diff?: DiffBlock | null;
  stats?: {
    total?: number;
    pass?: number;
    fail?: number;
    review?: number;
    manual?: number;
    not_scanned?: number;
    na?: number;
  };
  coverage: {
    sources: { path: string; scanned: boolean; reason?: string }[];
    screens: {
      state_id: string;
      label: string;
      description?: string;
      scanned: boolean;
      reason?: string;
      screenshot_id?: string;
    }[];
  };
  rules?: { kwcag: unknown[]; egov: unknown[] };
};

type HistoryItem = {
  job_id?: string;
  scanned_at?: string;
  saved_at?: string;
  target_name?: string;
  mode?: string;
  page_url?: string;
  fail?: number;
  not_scanned?: number;
};

const MODE_LABEL: Record<string, string> = {
  "ipms-public": "IPMS 공개",
  "ipms-auth": "IPMS 로그인",
  external: "외부 URL",
  "java-upload": "Java ZIP",
};

type DesignCheck = {
  checking: boolean;
  canRun: boolean;
  message: string;
  runtimeReady?: boolean;
  portalPasswordSet?: boolean;
};

type EnvStatus = {
  portal_password_set?: boolean;
  playwright?: {
    installed?: boolean;
    browser_ready?: boolean;
    message?: string;
    install_hint?: string;
  };
};

function formatRuntimeError(raw?: string): string {
  const text = (raw || "").trim();
  if (!text) return "";
  if (text.includes("Executable doesn't exist") || text.includes("BrowserType.launch")) {
    return (
      "Playwright Chromium이 설치되지 않았습니다. API 터미널에서 " +
      "`cd apps/api && python -m playwright install chromium` 실행 후 API를 재시작하세요."
    );
  }
  if (text.length > 240) return `${text.slice(0, 240)}…`;
  return text;
}

const IDLE_CHECK: DesignCheck = {
  checking: false,
  canRun: true,
  message: "",
};

const CATEGORY_LABEL: Record<string, string> = {
  standard: "웹표준",
  compat: "웹호환성",
  a11y: "웹접근성",
};

const STATUS_LABEL: Record<string, string> = {
  pass: "통과",
  fail: "미흡",
  review: "검토",
  manual: "수동",
  not_scanned: "미실행",
  na: "해당없음",
};

function FindingFixCell({
  finding,
  guides,
}: {
  finding: Pick<Finding, "fix" | "fix_url" | "axe_id">;
  guides: Record<string, FixGuideEntry>;
}) {
  const { text, url } = resolveFindingFix(finding, guides);
  if (!text && !url) return <>—</>;
  return (
    <div className="wq-fix-cell">
      {text ? <p style={{ margin: 0 }}>{text}</p> : null}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="hint">
          참고 문서 (axe)
        </a>
      ) : null}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openHtmlBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function ResultTable({
  rows,
  resetKey,
}: {
  rows: Record<string, string>[];
  resetKey: string;
}) {
  const [page, setPage] = useState(1);
  const cols = useMemo(() => {
    if (!rows.length) return [] as string[];
    return Object.keys(rows[0]);
  }, [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!rows.length) {
    return <p className="hint">표시할 항목이 없습니다.</p>;
  }

  const start = (page - 1) * PAGE_SIZE;
  const shown = rows.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <div className="table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={start + i}>
                {cols.map((c) => (
                  <td key={c}>{row[c] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="pager">
          <span className="hint">
            전체 {rows.length}건 · {start + 1}–{start + shown.length} 표시
          </span>
          <div className="pager-controls">
            <button
              type="button"
              className="pager-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              이전
            </button>
            {pageNumbers(page, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="pager-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`pager-btn ${page === p ? "active" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="pager-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              다음
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function WebQualityPage() {
  const [mode, setMode] = useState<ScanMode>("ipms-public");
  const [pageUrl, setPageUrl] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [ipmsUrl, setIpmsUrl] = useState(IPMS_DEFAULT_URL);
  const [sessionJobId, setSessionJobId] = useState("");
  const [sessionPageUrl, setSessionPageUrl] = useState("");
  const [sessionStorageFile, setSessionStorageFile] = useState<File | null>(null);
  const [sessionProgress, setSessionProgress] = useState<WqJobProgress | null>(null);
  const [discoverProgress, setDiscoverProgress] = useState<WqJobProgress | null>(null);
  const [scanProgress, setScanProgress] = useState<WqJobProgress | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [javaBaseUrl, setJavaBaseUrl] = useState("http://127.0.0.1:8080");
  const [javaStaticHint, setJavaStaticHint] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [includeRuntime, setIncludeRuntime] = useState(true);
  const [scenarios, setScenarios] = useState<ScenarioCandidate[]>([]);
  const [extractable, setExtractable] = useState(false);
  const [scenarioLoaded, setScenarioLoaded] = useState(false);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scenarioWarnings, setScenarioWarnings] = useState<string[]>([]);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [envLoadError, setEnvLoadError] = useState("");
  const [envLoading, setEnvLoading] = useState(true);
  const [fixGuides, setFixGuides] = useState<Record<string, FixGuideEntry>>({});
  const [designCheck, setDesignCheck] = useState<DesignCheck>(IDLE_CHECK);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<ScanMode | null>(null);
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState("");
  const [resultsByMode, setResultsByMode] = useState<Partial<Record<ScanMode, ScanResult>>>({});
  const [jobIdsByMode, setJobIdsByMode] = useState<Partial<Record<ScanMode, string>>>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [selectedIdsByMode, setSelectedIdsByMode] = useState<
    Partial<Record<ScanMode, string[]>>
  >({});
  const prefsHydrated = useRef(false);
  const prefsSaveTimer = useRef<number | null>(null);
  const [scanProgressMode, setScanProgressMode] = useState<ScanMode | null>(null);
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const validateTimer = useRef<number | null>(null);
  const validateRef = useRef<() => Promise<void>>(async () => {});

  const result = resultsByMode[mode] ?? null;
  const lastJobId = jobIdsByMode[mode] ?? result?.job_id ?? "";
  const activeScanProgress =
    scanProgress && scanProgressMode === mode ? scanProgress : null;
  const isBusyHere = busy && busyMode === mode;

  const switchMode = useCallback((next: ScanMode, opts?: { includeRuntime?: boolean }) => {
    setMode(next);
    if (opts?.includeRuntime !== undefined) setIncludeRuntime(opts.includeRuntime);
    setMsg("");
    setProgress("");
    setTab("all");
    setQuery("");
    const stored = selectedIdsByMode[next];
    if (stored?.length) setSelectedIds(stored);
  }, [selectedIdsByMode]);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetchScanApi("v1/web-quality/history?limit=15");
      if (!res.ok) return;
      const j = await readJsonResponse(res);
      setHistory((j.history as HistoryItem[]) || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadWqEnvironment = useCallback(async () => {
    setEnvLoading(true);
    setEnvLoadError("");

    try {
      const envRes = await fetchScanApi("v1/web-quality/environment");
      const envJ = await readJsonResponse(envRes);
      if (envRes.ok) {
        setEnvStatus(envJ as EnvStatus);
      } else {
        setEnvLoadError(`API 연결 실패 (HTTP ${envRes.status}).`);
      }
    } catch (e) {
      setEnvLoadError(wrapScanFetchError(e).message);
    } finally {
      setEnvLoading(false);
    }

    void (async () => {
      try {
        const guidesRes = await fetchScanApi("v1/web-quality/fix-guides");
        const guidesJ = await readJsonResponse(guidesRes);
        if (guidesRes.ok && guidesJ.guides) {
          setFixGuides(guidesJ.guides as Record<string, FixGuideEntry>);
        }
      } catch {
        /* non-blocking */
      }
    })();
  }, []);

  useEffect(() => {
    void loadWqEnvironment();
  }, [loadWqEnvironment]);

  useEffect(() => {
    const prefs = loadWqPrefs();
    setIpmsUrl(prefs.ipmsUrl || IPMS_DEFAULT_URL);
    setPageUrl(prefs.pageUrl || "");
    setJavaBaseUrl(prefs.javaBaseUrl || "http://127.0.0.1:8080");
    setLoginUrl(prefs.loginUrl || "");
    setLoginUsername(prefs.loginUsername || "");
    setIncludeRuntime(prefs.includeRuntime);
    setNeedLogin(prefs.needLogin);
    setSelectedIdsByMode(prefs.selectedIdsByMode || {});
    prefsHydrated.current = true;
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!prefsHydrated.current) return;
    if (prefsSaveTimer.current) window.clearTimeout(prefsSaveTimer.current);
    prefsSaveTimer.current = window.setTimeout(() => {
      saveWqPrefs(
        buildWqPrefs({
          ipmsUrl,
          pageUrl,
          javaBaseUrl,
          loginUrl,
          loginUsername,
          includeRuntime,
          needLogin,
          mode,
          selectedIds,
          selectedIdsByMode,
        })
      );
    }, 400);
    return () => {
      if (prefsSaveTimer.current) window.clearTimeout(prefsSaveTimer.current);
    };
  }, [
    ipmsUrl,
    pageUrl,
    javaBaseUrl,
    loginUrl,
    loginUsername,
    includeRuntime,
    needLogin,
    mode,
    selectedIds,
    selectedIdsByMode,
  ]);

  useEffect(() => {
    setSelectedIdsByMode((prev) => ({ ...prev, [mode]: selectedIds }));
  }, [mode, selectedIds]);

  useEffect(() => {
    if (!scenarioLoaded || !scenarios.length) return;
    const stored = selectedIdsByMode[mode];
    if (!stored?.length) return;
    const valid = stored.filter((id) =>
      scenarios.some((c) => c.state_id === id && c.selectable)
    );
    if (valid.length) setSelectedIds(valid);
  }, [scenarioLoaded, scenarios, mode, selectedIdsByMode]);

  const applyScenarioPayload = useCallback((j: Record<string, unknown>) => {
    const list = candidatesFromPayload(j);
    setExtractable(Boolean(j.extractable));
    setScenarios(list);
    setScenarioLoaded(true);
    setScenarioWarnings(Array.isArray(j.warnings) ? (j.warnings as string[]) : []);
    setJavaStaticHint(typeof j.static_only_hint === "string" ? j.static_only_hint : "");
    setSelectedIds(
      Array.isArray(j.defaults_selected)
        ? (j.defaults_selected as string[])
        : list.filter((c) => c.recommended && c.selectable).map((c) => c.state_id)
    );
  }, []);

  const externalSessionReady = useMemo(() => {
    const url = pageUrl.trim();
    if (sessionStorageFile) return true;
    return Boolean(sessionJobId.trim() && sessionPageUrl.trim() === url);
  }, [pageUrl, sessionJobId, sessionPageUrl, sessionStorageFile]);

  async function pollDiscoverJob(jobId: string): Promise<Record<string, unknown>> {
    for (let i = 0; i < 900; i++) {
      const res = await fetch(`${API_BASE}/v1/web-quality/jobs/${jobId}`);
      const j = (await res.json()) as WqJobProgress & {
        ok?: boolean;
        result?: Record<string, unknown>;
      };
      if (!res.ok) throw new Error(j.message || "탐색 상태 조회 실패");
      setDiscoverProgress({
        job_id: jobId,
        status: j.status,
        pct: j.pct ?? 0,
        message: j.message || "",
        step_label: j.step_label,
        error: j.error,
      });
      if (j.status === "done" && j.result) return j.result;
      if (j.status === "error") throw new Error(j.error || j.message || "시나리오 탐색 실패");
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error("시나리오 탐색 시간 초과");
  }

  const loadExternalScenarios = useCallback(async () => {
    setScenarioBusy(true);
    setScenarioLoaded(false);
    setDiscoverProgress({
      job_id: "",
      status: "running",
      pct: 0,
      message: "탐색 요청 중…",
    });
    try {
      const fd = new FormData();
      fd.append("page_url", pageUrl.trim());
      fd.append("need_login", needLogin ? "true" : "false");
      fd.append("async_progress", "true");
      if (externalSessionReady && sessionJobId.trim()) {
        fd.append("session_job_id", sessionJobId.trim());
      }
      if (sessionStorageFile) fd.append("session_storage", sessionStorageFile);
      const res = await fetch(`${API_BASE}/v1/web-quality/scenarios/discover`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.detail || j.message || `시나리오 탐색 실패 (HTTP ${res.status})`);
      }
      const payload = j.job_id
        ? await pollDiscoverJob(j.job_id as string)
        : (j as Record<string, unknown>);
      applyScenarioPayload(payload);
      const candidates = candidatesFromPayload(payload);
      const selectable = candidates.filter((c) => c.selectable).length;
      setMsg(`실시간 시나리오 ${candidates.length}개 (선택 가능 ${selectable}개)`);
    } catch (e) {
      setExtractable(false);
      setScenarios([]);
      setSelectedIds([]);
      setMsg(String((e as Error).message || e));
    } finally {
      setScenarioBusy(false);
      setDiscoverProgress(null);
    }
  }, [
    applyScenarioPayload,
    pageUrl,
    needLogin,
    sessionJobId,
    sessionStorageFile,
    externalSessionReady,
  ]);

  const loadJavaScenarios = useCallback(async () => {
    if (!zipFile) {
      setMsg("ZIP 파일을 선택하세요.");
      return;
    }
    setScenarioBusy(true);
    setScenarioLoaded(false);
    try {
      const fd = new FormData();
      fd.append("file", zipFile);
      const res = await postScanMultipart("v1/web-quality/scenarios/upload", fd);
      const j = (await readJsonResponse(res)) as ScenarioPayload & {
        ok?: boolean;
        detail?: string;
        message?: string;
      };
      if (!res.ok || !j.ok) {
        throw new Error(String(j.detail || j.message || `시나리오 읽기 실패 (HTTP ${res.status})`));
      }
      applyScenarioPayload(j);
      const candidates = candidatesFromPayload(j);
      const stats = j.file_stats;
      setMsg(
        `Java 시나리오 ${candidates.length}개 · Java ${stats?.java ?? 0} · JSP/HTML ${stats?.views ?? 0}`
      );
    } catch (e) {
      setExtractable(false);
      setScenarios([]);
      setSelectedIds([]);
      setMsg(wrapScanFetchError(e).message);
    } finally {
      setScenarioBusy(false);
    }
  }, [applyScenarioPayload, zipFile]);

  const loadIpmsScenarios = useCallback(async () => {
    const access = ipmsAccessForMode(mode);
    if (!access) return;
    setScenarioBusy(true);
    setScenarioLoaded(false);
    try {
      const q = new URLSearchParams({
        target: "ipms-online",
        access,
        page_url: ipmsUrl.trim(),
      });
      const res = await fetch(`${API_BASE}/v1/web-quality/scenarios?${q}`);
      const j = (await res.json()) as ScenarioPayload & {
        ok?: boolean;
        detail?: string;
        message?: string;
      };
      if (!res.ok || !j.ok) {
        throw new Error(j.detail || j.message || `시나리오 읽기 실패 (HTTP ${res.status})`);
      }
      applyScenarioPayload(j);
      const candidates = candidatesFromPayload(j);
      setMsg(
        `IPMS ${access === "public" ? "공개" : "로그인"} 시나리오 ${candidates.length}개`
      );
    } catch (e) {
      setExtractable(false);
      setScenarios([]);
      setSelectedIds([]);
      setMsg(String((e as Error).message || e));
    } finally {
      setScenarioBusy(false);
    }
  }, [applyScenarioPayload, ipmsUrl, mode]);

  useEffect(() => {
    if (mode === "external") {
      setScenarios([]);
      setSelectedIds([]);
      setScenarioLoaded(false);
      setMsg("");
      setSessionJobId("");
      setSessionPageUrl("");
      setSessionStorageFile(null);
      setSessionProgress(null);
      return;
    }
    if (mode === "java-upload") {
      setScenarioLoaded(false);
      setScenarios([]);
      setSelectedIds([]);
      setMsg("");
      return;
    }
    if (isIpmsMode(mode)) {
      void loadIpmsScenarios();
    }
  }, [mode, ipmsUrl, loadIpmsScenarios]);

  useEffect(() => {
    if (mode !== "external") return;
    const url = pageUrl.trim();
    if (!url) return;
    if (sessionPageUrl && sessionPageUrl !== url) {
      setSessionJobId("");
      setSessionPageUrl("");
      setSessionStorageFile(null);
      setSessionProgress(null);
    }
  }, [pageUrl, mode, sessionPageUrl]);

  async function pollSessionJob(
    jobId: string,
    targetUrl: string,
    detect: "ipms" | "generic" = "generic"
  ): Promise<void> {
    for (let i = 0; i < 900; i++) {
      const res = await fetch(`${API_BASE}/v1/web-quality/ipms/session/${jobId}`);
      const j = (await res.json()) as WqJobProgress & { ok?: boolean; has_file?: boolean };
      if (!res.ok) throw new Error(j.message || "세션 상태 조회 실패");
      setSessionProgress({
        job_id: jobId,
        status: j.status,
        pct: j.pct ?? 0,
        message: j.message || "",
        step_label: j.step_label,
        error: j.error,
      });
      if (j.status === "done") {
        setSessionJobId(jobId);
        setSessionPageUrl(targetUrl.trim());
        setMsg(
          detect === "ipms"
            ? "로그인 세션 생성 완료 — 「로그인 화면 진단」을 실행하세요."
            : "로그인 세션 생성 완료 — 「화면 시나리오 가져오기」를 실행하세요."
        );
        return;
      }
      if (j.status === "error") throw new Error(j.error || j.message || "세션 생성 실패");
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error("세션 생성 시간 초과");
  }

  async function startBrowserSession(targetUrl: string, detect: "ipms" | "generic") {
    setSessionJobId("");
    setSessionPageUrl("");
    setSessionStorageFile(null);
    setSessionProgress({
      job_id: "",
      status: "running",
      pct: 0,
      message: "브라우저 실행 요청 중…",
    });
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("page_url", targetUrl.trim());
      const endpoint =
        detect === "ipms"
          ? `${API_BASE}/v1/web-quality/ipms/session`
          : `${API_BASE}/v1/web-quality/session`;
      if (detect === "generic") fd.append("detect", "generic");
      const res = await fetch(endpoint, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json()) as WqJobProgress & { ok?: boolean; job_id?: string; detail?: string };
      if (!res.ok || !j.job_id) {
        throw new Error(j.detail || j.message || `세션 생성 실패 (HTTP ${res.status})`);
      }
      await pollSessionJob(j.job_id, targetUrl.trim(), detect);
    } catch (e) {
      setMsg(String((e as Error).message || e));
      setSessionProgress(null);
    }
  }

  async function startIpmsSession() {
    await startBrowserSession(ipmsUrl, "ipms");
  }

  async function pollWqJob(jobId: string): Promise<Record<string, unknown> | null> {
    for (let i = 0; i < 900; i++) {
      const res = await fetchScanApi(`v1/web-quality/jobs/${jobId}`);
      const j = (await readJsonResponse(res)) as WqJobProgress & {
        ok?: boolean;
        result?: Record<string, unknown>;
      };
      if (!res.ok) throw new Error(j.message || `job poll failed (${res.status})`);
      setScanProgress({
        job_id: jobId,
        status: j.status,
        pct: j.pct ?? 0,
        message: j.message || "",
        step_label: j.step_label,
        error: j.error,
      });
      if (j.status === "done" && j.result) return j.result;
      if (j.status === "cancelled") throw new Error("진단이 취소되었습니다.");
      if (j.status === "error") throw new Error(j.error || j.message || "진단 실패");
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error("진단 시간 초과");
  }

  async function cancelScan() {
    const jobId = scanProgress?.job_id;
    if (!jobId) return;
    try {
      const res = await fetchScanApi(`v1/web-quality/jobs/${jobId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const j = await readJsonResponse(res);
        throw new Error(String(j.detail || `취소 실패 (HTTP ${res.status})`));
      }
      setMsg("진단 취소 요청됨");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    }
  }

  async function loadHistoryRecord(jobId: string, recordMode?: string) {
    setBusy(true);
    setBusyMode(mode);
    setMsg("");
    try {
      const res = await fetchScanApi(`v1/web-quality/history/${jobId}`);
      const j = await readJsonResponse(res);
      if (!res.ok || !j.payload) {
        throw new Error(String(j.detail || `이력 불러오기 실패 (HTTP ${res.status})`));
      }
      const payload = j.payload as ScanResult;
      const scanMode = (recordMode as ScanMode) || (payload.mode as ScanMode) || mode;
      if (scanMode === "ipms-public" || scanMode === "ipms-auth" || scanMode === "external" || scanMode === "java-upload") {
        setMode(scanMode);
        setResultsByMode((prev) => ({ ...prev, [scanMode]: payload }));
        setJobIdsByMode((prev) => ({ ...prev, [scanMode]: jobId }));
        setTab("all");
        setMsg(`이력 불러옴 — ${payload.findings.length}건 (${payload.scanned_at?.slice(0, 19) || ""})`);
      }
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  const appendCommonFields = useCallback(
    (fd: FormData) => {
      fd.append("mode", mode);
      fd.append("include_runtime", includeRuntime ? "true" : "false");
      if (isIpmsMode(mode)) {
        fd.append("target", "ipms-online");
        fd.append("page_url", ipmsUrl.trim());
        fd.append("ipms_access", ipmsAccessForMode(mode) || "public");
        if (sessionJobId.trim()) fd.append("session_job_id", sessionJobId.trim());
        if (sessionStorageFile) fd.append("session_storage", sessionStorageFile);
        if (selectedIds.length) fd.append("state_ids", selectedIds.join(","));
      } else if (mode === "java-upload") {
        fd.append("target", "java-upload");
        if (includeRuntime) {
          fd.append("page_url", javaBaseUrl.trim());
          if (loginUrl.trim()) fd.append("login_url", loginUrl.trim());
          if (loginUsername.trim()) fd.append("login_username", loginUsername.trim());
          if (loginPassword.trim()) fd.append("login_password", loginPassword.trim());
        }
        if (selectedIds.length) fd.append("state_ids", selectedIds.join(","));
      } else {
        fd.append("target", "external");
        fd.append("page_url", pageUrl.trim());
        fd.append(
          "need_login",
          needLogin || externalSessionReady ? "true" : "false"
        );
        if (externalSessionReady && sessionJobId.trim()) {
          fd.append("session_job_id", sessionJobId.trim());
        }
        if (sessionStorageFile) fd.append("session_storage", sessionStorageFile);
        if (selectedIds.length) fd.append("state_ids", selectedIds.join(","));
      }
    },
    [
      mode,
      pageUrl,
      needLogin,
      includeRuntime,
      selectedIds,
      ipmsUrl,
      sessionJobId,
      sessionStorageFile,
      externalSessionReady,
      javaBaseUrl,
      loginUrl,
      loginUsername,
      loginPassword,
    ]
  );

  const validate = useCallback(async () => {
    if (mode === "java-upload" && zipFile && shouldUploadDirect(zipFile) && !isLocalPortalHost()) {
      const check = clientSideZipValidate(zipFile, false);
      setDesignCheck({
        checking: false,
        canRun: check.ok,
        message: check.message,
        runtimeReady: undefined,
        portalPasswordSet: undefined,
      });
      return;
    }
    setDesignCheck({ checking: true, canRun: false, message: "사전 검증 중…" });
    try {
      const fd = new FormData();
      appendCommonFields(fd);
      if (mode === "java-upload" && zipFile) fd.append("file", zipFile);
      const res = await postScanMultipart("v1/web-quality/validate", fd);
      const j = await readJsonResponse(res);
      if (!res.ok) {
        setDesignCheck({
          checking: false,
          canRun: false,
          message: String(j.detail || j.message || `검증 실패 (HTTP ${res.status})`),
        });
        return;
      }
      setDesignCheck({
        checking: false,
        canRun: Boolean(j.can_run),
        message: String(j.message || "진단 실행 가능"),
        runtimeReady: j.runtime_ready as boolean | undefined,
        portalPasswordSet: j.portal_password_set as boolean | undefined,
      });
    } catch (e) {
      setDesignCheck({
        checking: false,
        canRun: false,
        message: wrapScanFetchError(e).message,
      });
    }
  }, [appendCommonFields, mode, zipFile]);

  validateRef.current = validate;

  const validateWatchKey = useMemo(
    () =>
      [
        mode,
        ipmsUrl,
        pageUrl,
        needLogin,
        includeRuntime,
        javaBaseUrl,
        loginUrl,
        loginUsername,
        sessionJobId,
        sessionStorageFile ? "1" : "0",
        externalSessionReady ? "1" : "0",
        zipFile ? zipFile.name : "",
        zipFile?.size ?? 0,
      ].join("|"),
    [
      mode,
      ipmsUrl,
      pageUrl,
      needLogin,
      includeRuntime,
      javaBaseUrl,
      loginUrl,
      loginUsername,
      sessionJobId,
      sessionStorageFile,
      externalSessionReady,
      zipFile,
    ]
  );

  useEffect(() => {
    if (validateTimer.current) window.clearTimeout(validateTimer.current);
    validateTimer.current = window.setTimeout(() => void validateRef.current(), 500);
    return () => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
    };
  }, [validateWatchKey]);

  async function runScan() {
    const scanMode = mode;
    const format = "json" as const;
    setBusy(true);
    setBusyMode(scanMode);
    setScanProgress(null);
    setScanProgressMode(scanMode);
    setProgress(
      mode === "ipms-public"
        ? "IPMS 공개 화면 진단 실행 중…"
        : mode === "ipms-auth"
          ? "IPMS 로그인 화면 진단 실행 중…"
          : mode === "java-upload"
            ? includeRuntime
              ? "Java ZIP 정적 + 화면 진단 실행 중…"
              : "Java ZIP 정적 진단 실행 중…"
            : "외부 URL 화면 진단 실행 중…"
    );
    setMsg("");
    try {
      const fd = new FormData();
      appendCommonFields(fd);
      if (mode === "java-upload") {
        if (!zipFile) throw new Error("ZIP 파일을 선택하세요.");
        fd.append("file", zipFile);
      }
      if (mode === "ipms-auth" && includeRuntime && !sessionJobId && !sessionStorageFile) {
        throw new Error("로그인 세션을 먼저 생성하거나 JSON 파일을 업로드하세요.");
      }
      if (mode === "external" && !scenarioLoaded) {
        throw new Error("먼저 「화면 시나리오 가져오기」를 실행하세요.");
      }
      if (mode === "external" && scenarioLoaded && !selectedIds.length) {
        throw new Error("진단할 화면을 하나 이상 선택하세요.");
      }
      fd.append("format", format);
      if (format === "json" && includeRuntime && isAsyncScanMode(mode)) {
        fd.append("async_progress", "true");
      }
      const res = await postScanMultipart("v1/web-quality/run", fd);
      const start = (await readJsonResponse(res)) as ScanResult & {
        detail?: string;
        async?: boolean;
        job_id?: string;
        pct?: number;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(String(start.detail || `진단 실패 (HTTP ${res.status})`));
      }
      let j: ScanResult;
      if (start.async && start.job_id && isAsyncScanMode(mode)) {
        setScanProgress({
          job_id: start.job_id,
          status: "running",
          pct: start.pct ?? 0,
          message: start.message || "진단 시작…",
        });
        const polled = await pollWqJob(start.job_id);
        if (!polled) throw new Error("진단 결과 없음");
        j = polled as ScanResult;
      } else {
        j = start;
      }
      setResultsByMode((prev) => ({ ...prev, [scanMode]: j }));
      if (j.job_id) {
        setJobIdsByMode((prev) => ({ ...prev, [scanMode]: j.job_id as string }));
      } else if (start.job_id) {
        setJobIdsByMode((prev) => ({ ...prev, [scanMode]: start.job_id as string }));
      }
      setTab("all");
      const diffNote = j.diff
        ? ` · diff 신규 ${j.diff.new_count ?? 0} / 해소 ${j.diff.resolved_count ?? 0}`
        : "";
      const rtNote =
        j.runtime_available ? "" : ` (화면: ${formatRuntimeError(j.runtime_error) || "런타임 불가"})`;
      setMsg(
        `진단 완료 — ${j.findings.length}건 · 캡처 ${j.screenshots?.length ?? 0}장 · 미실행 ${j.stats?.not_scanned ?? 0}건${diffNote}${rtNote}`
      );
      void refreshHistory();
    } catch (e) {
      setMsg(wrapScanFetchError(e).message);
    } finally {
      setBusy(false);
      setBusyMode(null);
      setProgress("");
      setScanProgress(null);
      setScanProgressMode(null);
    }
  }

  async function exportReport(
    format: "xlsx" | "html" | "zip",
    action: "open" | "download" = "download"
  ) {
    const cached = resultsByMode[mode];
    const jobId = lastJobId;
    if (!cached && !jobId) {
      setMsg("먼저 진단을 실행하거나 이력에서 결과를 불러오세요.");
      return;
    }
    setExportBusy(true);
    setMsg("");
    try {
      const postExport = (payload: ScanResult) =>
        fetchScanApi("v1/web-quality/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format, payload }),
        });

      let res: Response;
      if (cached) {
        res = await postExport(cached);
      } else if (jobId) {
        res = await fetchScanApi(`v1/web-quality/jobs/${jobId}/export?format=${format}`);
        if (!res.ok) {
          const histRes = await fetchScanApi(`v1/web-quality/history/${jobId}`);
          if (histRes.ok) {
            const h = (await readJsonResponse(histRes)) as { payload?: ScanResult };
            if (h.payload) {
              res = await postExport(h.payload);
            }
          }
        }
      } else {
        throw new Error("내보낼 진단 결과가 없습니다.");
      }
      if (!res.ok) {
        const j = await readJsonResponse(res);
        throw new Error(
          String(
            j.detail ||
              (res.status === 404
                ? "보고서 API를 찾을 수 없습니다. API(start-local-scan.bat) 또는 Render 배포를 확인하세요."
                : `다운로드 실패 (HTTP ${res.status})`)
          )
        );
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const fallback =
        format === "html"
          ? "web_quality.html"
          : format === "zip"
            ? "web_quality.zip"
            : "web_quality.xlsx";
      const filename = m?.[1] || fallback;
      if (format === "html" && action === "open") {
        openHtmlBlob(blob);
        setMsg("HTML 보고서를 새 탭에서 열었습니다. 저장은 Ctrl+S");
      } else {
        downloadBlob(blob, filename);
        setMsg(`${format.toUpperCase()} 보고서 다운로드 완료`);
      }
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setExportBusy(false);
    }
  }

  const canExport = Boolean((result || lastJobId) && !busy && !exportBusy);

  const filteredFindings = useMemo(() => {
    if (!result) return [] as Finding[];
    let list = result.findings;
    if (tab === "standard") list = list.filter((f) => f.category === "standard");
    else if (tab === "compat") list = list.filter((f) => f.category === "compat");
    else if (tab === "a11y") list = list.filter((f) => f.category === "a11y");
    else if (tab === "not_scanned")
      list = list.filter((f) => f.status === "not_scanned");
    else if (tab === "manual")
      list = list.filter((f) => f.status === "manual" || f.status === "na");
    else if (tab === "diff") list = result?.diff?.new ?? [];
    else if (tab === "captures") list = [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.location.toLowerCase().includes(q) ||
        f.rule_id.toLowerCase().includes(q) ||
        f.message.toLowerCase().includes(q) ||
        (f.fix || "").toLowerCase().includes(q) ||
        resolveFindingFix(f, fixGuides).text.toLowerCase().includes(q)
    );
  }, [result, tab, query, fixGuides]);

  const stateCaptures = useMemo(
    () => (result?.screenshots ?? []).filter((s) => s.kind === "state"),
    [result?.screenshots]
  );

  const elementCaptures = useMemo(
    () => (result?.screenshots ?? []).filter((s) => s.kind === "element"),
    [result?.screenshots]
  );

  const notScannedRows = useMemo(() => {
    if (!result) return [] as Record<string, string>[];
    const rows: Record<string, string>[] = [];
    for (const s of result.coverage.sources.filter((x) => !x.scanned)) {
      rows.push({
        구분: "소스",
        ID: s.path,
        이름: s.path,
        사유: s.reason || "미스캔",
      });
    }
    for (const s of result.coverage.screens.filter((x) => !x.scanned)) {
      rows.push({
        구분: "화면",
        ID: s.state_id,
        이름: s.label,
        사유: s.reason || "미실행",
      });
    }
    return rows;
  }, [result]);

  const stats = result?.stats;
  const playwrightReady = envStatus?.playwright?.browser_ready ?? false;

  const selectableScenarios = useMemo(
    () => scenarios.filter((c) => c.selectable),
    [scenarios]
  );

  const scenarioPanel =
    mode === "java-upload" && scenarioLoaded && !selectableScenarios.length ? (
      <div className="wq-alert">
        <p>화면 시나리오(URL 매핑) 없음 — 정적 JSP/HTML 진단만 실행됩니다.</p>
        {javaStaticHint ? <p className="hint">{javaStaticHint}</p> : null}
      </div>
    ) : mode === "external" && scenarioLoaded && !selectableScenarios.length ? (
      <div className="wq-alert">
        <p>선택 가능한 화면 없음</p>
        <ul>
          {scenarioWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
          <li>2단계 인증·로그인 필요 링크는 자동 제외됩니다.</li>
        </ul>
      </div>
    ) : scenarioLoaded && selectableScenarios.length ? (
      <div className="wq-scenario-block">
        <div className="wq-scenario-head">
          <h3>화면 시나리오</h3>
          <div className="btn-row">
            {mode === "external" ? (
              <button
                type="button"
                className="btn ghost"
                disabled={scenarioBusy}
                onClick={() => void loadExternalScenarios()}
              >
                {scenarioBusy ? "탐색 중…" : "시나리오 다시 탐색"}
              </button>
            ) : null}
            {mode === "java-upload" ? (
              <button
                type="button"
                className="btn ghost"
                disabled={scenarioBusy || !zipFile}
                onClick={() => void loadJavaScenarios()}
              >
                {scenarioBusy ? "읽는 중…" : "ZIP 다시 읽기"}
              </button>
            ) : null}
            {isIpmsMode(mode) ? (
              <button
                type="button"
                className="btn ghost"
                disabled={scenarioBusy}
                onClick={() => void loadIpmsScenarios()}
              >
                {scenarioBusy ? "읽는 중…" : "시나리오 다시 읽기"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                setSelectedIds(selectableScenarios.map((c) => c.state_id))
              }
            >
              전체 선택
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                setSelectedIds(
                  scenarios
                    .filter((c) => c.recommended && c.selectable)
                    .map((c) => c.state_id)
                )
              }
            >
              권장만
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setSelectedIds([])}
            >
              모두 해제
            </button>
          </div>
        </div>
        <p className="hint">
          {mode === "ipms-public"
            ? "비로그인 공개 GNB 메뉴. 체크된 화면만 Playwright+axe로 진단합니다."
            : mode === "ipms-auth"
              ? "로그인 후 메뉴. 세션 JSON 업로드 후 진단하세요."
              : mode === "java-upload"
                ? "JSP/HTML 정적 진단은 URL 없이. 화면 캡처는 배포 URL + 「화면 진단 포함」."
                : "실시간 탐색. 2단계 인증 등 접근 불가 화면은 제외됩니다."}
        </p>
        {scenarioWarnings.length ? (
          <ul className="hint">
            {scenarioWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        <ul className="wq-scenario-list">
          {selectableScenarios.map((c) => {
            const checked = selectedIds.includes(c.state_id);
            const risks = (c.risk ?? [])
              .map((r) => RISK_LABEL[r] || r)
              .filter(Boolean);
            return (
              <li key={c.state_id}>
                <label className={`check-row ${c.selectable ? "" : "is-disabled"}`}>
                  <input
                    type="checkbox"
                    checked={c.selectable ? checked : false}
                    disabled={!c.selectable}
                    onChange={() => {
                      if (!c.selectable) return;
                      setSelectedIds((prev) =>
                        prev.includes(c.state_id)
                          ? prev.filter((id) => id !== c.state_id)
                          : [...prev, c.state_id]
                      );
                    }}
                  />
                  <span>
                    {c.label}
                    <span className="wq-scenario-meta">
                      {" "}
                      · {KIND_LABEL[c.kind] || c.kind}
                      {c.recommended && c.selectable ? " · 권장" : ""}
                      {risks.length ? ` · ${risks.join(", ")}` : ""}
                    </span>
                  </span>
                </label>
                <p className="wq-scenario-desc">
                  {c.selectable ? c.description : c.skip_reason || c.description}
                  {c.source?.files?.[0] ? ` · ${c.source.files[0]}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <div className="portal-nav-shell">
        <PortalNav />
      </div>
      <main className="wq-page">
      <section className="hero">
        <h1>웹 품질 진단</h1>
        <p>
          KWCAG 2.2 · IPMS·외부 URL(실시간)·Java ZIP(JSP/HTML 정적) 화면 품질 진단.
        </p>
      </section>

      {!playwrightReady && envStatus?.playwright?.install_hint ? (
        <section className="panel wq-env-panel">
          <div className="wq-env-chips">
            <span className="wq-chip warn">Playwright 미설치</span>
          </div>
          <p className="hint wq-install-hint">
            화면 진단 전 API 터미널에서{" "}
            <code>{envStatus.playwright.install_hint}</code> 실행 후 API를 재시작하세요.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <h2>진단 설정</h2>
        <div className="tabs wq-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "ipms-public" ? "active" : ""}`}
            aria-selected={mode === "ipms-public"}
            onClick={() => switchMode("ipms-public", { includeRuntime: true })}
          >
            IPMS 공개
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "ipms-auth" ? "active" : ""}`}
            aria-selected={mode === "ipms-auth"}
            onClick={() => switchMode("ipms-auth", { includeRuntime: true })}
          >
            IPMS 로그인
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "java-upload" ? "active" : ""}`}
            aria-selected={mode === "java-upload"}
            onClick={() => switchMode("java-upload", { includeRuntime: false })}
          >
            Java ZIP
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "external" ? "active" : ""}`}
            aria-selected={mode === "external"}
            onClick={() => switchMode("external", { includeRuntime: true })}
          >
            외부 URL
          </button>
        </div>

        {mode === "ipms-public" ? (
          <div className="wq-step-block">
            <p className="hint">
              <strong>전기사업정보시스템 — 공개 화면</strong> · 홈, 알림마당, 이용안내, 통계분석 등
              비로그인 GNB 메뉴 (사전 정의 시나리오).
            </p>
            <div className="form-grid">
              <label>
                IPMS URL
                <input
                  type="url"
                  value={ipmsUrl}
                  onChange={(e) => setIpmsUrl(e.target.value)}
                  placeholder={IPMS_DEFAULT_URL}
                />
              </label>
            </div>
          </div>
        ) : mode === "ipms-auth" ? (
          <div className="wq-step-block">
            <p className="hint">
              <strong>전기사업정보시스템 — 로그인 후</strong> · 공동인증서(2단계)는 세션 JSON이
              필요합니다. <strong>배포 환경</strong>에서는 아래 ①→② 순서를 권장합니다.
            </p>
            <div className="form-grid">
              <label>
                IPMS URL
                <input
                  type="url"
                  value={ipmsUrl}
                  onChange={(e) => setIpmsUrl(e.target.value)}
                  placeholder={IPMS_DEFAULT_URL}
                />
              </label>
            </div>
            <div className="wq-runtime-block" style={{ marginTop: "0.75rem" }}>
              <p className="hint">
                <strong>① 세션 JSON 준비</strong> (배포·운영 권장) — 담당 PC에서 터미널로
                생성 후 업로드.
              </p>
              <details open style={{ marginBottom: "0.75rem" }}>
                <summary>터미널에서 세션 만들기</summary>
                <pre className="wq-code-block">{`cd apps/api
python -m playwright install chromium
python scripts/save_ipms_session.py --url ${ipmsUrl.trim() || IPMS_DEFAULT_URL} -o ipms-session.json`}</pre>
                <p className="hint">로그인·2단계 완료 → Enter → JSON 파일 업로드</p>
              </details>
              <label style={{ display: "block", marginBottom: "0.75rem" }}>
                ② 세션 JSON 업로드 (storage_state)
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    setSessionStorageFile(e.target.files?.[0] ?? null);
                    if (e.target.files?.[0]) setSessionJobId("");
                  }}
                />
              </label>
              {sessionJobId || sessionStorageFile ? (
                <span className="wq-chip ok">세션 준비됨</span>
              ) : null}

              <details style={{ marginTop: "1rem" }}>
                <summary>③ 개발 PC — 로그인 세션 자동 생성 (API와 같은 PC만)</summary>
                <p className="hint" style={{ marginTop: "0.5rem" }}>
                  API 서버에서 Chromium이 열립니다. 배포 서버에서는 JSON 업로드를 사용하세요.
                </p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      sessionProgress?.status === "running" || sessionProgress?.status === "queued"
                    }
                    onClick={() => void startIpmsSession()}
                  >
                    {sessionProgress?.status === "running" || sessionProgress?.status === "queued"
                      ? "세션 생성 중…"
                      : "로그인 세션 생성"}
                  </button>
                </div>
                {sessionProgress ? (
                  <div className="run-progress source-scan-progress">
                    <div
                      className="progress-bar"
                      role="progressbar"
                      aria-valuenow={Math.round(sessionProgress.pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="progress-fill" style={{ width: `${sessionProgress.pct}%` }} />
                    </div>
                    <p className="hint">
                      {Math.round(sessionProgress.pct)}% · {sessionProgress.message}
                    </p>
                  </div>
                ) : null}
              </details>
            </div>
          </div>
        ) : mode === "java-upload" ? (
          <div className="wq-step-block">
            <div className="env-panel-head">
              <EnvSourceBadge />
              {envLoading ? <EnvToolsSkeleton /> : null}
            </div>
            <p className="hint">
              Java/WAR <strong>ZIP</strong> — JSP·HTML <strong>정적</strong> 품질 진단 (URL
              불필요). Spring 배포 URL이 있으면 「화면 진단 포함」으로 Playwright 캡처 가능.
            </p>
            <div className="form-grid">
              <label>
                Java 소스 ZIP
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => {
                    setZipFile(e.target.files?.[0] ?? null);
                    setScenarioLoaded(false);
                    setScenarios([]);
                    setJavaStaticHint("");
                  }}
                />
              </label>
            </div>
            <CloudLargeZipHint />
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={scenarioBusy || !zipFile}
                onClick={() => void loadJavaScenarios()}
              >
                {scenarioBusy ? "ZIP 분석 중…" : "ZIP에서 시나리오 읽기"}
              </button>
            </div>
            <label className="check-row" style={{ marginTop: "0.75rem" }}>
              <input
                type="checkbox"
                checked={includeRuntime}
                onChange={(e) => setIncludeRuntime(e.target.checked)}
              />
              화면(Playwright) 진단 포함 — 배포 URL 필요
            </label>
            {includeRuntime ? (
              <div className="form-grid" style={{ marginTop: "0.5rem" }}>
                <label>
                  배포 URL
                  <input
                    type="url"
                    value={javaBaseUrl}
                    onChange={(e) => setJavaBaseUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8080"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="wq-step-block">
            <p className="hint">
              <strong>외부 URL · 포털 앱</strong> — 진단 URL은 <strong>테스트할 페이지</strong>
              입니다. 로그인이 필요하면 계정을 UI에 입력하지 않고, 브라우저에서 직접 로그인하는
              세션 방식을 사용하세요.
            </p>
            <div className="form-grid">
              <label>
                진단 URL (테스트할 화면)
                <input
                  type="url"
                  value={pageUrl}
                  onChange={(e) => {
                    setPageUrl(e.target.value);
                    setScenarioLoaded(false);
                  }}
                  placeholder={EXTERNAL_URL_PLACEHOLDER}
                />
              </label>
            </div>
            <label className="check-row" style={{ marginTop: "0.75rem" }}>
              <input
                type="checkbox"
                checked={needLogin}
                onChange={(e) => {
                  setNeedLogin(e.target.checked);
                  setScenarioLoaded(false);
                }}
              />
              로그인 필요
            </label>
            {needLogin ? (
              <div className="wq-runtime-block" style={{ marginTop: "0.75rem" }}>
                <p className="hint">
                  외부 사이트는 <strong>③ 로그인 세션 자동 생성</strong>을 권장합니다. API와
                  같은 PC에서 Chromium이 열리며, 로그인·2단계 인증을 브라우저에서 직접 완료합니다.
                </p>
                <div className="btn-row" style={{ marginBottom: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      !pageUrl.trim() ||
                      sessionProgress?.status === "running" ||
                      sessionProgress?.status === "queued"
                    }
                    onClick={() => void startBrowserSession(pageUrl, "generic")}
                  >
                    {sessionProgress?.status === "running" || sessionProgress?.status === "queued"
                      ? "세션 생성 중…"
                      : "③ 로그인 세션 자동 생성"}
                  </button>
                </div>
                {sessionProgress ? (
                  <div className="run-progress source-scan-progress" style={{ marginBottom: "0.75rem" }}>
                    <div
                      className="progress-bar"
                      role="progressbar"
                      aria-valuenow={Math.round(sessionProgress.pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="progress-fill" style={{ width: `${sessionProgress.pct}%` }} />
                    </div>
                    <p className="hint">
                      {Math.round(sessionProgress.pct)}% · {sessionProgress.message}
                    </p>
                  </div>
                ) : null}
                {externalSessionReady ? (
                  <span className="wq-chip ok" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
                    세션 준비됨
                  </span>
                ) : sessionJobId && sessionPageUrl && sessionPageUrl !== pageUrl.trim() ? (
                  <span className="wq-chip warn" style={{ marginBottom: "0.75rem", display: "inline-block" }}>
                    다른 URL 세션 — 다시 생성 필요
                  </span>
                ) : null}

                <details style={{ marginBottom: "0.75rem" }}>
                  <summary>① 터미널에서 세션 만들기</summary>
                  <pre className="wq-code-block">{`cd apps/api
python -m playwright install chromium
python scripts/save_ipms_session.py --url ${pageUrl.trim() || EXTERNAL_URL_PLACEHOLDER} -o session.json`}</pre>
                  <p className="hint">로그인·2단계 완료 → Enter → JSON 파일 업로드</p>
                </details>
                <label style={{ display: "block" }}>
                  ② 세션 JSON 업로드 (storage_state)
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      setSessionStorageFile(e.target.files?.[0] ?? null);
                      if (e.target.files?.[0]) {
                        setSessionJobId("");
                        setSessionPageUrl(pageUrl.trim());
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={scenarioBusy || !pageUrl.trim()}
                onClick={() => void loadExternalScenarios()}
              >
                {scenarioBusy ? "탐색 중…" : "화면 시나리오 가져오기"}
              </button>
            </div>
            {discoverProgress ? (
              <div className="run-progress source-scan-progress" style={{ marginTop: "0.75rem" }}>
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-valuenow={Math.round(discoverProgress.pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="progress-fill" style={{ width: `${discoverProgress.pct}%` }} />
                </div>
                <p className="hint">
                  {Math.round(discoverProgress.pct)}% · {discoverProgress.message}
                  {discoverProgress.step_label &&
                  !discoverProgress.message.includes(discoverProgress.step_label)
                    ? ` · ${discoverProgress.step_label}`
                    : ""}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {scenarioPanel}

        {mode !== "java-upload" ? (
          <p className="hint">Playwright+axe 화면 진단이 포함됩니다.</p>
        ) : null}

        {!(activeScanProgress || discoverProgress) && designCheck.message ? (
        <div
          className={`wq-status-banner ${
            designCheck.checking
              ? ""
              : designCheck.canRun
                ? designCheck.runtimeReady === false && includeRuntime
                  ? "warn"
                  : "ok"
                : "err"
          }`}
        >
          {designCheck.message}
        </div>
        ) : null}

        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={isBusyHere || (!designCheck.canRun && !designCheck.checking)}
            onClick={() => void runScan()}
          >
            {mode === "ipms-public"
              ? "공개 화면 진단"
              : mode === "ipms-auth"
                ? "로그인 화면 진단"
                : mode === "java-upload"
                  ? includeRuntime
                    ? "정적 + 화면 진단"
                    : "정적 진단 실행"
                  : "화면 진단 실행"}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!activeScanProgress?.job_id || exportBusy}
            onClick={() => void cancelScan()}
          >
            취소
          </button>
          <>
              <button
                type="button"
                className="btn ghost"
                disabled={!canExport}
                onClick={() => void exportReport("xlsx")}
                title={canExport ? "Excel 저장" : "진단 또는 이력 불러오기 후 사용"}
              >
                Excel
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={!canExport}
                onClick={() => void exportReport("html", "open")}
                title={canExport ? "HTML 새 탭에서 열기" : "진단 또는 이력 불러오기 후 사용"}
              >
                HTML
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={!canExport}
                onClick={() => void exportReport("html", "download")}
              >
                HTML 저장
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={!canExport}
                onClick={() => void exportReport("zip")}
              >
                ZIP
              </button>
            </>
        </div>
        {activeScanProgress ? (
          <div className="run-progress source-scan-progress">
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={Math.round(activeScanProgress.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="progress-fill" style={{ width: `${activeScanProgress.pct}%` }} />
            </div>
            <p className="hint">
              {Math.round(activeScanProgress.pct)}% · {activeScanProgress.message}
              {activeScanProgress.step_label &&
              !activeScanProgress.message.includes(activeScanProgress.step_label)
                ? ` · ${activeScanProgress.step_label}`
                : ""}
            </p>
          </div>
        ) : progress ? (
          <p className="hint">{progress}</p>
        ) : null}
        {msg ? (
          <p className={`msg ${msg.includes("완료") || msg.includes("시나리오") ? "ok" : "err"}`}>
            {msg}
          </p>
        ) : null}
      </section>

      {history.length ? (
        <section className="panel">
          <h2>진단 이력</h2>
          <p className="hint">행을 클릭하면 해당 결과를 불러옵니다. Excel/HTML/ZIP은 이력 job_id로도 내보낼 수 있습니다.</p>
          <div className="table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>대상</th>
                  <th>모드</th>
                  <th>미흡</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.job_id}
                    style={{ cursor: h.job_id ? "pointer" : undefined }}
                    onClick={() => h.job_id && void loadHistoryRecord(h.job_id, h.mode)}
                  >
                    <td>{h.scanned_at?.slice(0, 19) || h.saved_at?.slice(0, 19) || "-"}</td>
                    <td>
                      {h.target_name}
                      {h.page_url ? (
                        <span className="hint" style={{ display: "block" }}>
                          {h.page_url}
                        </span>
                      ) : null}
                    </td>
                    <td>{MODE_LABEL[h.mode || ""] || h.mode}</td>
                    <td>{h.fail ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="panel">
          <h2>진단 결과</h2>
          <p className="hint">
            {result.target_name}
            {result.mode === "external"
              ? ` · 외부 URL · ${result.page_url || result.base_url}`
              : result.mode === "java-upload"
                ? ` · Java ZIP · ${result.page_url || "정적만"}`
                : result.mode === "ipms-public"
                  ? ` · IPMS 공개 · ${result.page_url || result.base_url}`
                  : result.mode === "ipms-auth"
                    ? ` · IPMS 로그인 · ${result.page_url || result.base_url}`
                    : result.mode === "ipms-online"
                      ? ` · IPMS · ${result.page_url || result.base_url}`
                      : result.mode === "external"
                        ? ` · ${result.page_url || result.base_url}`
                        : ` · ${result.base_url}`}{" "}
            · {result.scanned_at}
          </p>
          {!result.runtime_available && result.runtime_error ? (
            <div className="wq-alert warn">
              {formatRuntimeError(result.runtime_error)}
            </div>
          ) : null}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">전체</span>
              <strong>{stats?.total ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">통과</span>
              <strong>{stats?.pass ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">미흡</span>
              <strong>{stats?.fail ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">미실행</span>
              <strong>{stats?.not_scanned ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">캡처</span>
              <strong>{result.screenshots?.length ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">해당없음</span>
              <strong>{stats?.na ?? 0}</strong>
            </div>
          </div>

          {result.diff ? (
            <p className="hint">
              이전 대비 — 신규 {result.diff.new_count ?? 0} · 해소 {result.diff.resolved_count ?? 0} · 유지{" "}
              {result.diff.unchanged_count ?? 0}
            </p>
          ) : null}

          <div className="tabs" role="tablist">
            {(
              [
                ["all", "전체"],
                ["standard", "웹표준"],
                ["compat", "웹호환성"],
                ["a11y", "웹접근성"],
                ["captures", "화면캡처"],
                ["diff", "Diff 신규"],
                ["not_scanned", "미실행"],
                ["manual", "수동/해당없음"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`tab ${tab === id ? "active" : ""}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "not_scanned" ? (
            <ResultTable rows={notScannedRows} resetKey={`ns-${result.scanned_at}`} />
          ) : tab === "captures" ? (
            <div className="wq-captures">
              {!stateCaptures.length && !elementCaptures.length ? (
                <div className="wq-alert warn">
                  <p>화면 캡처 없음</p>
                  <ul>
                    <li>「포털 앱」 탭에서 「화면 진단 포함」을 켜고 실행하세요.</li>
                    <li>
                      Playwright Chromium 설치:{" "}
                      <code>cd apps/api && python -m playwright install chromium</code>
                    </li>
                    <li>포털 암호(API <code>PORTAL_PASSWORD</code>)를 설정하세요.</li>
                  </ul>
                </div>
              ) : null}
              {stateCaptures.length ? <h3>화면 전체</h3> : null}
              <div className="wq-capture-grid">
                {stateCaptures.map((shot) => (
                  <figure key={shot.id} className="wq-capture-card">
                    {shot.data_url ? (
                      <img src={shot.data_url} alt={shot.label} loading="lazy" />
                    ) : null}
                    <figcaption>
                      <strong>{shot.label}</strong>
                      <span className="hint"> ({shot.state_id})</span>
                      <p>{shot.description}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {elementCaptures.length ? <h3>미흡 요소</h3> : null}
              <div className="wq-capture-grid">
                {elementCaptures.map((shot) => (
                  <figure key={shot.id} className="wq-capture-card wq-capture-element">
                    {shot.data_url ? (
                      <img src={shot.data_url} alt={shot.description} loading="lazy" />
                    ) : null}
                    <figcaption>
                      <strong>{shot.label}</strong>
                      <p>{shot.description}</p>
                      {shot.selector ? (
                        <p className="hint">
                          <code>{shot.selector}</code>
                        </p>
                      ) : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : (
            <>
              <label className="search-row">
                검색
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="위치, 기준, 내용, 개선안"
                />
              </label>
              <div className="table-wrap">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>유형</th>
                      <th>위치</th>
                      <th>기준</th>
                      <th>분류</th>
                      <th>상태</th>
                      <th>내용</th>
                      <th>개선안</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFindings.slice(0, PAGE_SIZE).map((f) => (
                        <tr key={f.id}>
                          <td>{f.target === "source" ? "소스" : "화면"}</td>
                          <td>{f.location}</td>
                          <td>{f.rule_id}</td>
                          <td>{CATEGORY_LABEL[f.category] || f.category}</td>
                          <td>{STATUS_LABEL[f.status] || f.status}</td>
                          <td>
                            {f.message}
                            {f.detail ? (
                              <p className="hint" style={{ margin: "4px 0 0" }}>
                                {f.detail}
                              </p>
                            ) : null}
                          </td>
                          <td>
                            {f.status === "fail" || f.status === "review" ? (
                              <FindingFixCell finding={f} guides={fixGuides} />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {filteredFindings.length > PAGE_SIZE ? (
                <p className="hint">상위 {PAGE_SIZE}건만 표시 — 전체는 Excel/ZIP 보고서 참고</p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </main>
    </>
  );
}
