"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalNav } from "@/lib/PortalNav";
import { API_BASE } from "@/lib/apiBase";
import {
  DEFAULT_LOCAL_SCAN_API,
  fetchSourceScan,
  getLocalScanApiBase,
  isLocalScanEnabled,
  postSourceScanMultipart,
  setLocalScanApiBase,
  setLocalScanEnabled,
} from "@/lib/localScanApi";
import {
  normalizeFixGuides,
  resolveSourceScanFix,
  type FixGuidesCatalog,
} from "@/lib/sourceScanFix";
import { loadSourceScanPrefs, saveSourceScanPrefs } from "@/lib/sourceScanPrefs";
import {
  clientSideZipValidate,
  postMultipart,
  readJsonResponse,
  shouldUploadDirect,
  stageLargeZip,
  wrapFetchError,
} from "@/lib/formUpload";

const PAGE_SIZE = 80;

type TabId =
  | "all"
  | "fsb_direct"
  | "pmd_direct"
  | "analog"
  | "not_scanned"
  | "severity_high"
  | "severity_medium"
  | "severity_low"
  | "diff";

type Finding = {
  id: string;
  location: string;
  rule_id: string;
  rule_set: string;
  reference_ruleset?: string;
  category: string;
  status: string;
  severity: string;
  message: string;
  fix?: string;
  fix_url?: string;
  scanner?: string;
  scanner_rule_id?: string;
  language?: string;
  reference_url?: string;
};

type ScannerMeta = {
  available?: boolean;
  ran?: boolean;
  fail_count?: number;
  error?: string;
  skipped?: boolean;
  summary?: string;
};

type ScanResult = {
  ok: boolean;
  mode: string;
  target: string;
  target_name: string;
  job_id?: string;
  scanned_at: string;
  findings: Finding[];
  stats?: {
    total?: number;
    fail?: number;
    not_scanned?: number;
    by_ruleset?: Record<string, number>;
    by_severity?: Record<string, number>;
    by_language?: Record<string, number>;
  };
  coverage: { sources: { path: string; language: string; scanned: boolean; scanner?: string }[] };
  scanners?: Record<string, ScannerMeta>;
  languages?: string[];
  warnings?: string[];
  jdk_hint?: string;
  analog_coverage?: {
    unmapped_count?: number;
    unmapped_sample?: { scanner: string; scanner_rule_id: string; location: string }[];
  };
  diff?: {
    new_count?: number;
    resolved_count?: number;
    unchanged_count?: number;
    new?: Finding[];
    resolved?: Finding[];
  } | null;
};

type ScanStep = {
  id: string;
  label: string;
  status: string;
  detail: string;
};

type ScanProgress = {
  job_id: string;
  status: string;
  pct: number;
  message: string;
  queue_position?: number;
  steps: ScanStep[];
  error?: string;
};

type DesignCheck = { checking: boolean; canRun: boolean; message: string; warnings?: string[] };

const IDLE_UPLOAD_CHECK: DesignCheck = {
  checking: false,
  canRun: false,
  message: "ZIP 파일을 선택하세요",
};

const IDLE_PORTAL_CHECK: DesignCheck = {
  checking: false,
  canRun: true,
  message: "",
};
type PortalTarget = { id: string; name: string };
type ModeState = { result: ScanResult | null; jobId: string | null; scanFingerprint: string | null };
type EnvStatus = Record<string, unknown>;
type HistoryItem = {
  job_id?: string;
  target_name?: string;
  scanned_at?: string;
  fail?: number;
  mode?: string;
};
type RuleItem = { id: string; name?: string; category?: string; reference_url?: string };

const STEP_STATUS_ICON: Record<string, string> = {
  pending: "○",
  running: "◉",
  done: "✓",
  skipped: "—",
  error: "✕",
  cancelled: "⊘",
  queued: "…",
};

const RULESET_LABEL: Record<string, string> = {
  pmd: "PMD(직접)",
  findsecbugs: "FindSecBugs(직접)",
  analog: "Analog",
  system: "시스템",
};

const REF_RULESET_LABEL: Record<string, string> = {
  findsecbugs: "→ FSB",
  pmd: "→ PMD",
};

const STATUS_LABEL: Record<string, string> = {
  fail: "미흡",
  not_scanned: "미실행",
  pass: "통과",
};

const DEFAULT_PMD_RULESETS_DISPLAY =
  "category/java/bestpractices.xml, category/java/errorprone.xml, category/java/security.xml";
const DEFAULT_EXCLUDE_DISPLAY =
  "**/test/**, **/tests/**, **/target/**, **/node_modules/**, **/build/**, …";

const SEV_LABEL: Record<string, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

function emptyModeState(): ModeState {
  return { result: null, jobId: null, scanFingerprint: null };
}

function buildScanFingerprint(
  mode: "portal" | "upload",
  target: string,
  zipFile: File | null,
  opts: {
    tryJavaBuild: boolean;
    tryEslintZip: boolean;
    pmdRulesets: string;
    excludePaths: string;
    spotbugsEffort: string;
    spotbugsThreshold: string;
    usePrebuiltClasses: boolean;
  }
): string {
  const zipKey = zipFile ? `${zipFile.name}|${zipFile.size}|${zipFile.lastModified}` : "";
  return [
    mode,
    target,
    zipKey,
    opts.tryJavaBuild,
    opts.tryEslintZip,
    opts.pmdRulesets,
    opts.excludePaths,
    opts.spotbugsEffort,
    opts.spotbugsThreshold,
    opts.usePrebuiltClasses,
  ].join("|");
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

function scannerLine(meta: ScannerMeta, fallbackName: string) {
  return meta.summary || `${fallbackName}: ${meta.error || (meta.available ? "OK" : "미설정")}`;
}

function FindingFixCell({
  finding,
  guides,
}: {
  finding: Pick<
    Finding,
    | "fix"
    | "fix_url"
    | "reference_url"
    | "rule_id"
    | "rule_set"
    | "reference_ruleset"
    | "scanner"
    | "scanner_rule_id"
    | "status"
  >;
  guides: FixGuidesCatalog;
}) {
  const { text, url } = resolveSourceScanFix(finding, guides);
  if (!text && !url) return <>—</>;
  return (
    <div className="wq-fix-cell">
      {text ? <p style={{ margin: 0 }}>{text}</p> : null}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="hint">
          참고 문서
        </a>
      ) : null}
    </div>
  );
}

export default function SourceScanPage() {
  const [mode, setMode] = useState<"portal" | "upload">("upload");
  const [targets, setTargets] = useState<PortalTarget[]>([]);
  const [target, setTarget] = useState("er-modeler");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [tryJavaBuild, setTryJavaBuild] = useState(true);
  const [tryEslintZip, setTryEslintZip] = useState(false);
  const [usePrebuiltClasses, setUsePrebuiltClasses] = useState(true);
  const [pmdRulesets, setPmdRulesets] = useState("");
  const [excludePaths, setExcludePaths] = useState("");
  const [spotbugsEffort, setSpotbugsEffort] = useState("max");
  const [spotbugsThreshold, setSpotbugsThreshold] = useState("low");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [designCheck, setDesignCheck] = useState<DesignCheck>(IDLE_UPLOAD_CHECK);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [modeState, setModeState] = useState<{ portal: ModeState; upload: ModeState }>({
    portal: emptyModeState(),
    upload: emptyModeState(),
  });
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [envLoadError, setEnvLoadError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [rulesPmd, setRulesPmd] = useState<RuleItem[]>([]);
  const [rulesFsb, setRulesFsb] = useState<RuleItem[]>([]);
  const [rulesQuery, setRulesQuery] = useState("");
  const [fixGuides, setFixGuides] = useState<FixGuidesCatalog>({
    findsecbugs: {},
    pmd: {},
    bandit: {},
  });
  const [useLocalScan, setUseLocalScan] = useState(false);
  const [localApiUrl, setLocalApiUrl] = useState(DEFAULT_LOCAL_SCAN_API);
  const prefsLoaded = useRef(false);
  const forceRescanRef = useRef(false);
  const validateTimer = useRef<number | null>(null);
  const pollTimer = useRef<number | null>(null);
  const validateRef = useRef<() => Promise<void>>(async () => {});

  const validateWatchKey = useMemo(
    () =>
      [mode, target, zipFile?.name ?? "", zipFile?.size ?? 0, zipFile?.lastModified ?? 0, useLocalScan].join("|"),
    [mode, target, zipFile, useLocalScan]
  );

  const scanOpts = useMemo(
    () => ({
      tryJavaBuild,
      tryEslintZip,
      pmdRulesets,
      excludePaths,
      spotbugsEffort,
      spotbugsThreshold,
      usePrebuiltClasses,
    }),
    [
      tryJavaBuild,
      tryEslintZip,
      pmdRulesets,
      excludePaths,
      spotbugsEffort,
      spotbugsThreshold,
      usePrebuiltClasses,
    ]
  );

  const result = modeState[mode].result;
  const lastJobId = modeState[mode].jobId;
  const lastScanFingerprint = modeState[mode].scanFingerprint;
  const currentFingerprint = useMemo(
    () => buildScanFingerprint(mode, target, zipFile, scanOpts),
    [mode, target, zipFile, scanOpts]
  );

  const needsNewScan =
    forceRescanRef.current || !lastScanFingerprint || currentFingerprint !== lastScanFingerprint;
  const canRunScan = designCheck.canRun && needsNewScan && !busy && !exportBusy;
  const canExport = Boolean(result && !busy && !exportBusy);
  const canForceRescan = designCheck.canRun && !needsNewScan && !busy && !exportBusy;

  function appendScanOptions(fd: FormData) {
    fd.append("try_java_build", tryJavaBuild ? "true" : "false");
    fd.append("try_eslint_zip", tryEslintZip ? "true" : "false");
    fd.append("use_prebuilt_classes", usePrebuiltClasses ? "true" : "false");
    if (pmdRulesets.trim()) fd.append("pmd_rulesets", pmdRulesets.trim());
    if (excludePaths.trim()) fd.append("exclude_paths", excludePaths.trim());
    fd.append("spotbugs_effort", spotbugsEffort);
    fd.append("spotbugs_threshold", spotbugsThreshold);
    fd.append("progress", "true");
  }

  useEffect(() => {
    const prefs = loadSourceScanPrefs();
    setMode(prefs.mode);
    setTarget(prefs.target);
    setTryJavaBuild(prefs.tryJavaBuild);
    setTryEslintZip(prefs.tryEslintZip);
    setUsePrebuiltClasses(prefs.usePrebuiltClasses);
    setPmdRulesets(prefs.pmdRulesets);
    setExcludePaths(prefs.excludePaths);
    setSpotbugsEffort(prefs.spotbugsEffort);
    setSpotbugsThreshold(prefs.spotbugsThreshold);
    setShowAdvanced(prefs.showAdvanced);
    prefsLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!prefsLoaded.current) return;
    saveSourceScanPrefs({
      mode,
      target,
      tryJavaBuild,
      tryEslintZip,
      usePrebuiltClasses,
      pmdRulesets,
      excludePaths,
      spotbugsEffort,
      spotbugsThreshold,
      showAdvanced,
    });
  }, [
    mode,
    target,
    tryJavaBuild,
    tryEslintZip,
    usePrebuiltClasses,
    pmdRulesets,
    excludePaths,
    spotbugsEffort,
    spotbugsThreshold,
    showAdvanced,
  ]);

  useEffect(() => {
    setUseLocalScan(isLocalScanEnabled());
    setLocalApiUrl(getLocalScanApiBase());
  }, []);

  const loadScanEnvironment = useCallback(async () => {
    setEnvLoadError("");
    try {
      const [tRes, eRes, detailRes, hRes, gRes] = await Promise.all([
        fetchSourceScan(useLocalScan, "v1/source-scan/targets", undefined, API_BASE),
        fetchSourceScan(useLocalScan, "v1/source-scan/environment", undefined, API_BASE),
        useLocalScan
          ? fetchSourceScan(true, "health/detail", undefined, API_BASE)
          : fetch(`${API_BASE}/health/detail`),
        fetchSourceScan(useLocalScan, "v1/source-scan/history?limit=15", undefined, API_BASE),
        fetchSourceScan(useLocalScan, "v1/source-scan/fix-guides", undefined, API_BASE),
      ]);
      const tj = await readJsonResponse(tRes);
      if (tRes.ok && Array.isArray(tj.targets)) setTargets(tj.targets as PortalTarget[]);

      let env: EnvStatus | null = null;
      if (eRes.ok) {
        env = (await readJsonResponse(eRes)) as EnvStatus;
      } else if (detailRes.ok) {
        const detail = (await readJsonResponse(detailRes)) as { source_scan?: EnvStatus };
        if (detail.source_scan) {
          env = { ok: true, ...detail.source_scan } as EnvStatus;
          if (!useLocalScan) {
            setEnvLoadError(
              `환경 API HTTP ${eRes.status} — health/detail의 source_scan으로 표시 중. API_ACCESS_KEY 확인.`
            );
          }
        }
      } else {
        setEnvLoadError(
          useLocalScan
            ? `로컬 API 연결 실패 (${localApiUrl}). start-api-source-scan.ps1 실행 및 CORS_ORIGINS(배포 포털 URL) 확인.`
            : `API 연결 실패 (environment HTTP ${eRes.status}). Vercel NEXT_PUBLIC_API_BASE_URL·API_ACCESS_KEY 확인.`
        );
      }
      if (env) setEnvStatus(env);

      if (hRes.ok) {
        const hj = await readJsonResponse(hRes);
        setHistory((hj.history as HistoryItem[]) || []);
      }
      if (gRes.ok) {
        const gj = await readJsonResponse(gRes);
        setFixGuides(normalizeFixGuides(gj));
      }
    } catch (e) {
      setEnvLoadError(wrapFetchError(e).message);
    }
  }, [useLocalScan, localApiUrl]);

  useEffect(() => {
    void loadScanEnvironment();
  }, [loadScanEnvironment]);

  const validate = useCallback(async () => {
    if (mode === "upload" && !zipFile) {
      setDesignCheck(IDLE_UPLOAD_CHECK);
      return;
    }
    if (mode === "upload" && zipFile && shouldUploadDirect(zipFile) && !useLocalScan) {
      const local = clientSideZipValidate(zipFile, false);
      setDesignCheck({
        checking: false,
        canRun: local.ok,
        message: local.message,
        warnings: local.warnings,
      });
      return;
    }
    setDesignCheck({ checking: true, canRun: false, message: "사전 검증 중…" });
    try {
      const fd = new FormData();
      fd.append("mode", mode);
      fd.append("target", mode === "upload" ? "upload" : target);
      if (mode === "upload" && zipFile) fd.append("file", zipFile);
      const res = useLocalScan
        ? await postSourceScanMultipart(true, "v1/source-scan/validate", fd, API_BASE)
        : await postMultipart("v1/source-scan/validate", fd, zipFile);
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
        message: String(j.message || (j.can_run ? "진단 가능" : "진단 불가")),
        warnings: Array.isArray(j.warnings) ? (j.warnings as string[]) : [],
      });
    } catch (e) {
      setDesignCheck({
        checking: false,
        canRun: false,
        message: wrapFetchError(e).message,
      });
    }
  }, [mode, target, zipFile, useLocalScan]);

  validateRef.current = validate;

  useEffect(() => {
    if (validateTimer.current) window.clearTimeout(validateTimer.current);
    validateTimer.current = window.setTimeout(() => void validateRef.current(), 300);
    return () => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
    };
  }, [validateWatchKey]);

  useEffect(() => {
    if (mode === "upload" && !zipFile) {
      setDesignCheck(IDLE_UPLOAD_CHECK);
    } else if (mode === "portal") {
      setDesignCheck((prev) =>
        prev.message === IDLE_UPLOAD_CHECK.message ? IDLE_PORTAL_CHECK : prev
      );
    }
  }, [mode, zipFile]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, []);

  async function loadRules() {
    if (rulesPmd.length) {
      setShowRules(true);
      return;
    }
    const res = await fetch(`${API_BASE}/v1/source-scan/rules`);
    const j = await res.json();
    if (res.ok) {
      setRulesPmd(j.pmd || []);
      setRulesFsb(j.findsecbugs || []);
      setShowRules(true);
    }
  }

  async function pollJob(jobId: string, localScan: boolean): Promise<ScanResult | null> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const res = await fetchSourceScan(localScan, `v1/source-scan/jobs/${jobId}`, undefined, API_BASE);
          const j = await readJsonResponse(res);
          if (!res.ok) throw new Error(String(j.detail || "진행 상태 조회 실패"));
          setScanProgress({
            job_id: jobId,
            status: String(j.status || ""),
            pct: Number(j.pct ?? 0),
            message: String(j.message || ""),
            queue_position: j.queue_position as number | undefined,
            steps: (j.steps as ScanStep[]) || [],
            error: j.error as string | undefined,
          });
          if (j.status === "done") {
            if (pollTimer.current) window.clearInterval(pollTimer.current);
            resolve(j.result as ScanResult);
          } else if (j.status === "error" || j.status === "cancelled") {
            if (pollTimer.current) window.clearInterval(pollTimer.current);
            reject(new Error(String(j.error || j.message || "진단 실패")));
          }
        } catch (e) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          reject(e);
        }
      };
      void poll();
      pollTimer.current = window.setInterval(() => void poll(), 450);
    });
  }

  async function cancelScan() {
    if (!scanProgress?.job_id) return;
    try {
      await fetchSourceScan(
        useLocalScan,
        `v1/source-scan/jobs/${scanProgress.job_id}/cancel`,
        { method: "POST" },
        API_BASE
      );
      setMsg("진단 취소 요청됨");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    }
  }

  async function exportReport(
    format: "xlsx" | "html" | "zip" | "sarif" | "cover",
    action: "open" | "download" = "download"
  ) {
    if (!result) {
      setMsg("먼저 진단을 실행하세요.");
      return;
    }
    setExportBusy(true);
    setMsg("");
    try {
      let ex: Response | null = null;
      if (lastJobId) {
        ex = await fetch(`${API_BASE}/v1/source-scan/jobs/${lastJobId}/export?format=${format}`);
      }
      if (!ex?.ok) {
        ex = await fetch(`${API_BASE}/v1/source-scan/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format, payload: result }),
        });
      }
      if (!ex.ok) {
        const ej = await ex.json().catch(() => ({}));
        throw new Error(ej.detail || "보고서 생성 실패");
      }
      const blob = await ex.blob();
      const cd = ex.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const fallback =
        format === "sarif"
          ? "source_scan.sarif.json"
          : format === "cover"
            ? "source_scan_cover.html"
            : format === "html"
              ? "source_scan.html"
              : `source_scan.${format}`;
      const filename = m?.[1] || fallback;
      if ((format === "html" || format === "cover") && action === "open") {
        openHtmlBlob(blob);
        setMsg(`${format === "cover" ? "표지" : "HTML"} 보고서를 새 탭에서 열었습니다. 저장은 「HTML 저장」 또는 Ctrl+S`);
      } else {
        downloadBlob(blob, filename);
        setMsg(`${format === "html" ? "HTML" : format === "cover" ? "표지 HTML" : format.toUpperCase()} 파일 저장 완료`);
      }
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setExportBusy(false);
    }
  }

  async function loadHistoryRecord(jobId: string, recordMode?: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/v1/source-scan/history/${jobId}`);
      const j = await res.json();
      if (!res.ok || !j.payload) {
        throw new Error(j.detail || `이력 불러오기 실패 (HTTP ${res.status})`);
      }
      const payload = j.payload as ScanResult;
      const scanMode =
        (recordMode as "portal" | "upload") || (payload.mode as "portal" | "upload") || mode;
      if (scanMode === "portal" || scanMode === "upload") {
        setMode(scanMode);
        setModeState((prev) => ({
          ...prev,
          [scanMode]: {
            result: { ...payload, job_id: jobId, ok: true },
            jobId,
            scanFingerprint: null,
          },
        }));
        setTab("all");
        setMsg(
          `이력 불러옴 — ${payload.findings?.length ?? 0}건 (${payload.scanned_at?.slice(0, 19) || ""})`
        );
      }
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  async function runScan(force = false) {
    if (force) forceRescanRef.current = true;
    setBusy(true);
    setMsg("");
    setScanProgress({
      job_id: "",
      status: "running",
      pct: 0,
      message: mode === "upload" ? (useLocalScan ? "로컬 API로 ZIP 전송 중…" : "ZIP 업로드 중…") : "진단 요청 전송 중…",
      steps: [
        { id: "prepare", label: "준비", status: "running", detail: "" },
        { id: "finalize", label: "결과 정리", status: "pending", detail: "" },
      ],
    });
    try {
      const fd = new FormData();
      fd.append("mode", mode);
      fd.append("target", mode === "upload" ? "upload" : target);
      fd.append("format", "json");
      appendScanOptions(fd);

      if (mode === "upload" && zipFile && shouldUploadDirect(zipFile) && !useLocalScan) {
        setScanProgress((prev) =>
          prev
            ? { ...prev, message: `Render로 ZIP 업로드 중… (${(zipFile.size / (1024 * 1024)).toFixed(1)}MB)` }
            : prev
        );
        const staged = await stageLargeZip(zipFile);
        fd.append("staging_id", staged.staging_id);
        setScanProgress((prev) =>
          prev ? { ...prev, message: "진단 작업 시작 요청 중…" } : prev
        );
        const res = await fetch(`${API_BASE}/v1/source-scan/run`, { method: "POST", body: fd });
        const start = (await readJsonResponse(res)) as {
          async?: boolean;
          job_id?: string;
          detail?: string;
          steps?: ScanStep[];
        };
        if (!res.ok) throw new Error(String(start.detail || `진단 실패 (HTTP ${res.status})`));
        if (!start.async || !start.job_id) {
          throw new Error("진행률 API 응답 없음 — Render·Vercel 재배포 후 다시 시도하세요.");
        }
        setScanProgress({
          job_id: start.job_id,
          status: "running",
          pct: 0,
          message: "진단 시작…",
          steps: start.steps || [],
        });
        const scanResult = await pollJob(start.job_id, false);
        if (!scanResult) throw new Error("진단 결과 없음");
        forceRescanRef.current = false;
        setModeState((prev) => ({
          ...prev,
          [mode]: {
            result: scanResult,
            jobId: start.job_id!,
            scanFingerprint: currentFingerprint,
          },
        }));
        setTab("all");
        setMsg(
          `진단 완료 — ${scanResult.findings.length}건 · 미흡 ${scanResult.stats?.fail ?? 0} · 미실행 ${scanResult.stats?.not_scanned ?? 0}`
        );
        const hRes = await fetchSourceScan(false, "v1/source-scan/history?limit=15", undefined, API_BASE);
        if (hRes.ok) {
          const hj = await readJsonResponse(hRes);
          setHistory((hj.history as HistoryItem[]) || []);
        }
        window.setTimeout(() => setScanProgress(null), 800);
        return;
      }

      if (mode === "upload" && zipFile) fd.append("file", zipFile);
      const res = useLocalScan
        ? await postSourceScanMultipart(true, "v1/source-scan/run", fd, API_BASE)
        : await postMultipart("v1/source-scan/run", fd, zipFile);
      const start = (await readJsonResponse(res)) as {
        async?: boolean;
        job_id?: string;
        detail?: string;
        steps?: ScanStep[];
      };
      if (!res.ok) throw new Error(String(start.detail || `진단 실패 (HTTP ${res.status})`));
      if (!start.async || !start.job_id) throw new Error("진행률 API 응답 없음");

      setScanProgress({
        job_id: start.job_id,
        status: "running",
        pct: 0,
        message: "진단 시작…",
        steps: start.steps || [],
      });

      const scanResult = await pollJob(start.job_id, useLocalScan);
      if (!scanResult) throw new Error("진단 결과 없음");

      forceRescanRef.current = false;
      setModeState((prev) => ({
        ...prev,
        [mode]: {
          result: scanResult,
          jobId: start.job_id!,
          scanFingerprint: currentFingerprint,
        },
      }));
      setTab("all");
      setMsg(
        `진단 완료 — ${scanResult.findings.length}건 · 미흡 ${scanResult.stats?.fail ?? 0} · 미실행 ${scanResult.stats?.not_scanned ?? 0}`
      );
      const hRes = await fetch(`${API_BASE}/v1/source-scan/history?limit=15`);
      if (hRes.ok) {
        const hj = await hRes.json();
        setHistory(hj.history || []);
      }
      window.setTimeout(() => setScanProgress(null), 800);
    } catch (e) {
      forceRescanRef.current = false;
      setMsg(wrapFetchError(e).message);
      setScanProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!result) return [] as Finding[];
    let list = result.findings;
    if (tab === "fsb_direct") list = list.filter((f) => f.rule_set === "findsecbugs");
    else if (tab === "pmd_direct") list = list.filter((f) => f.rule_set === "pmd");
    else if (tab === "analog") list = list.filter((f) => f.rule_set === "analog");
    else if (tab === "not_scanned") list = list.filter((f) => f.status === "not_scanned");
    else if (tab === "severity_high") list = list.filter((f) => f.severity === "high");
    else if (tab === "severity_medium") list = list.filter((f) => f.severity === "medium");
    else if (tab === "severity_low") list = list.filter((f) => f.severity === "low");
    else if (tab === "diff") list = (result.diff?.new || []) as Finding[];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.location.toLowerCase().includes(q) ||
        f.rule_id.toLowerCase().includes(q) ||
        f.message.toLowerCase().includes(q) ||
        (f.fix || "").toLowerCase().includes(q)
    );
  }, [result, tab, query]);

  const filteredRules = useMemo(() => {
    const q = rulesQuery.trim().toLowerCase();
    const all = [
      ...rulesPmd.map((r) => ({ ...r, ruleset: "PMD" })),
      ...rulesFsb.map((r) => ({ ...r, ruleset: "FindSecBugs" })),
    ];
    if (!q) return all.slice(0, 200);
    return all
      .filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          (r.name || "").toLowerCase().includes(q) ||
          (r.category || "").toLowerCase().includes(q)
      )
      .slice(0, 200);
  }, [rulesPmd, rulesFsb, rulesQuery]);

  const exportButtons = (
    <div className="source-scan-export-block">
      <p className="export-title">보고서 내보내기</p>
      <p className="export-hint">
        HTML 보기 = 새 탭 미리보기 · HTML 저장 = .html 파일 다운로드 · ZIP = html+xlsx+sarif+표지 묶음
      </p>
      <div className="btn-row">
        <button type="button" className="btn ghost" disabled={!canExport} onClick={() => void exportReport("xlsx")}>
          Excel
        </button>
        <button type="button" className="btn ghost" disabled={!canExport} onClick={() => void exportReport("html", "open")}>
          HTML 보기
        </button>
        <button type="button" className="btn ghost" disabled={!canExport} onClick={() => void exportReport("html", "download")}>
          HTML 저장
        </button>
        <button type="button" className="btn ghost" disabled={!canExport} onClick={() => void exportReport("cover", "open")}>
          표지
        </button>
        <button type="button" className="btn ghost" disabled={!canExport} onClick={() => void exportReport("zip")}>
          ZIP
        </button>
        <button type="button" className="btn ghost" disabled={!canExport} onClick={() => void exportReport("sarif")}>
          SARIF
        </button>
      </div>
    </div>
  );

  return (
    <main>
      <PortalNav />
      <section className="hero">
        <h1>소스코드·보안 진단</h1>
        <p>PMD · FindSecBugs · Bandit/ESLint Analog — 포털 앱 또는 ZIP 업로드 소스 점검</p>
      </section>

      {envStatus ? (
        <section className="panel">
          <h2>도구·환경 상태</h2>
          {envLoadError ? <p className="msg err">{envLoadError}</p> : null}
          {!envStatus.pmd && !envStatus.spotbugs ? (
            <p className="msg err">
              PMD·SpotBugs 미설정 — Vercel <code>NEXT_PUBLIC_API_BASE_URL</code>이 Docker Render URL(예:{" "}
              <code>https://myplatform-9ukz.onrender.com</code>)인지 확인하세요. Python-only Render에는 Java
              도구가 없습니다.
            </p>
          ) : null}
          <ul className="source-scan-env-grid">
            <li>
              <strong>revision</strong> {String(envStatus.revision || "-")}
            </li>
            <li>
              <strong>JAVA_HOME</strong> {String(envStatus.java_home || "(미설정)")}
            </li>
            <li>
              <strong>mvn</strong> {envStatus.mvn_ok ? "✓" : "✕"}{" "}
              <span>{String(envStatus.mvn_path || "-")}</span>
            </li>
            <li>
              <strong>PMD</strong> {envStatus.pmd ? "✓" : "✕"} · <strong>SpotBugs</strong>{" "}
              {envStatus.spotbugs ? "✓" : "✕"}
            </li>
            <li>
              <strong>plugin</strong> {String(envStatus.findsecbugs_plugin || "(미설정)")}
            </li>
            {envStatus.queue && typeof envStatus.queue === "object" ? (
              <li>
                <strong>대기열</strong> {String((envStatus.queue as { queue_length?: number }).queue_length ?? 0)}건
              </li>
            ) : null}
          </ul>
          {envStatus.jdk_hint ? <p className="hint">{String(envStatus.jdk_hint)}</p> : null}
        </section>
      ) : null}

      <section className="panel">
        <h2>진단 설정</h2>
        <div className="tabs" role="tablist" style={{ marginBottom: "1rem" }}>
          <button type="button" className={`tab ${mode === "upload" ? "active" : ""}`} onClick={() => setMode("upload")}>
            ZIP 업로드
          </button>
          <button type="button" className={`tab ${mode === "portal" ? "active" : ""}`} onClick={() => setMode("portal")}>
            포털 앱
          </button>
        </div>
        {mode === "portal" ? (
          <label>
            진단 대상
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="file-field">
              소스 ZIP
              <input type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="source-scan-local-panel" style={{ marginTop: "0.75rem" }}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={useLocalScan}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setUseLocalScan(on);
                    setLocalScanEnabled(on);
                    void loadScanEnvironment();
                  }}
                />
                <span>내 PC에서 검사 (PMD/SpotBugs/ZIP — 로컬 API, 웹표준과 설정 공유)</span>
              </label>
              {useLocalScan ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <label>
                    로컬 API URL
                    <input
                      value={localApiUrl}
                      onChange={(e) => setLocalApiUrl(e.target.value)}
                      onBlur={() => {
                        setLocalScanApiBase(localApiUrl);
                        void loadScanEnvironment();
                      }}
                      placeholder={DEFAULT_LOCAL_SCAN_API}
                      style={{ width: "100%", maxWidth: "28rem" }}
                    />
                  </label>
                  <p className="hint" style={{ marginTop: "0.35rem" }}>
                    PowerShell: <code>scripts\start-local-scan.bat</code> 또는{" "}
                    <code>.\scripts\start-api-source-scan.ps1</code> 실행 후 진단하세요. 배포 포털(Vercel)에서
                    쓸 때는 로컬 API에 <code>CORS_ORIGINS=https://your-app.vercel.app</code> 를 추가하세요.
                  </p>
                </div>
              ) : (
                <p className="hint" style={{ marginTop: "0.35rem" }}>
                  4MB 초과 ZIP은 Render로 업로드됩니다. 502 오류 시 위 옵션(로컬 검사)을 사용하세요.
                </p>
              )}
            </div>
          </>
        )}
        <ul className="source-scan-option-list">
          <li>
            <label className="check-row">
              <input type="checkbox" checked={tryJavaBuild} onChange={(e) => setTryJavaBuild(e.target.checked)} />
              <span>Java Maven/Gradle 빌드 후 FindSecBugs</span>
            </label>
            <p className="source-scan-option-desc">
              컴파일된 .class가 필요합니다. ZIP의 target/classes가 소스와 맞지 않으면 FindSecBugs 0건일 수 있습니다.
            </p>
          </li>
          {mode === "upload" ? (
            <li>
              <label className="check-row">
                <input type="checkbox" checked={tryEslintZip} onChange={(e) => setTryEslintZip(e.target.checked)} />
                <span>ZIP 내 TS/JS ESLint 실행</span>
              </label>
              <p className="source-scan-option-desc">Java-only ZIP이면 체크해도 효과 없습니다.</p>
            </li>
          ) : null}
          <li>
            <label className="check-row">
              <input
                type="checkbox"
                checked={usePrebuiltClasses}
                onChange={(e) => setUsePrebuiltClasses(e.target.checked)}
              />
              <span>ZIP에 target/classes 있으면 컴파일 생략</span>
            </label>
            <p className="source-scan-option-desc">빌드 산출물이 ZIP에 포함된 경우에만 권장합니다.</p>
          </li>
        </ul>
        <button type="button" className="btn ghost" style={{ marginTop: "0.75rem" }} onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "고급 옵션 숨기기" : "고급 옵션"}
        </button>
        {showAdvanced ? (
          <div className="source-scan-advanced">
            <p className="source-scan-advanced-intro">
              입력 칸을 <strong>비워 두면</strong> 아래 기본값이 적용됩니다. 회색 placeholder는 예시일 뿐 전송되지
              않으며, 고급 옵션만 펼치는 것으로 설정이 바뀌지 않습니다.
            </p>
            <dl className="source-scan-defaults">
              <dt>기본 PMD rulesets</dt>
              <dd>
                <code>{DEFAULT_PMD_RULESETS_DISPLAY}</code>
              </dd>
              <dt>기본 제외 경로</dt>
              <dd>
                <code>{DEFAULT_EXCLUDE_DISPLAY}</code>
              </dd>
            </dl>
            <div className="source-scan-advanced-grid">
              <div className="source-scan-field">
                <label>
                  <span>
                    PMD rulesets <span className="field-label-sub">(선택)</span>
                  </span>
                  <input
                    value={pmdRulesets}
                    onChange={(e) => setPmdRulesets(e.target.value)}
                    placeholder="비우면 기본값 사용"
                  />
                </label>
                <p className="source-scan-field-help">
                  <code>category/java/….xml</code> 경로를 쉼표로 구분합니다.
                </p>
              </div>
              <div className="source-scan-field">
                <label>
                  <span>
                    제외 경로 glob <span className="field-label-sub">(선택)</span>
                  </span>
                  <input
                    value={excludePaths}
                    onChange={(e) => setExcludePaths(e.target.value)}
                    placeholder="비우면 기본값 사용"
                  />
                </label>
                <p className="source-scan-field-help">test · target · node_modules 등 제외</p>
              </div>
              <div className="source-scan-field">
                <label>
                  SpotBugs effort
                  <select value={spotbugsEffort} onChange={(e) => setSpotbugsEffort(e.target.value)}>
                    <option value="min">min (빠름)</option>
                    <option value="default">default</option>
                    <option value="max">max (정밀, 권장)</option>
                  </select>
                </label>
              </div>
              <div className="source-scan-field">
                <label>
                  SpotBugs threshold
                  <select value={spotbugsThreshold} onChange={(e) => setSpotbugsThreshold(e.target.value)}>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low (더 많이 탐지, 권장)</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        ) : null}
        <p className={`msg ${designCheck.canRun ? "ok" : designCheck.checking ? "" : "err"}`}>
          {designCheck.message}
          {!needsNewScan && designCheck.canRun && result ? " · 현재 설정으로 진단 완료됨" : ""}
        </p>
        {designCheck.warnings?.map((w) => (
          <p key={w} className="hint">
            ⚠ {w}
          </p>
        ))}
        <div className="source-scan-actions">
          <div className="source-scan-actions-primary">
            <button type="button" className="btn" disabled={!canRunScan} onClick={() => void runScan(false)}>
              진단 실행
            </button>
            <button type="button" className="btn ghost" disabled={!canForceRescan} onClick={() => void runScan(true)}>
              같은 설정 재진단
            </button>
            <button type="button" className="btn ghost" disabled={!scanProgress?.job_id} onClick={() => void cancelScan()}>
              취소
            </button>
            <button type="button" className="btn ghost" onClick={() => void loadRules()}>
              규칙 카탈로그
            </button>
          </div>
          {exportButtons}
        </div>
        {scanProgress ? (
          <div className="run-progress source-scan-progress">
            <div className="progress-bar" role="progressbar" aria-valuenow={Math.round(scanProgress.pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${scanProgress.pct}%` }} />
            </div>
            <p className="hint">
              {Math.round(scanProgress.pct)}% · {scanProgress.message}
              {scanProgress.queue_position ? ` · 대기 ${scanProgress.queue_position}번째` : ""}
            </p>
            <ol className="scan-step-list">
              {scanProgress.steps.map((step) => (
                <li key={step.id} className={`scan-step scan-step-${step.status}`} aria-current={step.status === "running" ? "step" : undefined}>
                  <span className="scan-step-icon">{STEP_STATUS_ICON[step.status] || "○"}</span>
                  <span className="scan-step-label">{step.label}</span>
                  {step.detail ? <span className="scan-step-detail">{step.detail}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {msg ? <p className={`msg ${msg.includes("완료") ? "ok" : "err"}`}>{msg}</p> : null}
      </section>

      {history.length ? (
        <section className="panel">
          <h2>진단 이력</h2>
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
                    <td>{h.scanned_at?.slice(0, 19) || "-"}</td>
                    <td>{h.target_name}</td>
                    <td>{h.mode}</td>
                    <td>{h.fail ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showRules ? (
        <section className="panel">
          <h2>규칙 카탈로그</h2>
          <label className="search-row">
            검색
            <input value={rulesQuery} onChange={(e) => setRulesQuery(e.target.value)} placeholder="규칙 ID, 이름, 분류" />
          </label>
          <div className="table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th>룰셋</th>
                  <th>ID</th>
                  <th>분류</th>
                  <th>참조</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((r) => (
                  <tr key={`${r.ruleset}-${r.id}`}>
                    <td>{r.ruleset}</td>
                    <td>{r.id}</td>
                    <td>{r.category || ""}</td>
                    <td>
                      {r.reference_url ? (
                        <a href={r.reference_url} target="_blank" rel="noreferrer">
                          문서
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
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
            {result.target_name} · {result.scanned_at}
            {result.languages?.length ? ` · 언어: ${result.languages.join(", ")}` : ""}
          </p>
          {result.jdk_hint ? <p className="hint">{result.jdk_hint}</p> : null}
          {result.warnings?.map((w) => (
            <p key={w} className="hint">
              ⚠ {w}
            </p>
          ))}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">전체</span>
              <strong>{result.stats?.total ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">미흡</span>
              <strong>{result.stats?.fail ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">미실행</span>
              <strong>{result.stats?.not_scanned ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">높음</span>
              <strong>{result.stats?.by_severity?.high ?? 0}</strong>
            </div>
          </div>
          {result.stats?.by_language ? (
            <p className="hint">
              언어별:{" "}
              {Object.entries(result.stats.by_language)
                .map(([k, v]) => `${k} ${v}`)
                .join(" · ")}
            </p>
          ) : null}
          {result.diff ? (
            <p className="hint">
              이전 대비 — 신규 {result.diff.new_count ?? 0} · 해소 {result.diff.resolved_count ?? 0} · 유지{" "}
              {result.diff.unchanged_count ?? 0}
            </p>
          ) : null}
          {result.analog_coverage && (result.analog_coverage.unmapped_count ?? 0) > 0 ? (
            <p className="hint">
              Analog 미매핑 규칙 {result.analog_coverage.unmapped_count}건 (샘플 최대 50건 Excel 참고)
            </p>
          ) : null}
          {result.scanners ? (
            <ul className="hint" style={{ margin: "0.5rem 0", paddingLeft: "1.2rem" }}>
              {Object.entries(result.scanners).map(([k, v]) => (
                <li key={k}>{scannerLine(v, k)}</li>
              ))}
            </ul>
          ) : null}
          <div className="btn-row">{exportButtons}</div>
          <div className="tabs" role="tablist">
            {(
              [
                ["all", "전체"],
                ["fsb_direct", "FindSecBugs(직접)"],
                ["pmd_direct", "PMD(직접)"],
                ["analog", "Analog"],
                ["severity_high", "심각도↑"],
                ["severity_medium", "심각도中"],
                ["severity_low", "심각도↓"],
                ["diff", "Diff 신규"],
                ["not_scanned", "미실행"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <label className="search-row">
            검색
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="위치, 규칙, 내용, 개선안" />
          </label>
          <div className="table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th>위치</th>
                  <th>룰셋</th>
                  <th>기준ID</th>
                  <th>심각도</th>
                  <th>상태</th>
                  <th>내용</th>
                  <th>개선안</th>
                  <th>참조</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, PAGE_SIZE).map((f) => (
                  <tr key={f.id}>
                    <td>{f.location}</td>
                    <td>{RULESET_LABEL[f.rule_set] || f.rule_set}</td>
                    <td>{f.rule_id}</td>
                    <td>{SEV_LABEL[f.severity] || f.severity}</td>
                    <td>{STATUS_LABEL[f.status] || f.status}</td>
                    <td>{f.message}</td>
                    <td>
                      <FindingFixCell finding={f} guides={fixGuides} />
                    </td>
                    <td>
                      {f.reference_url ? (
                        <a href={f.reference_url} target="_blank" rel="noreferrer">
                          링크
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > PAGE_SIZE ? (
            <p className="hint">상위 {PAGE_SIZE}건만 표시 — 전체는 Excel/ZIP/SARIF 참고</p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
