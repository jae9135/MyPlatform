"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalNav } from "@/lib/PortalNav";
import { API_BASE } from "@/lib/apiBase";
import {
  clientSideZipValidate,
  readJsonResponse,
  shouldUploadDirect,
} from "@/lib/formUpload";
import {
  fetchScanApi,
  isLocalPortalHost,
  postScanMultipart,
  wrapScanFetchError,
} from "@/lib/localScanApi";
import {
  CloudLargeZipHint,
} from "@/components/LocalScanSettings";
import {
  type FixGuideEntry,
  resolveFindingFix,
} from "@/lib/webQualityFix";
import { formatUtcIsoToKst } from "@/lib/formatDateTime";
import { buildWqPrefs, loadWqPrefs, saveWqPrefs } from "@/lib/wqPrefs";
import {
  diffScenarioLists,
  diffSummary,
  saveScenarioBackup,
  SCENARIO_BACKUP_STORAGE_KEY,
  type ScenarioDiffRow,
} from "@/lib/webQualityScenarioDiff";
import {
  clearWqExternalBrowserSession,
  clearWqIpmsBrowserSession,
  clearWqJavaBrowserSession,
  loadWqExternalBrowserSession,
  loadWqIpmsBrowserSession,
  loadWqJavaBrowserSession,
  saveWqExternalBrowserSession,
  saveWqIpmsBrowserSession,
  saveWqJavaBrowserSession,
} from "@/lib/wqSessionPersist";
import { openWebQualityHistoryPopout } from "@/lib/webQualityPopout";
import {
  WQ_CATEGORY_LABEL,
  WQ_STATUS_LABEL,
  WQ_STATUS_PRESETS,
  buildExportScope,
  buildScreenIndexMap,
  filterCapturesForFindings,
  filterFindingsByScope,
  findingMatchesSearch,
  findingMatchesStatusFilter,
  isScenarioRunnable,
  resolveFindingRefLinks,
  resolveFindingScreenshot,
  resolveFindingStateId,
  resolveReviewLocations,
  tabToCategory,
  type ResultCategory,
} from "@/lib/webQualityFindingFilter";
import { setRefLinksCatalog, type RefLinksCatalog } from "@/lib/webQualityRefLinks";

const PAGE_SIZE = 80;
const IPMS_DEFAULT_URL = "http://14.35.194.178:12000/ipms.online/";

type TabId =
  | "all"
  | "standard"
  | "compat"
  | "a11y"
  | "uiux"
  | "captures"
  | "not_scanned"
  | "manual"
  | "diff";

const RESULT_TAB_LABEL: Record<TabId, string> = {
  all: "전체",
  standard: "웹표준",
  compat: "웹호환성",
  a11y: "웹접근성",
  uiux: "UI·UX(KRDS)",
  captures: "화면캡처",
  diff: "Diff 신규",
  not_scanned: "미실행",
  manual: "수동/해당없음",
};

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
  ref_url?: string;
  ref_anchor?: string;
  ref_text?: string;
  ref_fallback_url?: string;
  kwcag_id?: string;
  guideline_url?: string;
  krds_ref?: string;
  rule_title?: string;
  axe_id?: string;
  detail?: string;
  state_label?: string;
  state_description?: string;
  screenshot_id?: string;
  screenshot_url?: string;
  screenshot_filename?: string;
  state_id?: string;
  review_state_ids?: string[];
  review_hint?: string;
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

type SessionScope = "ipms" | "external" | "java-upload" | null;

function normalizeWqPageUrl(url: string): string {
  return url.trim().replace(/\/+$/, "") || "/";
}

function isStoredIpmsUrl(url: string): boolean {
  const u = normalizeWqPageUrl(url);
  const ipms = normalizeWqPageUrl(IPMS_DEFAULT_URL);
  return u === ipms || u.endsWith("/ipms.online");
}

type ScanMode = "ipms-online" | "external" | "java-upload";

type WqJobProgress = {
  job_id: string;
  status: string;
  pct: number;
  message: string;
  step_label?: string;
  error?: string;
};

const IPMS_FULL_ACCESS = "public,auth";

const SCAN_MODE_LABEL: Record<ScanMode, string> = {
  "ipms-online": "IPMS(화면)",
  "java-upload": "정적(소스)",
  external: "외부 URL(화면)",
};

function buildAccessParam(includePublic: boolean, includeAuth: boolean): string {
  const tiers: string[] = [];
  if (includePublic) tiers.push("public");
  if (includeAuth) tiers.push("auth");
  return tiers.join(",");
}

function filterCandidatesByAccess(
  list: ScenarioCandidate[],
  accessPublic: boolean,
  accessAuth: boolean,
): ScenarioCandidate[] {
  if (!accessPublic && !accessAuth) return [];
  const tiers = new Set<string>();
  if (accessPublic) tiers.add("public");
  if (accessAuth) tiers.add("auth");
  return list.filter((c) => tiers.has((c.access || "public").toLowerCase()));
}

function filterScenarioPayloadByAccess(
  payload: ScenarioPayload,
  accessPublic: boolean,
  accessAuth: boolean,
): ScenarioPayload {
  const filtered = filterCandidatesByAccess(
    candidatesFromPayload(payload),
    accessPublic,
    accessAuth,
  );
  return { ...payload, candidates: filtered };
}

function sameStringList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function formatScenarioDescription(desc: string): string {
  let text = desc.trim();
  text = text.replace(/\s·\s*.+$/, "").trim();
  if (text.includes(" — ")) {
    text = text.split(" — ")[0]?.trim() || text;
  }
  return text;
}

function skipAuthGateForMode(mode: ScanMode): boolean {
  return mode === "java-upload";
}

function buildDefaultScenarioIds(
  list: ScenarioCandidate[],
  hasSession: boolean,
  mode?: ScanMode,
): string[] {
  const skipAuth = mode ? skipAuthGateForMode(mode) : false;
  return list
    .filter((c) => {
      if (!c.selectable) return false;
      if (c.recommended === false) return false;
      if (!skipAuth && (c.access || "public").toLowerCase() === "auth") return hasSession;
      return true;
    })
    .map((c) => c.state_id);
}

function defaultScenarioIdsFromPayload(
  j: Record<string, unknown>,
  list: ScenarioCandidate[],
  hasSession: boolean,
  mode?: ScanMode,
): string[] {
  if (mode === "external" || mode === "ipms-online") {
    return buildDefaultScenarioIds(list, hasSession, mode);
  }
  const fromApi = Array.isArray(j.defaults_selected)
    ? (j.defaults_selected as string[])
    : null;
  const base = fromApi ?? buildDefaultScenarioIds(list, hasSession, mode);
  return filterSelectableScenarioIds(base, list, hasSession, mode);
}

function filterSelectableScenarioIds(
  ids: string[],
  scenarios: ScenarioCandidate[],
  hasSession: boolean,
  mode?: ScanMode,
): string[] {
  const skipAuth = mode ? skipAuthGateForMode(mode) : false;
  return ids.filter((id) => {
    const c = scenarios.find((s) => s.state_id === id);
    if (!c?.selectable) return false;
    if (!skipAuth && (c.access || "public").toLowerCase() === "auth" && !hasSession) return false;
    return true;
  });
}

function wqHasSessionForMode(
  mode: ScanMode,
  sessions: {
    hasIpmsSession: boolean;
    hasExternalSession: boolean;
    javaSessionReady: boolean;
  },
): boolean {
  if (isIpmsMode(mode)) return sessions.hasIpmsSession;
  if (mode === "java-upload") return sessions.javaSessionReady;
  return sessions.hasExternalSession;
}

function isIpmsMode(mode: ScanMode): boolean {
  return mode === "ipms-online";
}

function isAsyncScanMode(mode: ScanMode): boolean {
  return isIpmsMode(mode) || mode === "external" || mode === "java-upload";
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
  access?: string;
};

type ScenarioPayload = Record<string, unknown> & {
  candidates?: ScenarioCandidate[];
  extractable?: boolean;
  warnings?: string[];
  defaults_selected?: string[];
  static_only_hint?: string;
  file_stats?: { java?: number; views?: number; static_views?: number };
  method?: string;
};

type JavaUploadCache = {
  zipKey: string;
  scenarios: ScenarioCandidate[];
  scenarioLoaded: boolean;
  resolveComplete: boolean;
  extractCount: number;
  statusMsg: string;
  selectedIds: string[];
  lastScenarioPayload: ScenarioPayload | null;
  scenarioWarnings: string[];
  javaStaticHint: string;
  extractable: boolean;
  javaBaseUrl: string;
  javaNeedLogin: boolean;
};

type ExternalScenarioCache = {
  pageUrl: string;
  scenarios: ScenarioCandidate[];
  scenarioLoaded: boolean;
  resolveComplete: boolean;
  selectedIds: string[];
  lastScenarioPayload: ScenarioPayload | null;
  scenarioWarnings: string[];
  extractable: boolean;
  externalSourceApplyMsg: string;
  externalSourceApplyTone: "ok" | "warn" | "err";
  needLogin: boolean;
};

function formatJavaZipExtractLabel(count: number): string {
  return `시나리오 ${count}건 추출`;
}

function isIpmsDirectUrlPreviewError(error: string): boolean {
  return (error || "").includes("IPMS 직접 URL 접근 불가");
}

function formatJavaPreviewResultMessage(
  ok: number,
  fail: number,
  items: { ok?: boolean; error?: string }[],
  topErrors: string,
): { text: string; tone: "ok" | "warn" | "err" } {
  const ipmsDirect = items.some(
    (item) => !item.ok && isIpmsDirectUrlPreviewError(String(item.error || "")),
  );
  const loginIssue = items.some(
    (item) => !item.ok && isLoginPreviewError(String(item.error || "")),
  );
  if (ipmsDirect && !loginIssue) {
    return {
      text:
        `미리보기 — Playwright 화면 열기 ${ok}건 / 불가 ${fail}건. ` +
        "로그인 실패가 아닙니다. IPMS 배포 URL에서는 @GetMapping 직링크 미리보기가 차단됩니다. " +
        "「정적 진단 실행」 또는 「IPMS 온라인」 탭(GNB 메뉴)을 이용하세요.",
      tone: "warn",
    };
  }
  if (!topErrors) {
    return {
      text: fail > 0 ? `미리보기 완료 — 검증 가능 ${ok} / 실패 ${fail}` : `미리보기 완료 — 검증 가능 ${ok} / 실패 ${fail}`,
      tone: fail > 0 ? "err" : "ok",
    };
  }
  return {
    text: `미리보기 일부 실패 — 검증 가능 ${ok} / 실패 ${fail} (${topErrors})`,
    tone: "err",
  };
}

function isLoginPreviewError(error: string): boolean {
  if (isIpmsDirectUrlPreviewError(error)) return false;
  const e = error.toLowerCase();
  return (
    e.includes("401") ||
    e.includes("403") ||
    e.includes("로그인") ||
    e.includes("인증") ||
    e.includes("unauthorized")
  );
}

function isJavaPreviewSessionError(error: string, sessionReady: boolean): boolean {
  if (isIpmsDirectUrlPreviewError(error)) return false;
  if (isLoginPreviewError(error)) return true;
  if (sessionReady) return false;
  const e = error.toLowerCase();
  return e.includes("404") || e.includes("not found");
}

async function validateIpmsSessionJob(jobId: string, baseUrl: string): Promise<boolean> {
  if (!jobId.trim() || !isStoredIpmsUrl(baseUrl)) return true;
  try {
    const q = new URLSearchParams({ base_url: baseUrl.trim() });
    const res = await fetchScanApi(`v1/web-quality/ipms/session/${jobId.trim()}/validate?${q}`);
    const j = (await readJsonResponse(res)) as { ok?: boolean; message?: string };
    return Boolean(res.ok && j.ok);
  } catch {
    return false;
  }
}

function isValidDeployUrl(url: string): boolean {
  const t = url.trim();
  return isHttpUrl(t) && t.replace(/\/+$/, "").length > "http:/".length;
}

function wqSessionMatchesUrl(sessionPageUrl: string, targetUrl: string): boolean {
  if (!sessionPageUrl.trim() || !targetUrl.trim()) return false;
  return normalizeWqPageUrl(sessionPageUrl) === normalizeWqPageUrl(targetUrl);
}

function wqJobSessionReady(
  status: IpmsLoginStatus,
  sessionJobId: string,
  sessionPageUrl: string,
  targetUrl: string,
): boolean {
  return (
    status === "ok" &&
    Boolean(sessionJobId.trim()) &&
    wqSessionMatchesUrl(sessionPageUrl, targetUrl)
  );
}

function loadWqPersistedBrowserSessionForUrl(targetUrl: string) {
  const norm = normalizeWqPageUrl(targetUrl);
  const javaPersisted = loadWqJavaBrowserSession();
  if (javaPersisted && normalizeWqPageUrl(javaPersisted.pageUrl) === norm) {
    return javaPersisted;
  }
  if (isStoredIpmsUrl(targetUrl)) {
    const ipmsPersisted = loadWqIpmsBrowserSession();
    if (ipmsPersisted && normalizeWqPageUrl(ipmsPersisted.pageUrl) === norm) {
      return ipmsPersisted;
    }
  }
  return null;
}

function resolveWqBrowserSessionJobId(
  targetUrl: string,
  opts: {
    sessionJobId: string;
    sessionPageUrl: string;
    javaLoginStatus: IpmsLoginStatus;
    ipmsLoginStatus: IpmsLoginStatus;
    externalLoginStatus: IpmsLoginStatus;
  },
): string {
  const url = targetUrl.trim();
  if (!url) return "";
  const jobId = opts.sessionJobId.trim();
  if (
    jobId &&
    (wqJobSessionReady(opts.javaLoginStatus, jobId, opts.sessionPageUrl, url) ||
      wqJobSessionReady(opts.ipmsLoginStatus, jobId, opts.sessionPageUrl, url) ||
      wqJobSessionReady(opts.externalLoginStatus, jobId, opts.sessionPageUrl, url))
  ) {
    return jobId;
  }
  return "";
}

function javaZipKey(file: File | null | undefined): string {
  if (!file) return "";
  return `${file.name}:${file.size}:${file.lastModified}`;
}

type IpmsScenarioSource = "url" | "zip";

type LoginSessionMode = "browser" | "upload";

const LOGIN_SESSION_NOT_READY = "미로그인시 로그인 시나리오는 선택·진단 불가";

function isBrowserClosedSessionError(msg: string): boolean {
  if (msg.includes("브라우저 창이 닫혔")) return true;
  const lower = msg.toLowerCase();
  return lower.includes("has been closed") || lower.includes("target page, context or browser");
}

function friendlySessionError(msg: string): string {
  if (isBrowserClosedSessionError(msg)) {
    return "브라우저 창이 닫혔습니다. 「로그인 창 띄움」을 다시 시도하세요.";
  }
  return msg;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

const HTTP_URL_REQUIRED_MSG = "URL은 http:// 또는 https:// 로 시작해야 합니다.";

function ipmsSourceLabel(method?: string): string {
  if (method === "o2_spa_zip") return "소스";
  if (method === "legacy_fallback") return "사전 정의";
  return "접속 URL";
}

function formatScenarioSourceLabel(method?: string, count?: number): string {
  const base = ipmsSourceLabel(method);
  return count != null && count >= 0 ? `${base} · ${count}건` : base;
}

type IpmsLoginStatus = "none" | "checking" | "ok" | "fail";

function buildIpmsApplyMessage(
  j: ScenarioPayload,
  count: number,
): { text: string; tone: "ok" | "warn" | "err" } {
  if (j.method === "legacy_fallback") {
    return {
      text: `접속 URL에서 시나리오 추출 실패 — 사전 정의한 시나리오 ${count}건을 표시합니다.`,
      tone: "warn",
    };
  }
  return {
    text: `시나리오 ${count}건 추출 성공`,
    tone: "ok",
  };
}

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

const CATEGORY_LABEL = WQ_CATEGORY_LABEL;

const STATUS_LABEL = WQ_STATUS_LABEL;

const STATUS_FILTER_OPTIONS: { id: keyof typeof WQ_STATUS_PRESETS; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "issues", label: "미흡·검토" },
  { id: "fail", label: "미흡" },
  { id: "review", label: "검토" },
  { id: "pass", label: "통과" },
  { id: "manual", label: "수동·미실행" },
];

function ReviewLocationCell({
  finding,
  screens,
  onJumpCapture,
}: {
  finding: Finding;
  screens: { state_id: string; label: string; scanned?: boolean }[];
  onJumpCapture?: (stateId: string) => void;
}) {
  const text = resolveReviewLocations(finding, screens);
  const ids = finding.review_state_ids || [];
  return (
    <div className="wq-fix-cell">
      <p style={{ margin: 0 }}>{text}</p>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="btn ghost wq-ref-link-btn"
          onClick={() => onJumpCapture?.(id)}
        >
          캡처 보기: {screens.find((s) => s.state_id === id)?.label || id}
        </button>
      ))}
    </div>
  );
}

function WqCheckBadge({ runnable, reason }: { runnable: boolean; reason: string }) {
  return runnable ? (
    <span className="perf-url-badge ok" title={reason}>
      검증 가능
    </span>
  ) : (
    <span className="perf-url-badge skip" title={reason}>
      검증 불가
    </span>
  );
}

function FindingLocationCell({ finding }: { finding: Finding }) {
  const text = finding.location;
  const short = text.length > 56 ? `${text.slice(0, 56)}…` : text;
  return (
    <span className="wq-location-cell" title={text}>
      {short}
    </span>
  );
}

function FindingScreenCell({
  finding,
  screenNo,
  shot,
  onPreview,
  onJumpCapture,
}: {
  finding: Finding;
  screenNo?: number;
  shot: { dataUrl: string; label: string } | null;
  onPreview?: (payload: { dataUrl: string; label: string; screenNo?: number }) => void;
  onJumpCapture?: (stateId: string) => void;
}) {
  const stateId = resolveFindingStateId(finding);
  if (finding.target === "source") return <>—</>;
  if (!stateId && !shot) return <>—</>;
  return (
    <div className="wq-screen-cell">
      {screenNo ? <span className="wq-screen-no">#{screenNo}</span> : null}
      {shot?.dataUrl ? (
        <button
          type="button"
          className="wq-screen-thumb-btn"
          title={`${shot.label || stateId} — 클릭하여 확대`}
          onClick={() =>
            onPreview?.({
              dataUrl: shot.dataUrl,
              label: shot.label || stateId,
              screenNo,
            })
          }
        >
          <img src={shot.dataUrl} alt="" className="wq-screen-thumb" loading="lazy" />
        </button>
      ) : stateId && onJumpCapture ? (
        <button
          type="button"
          className="btn ghost wq-capture-jump-btn"
          onClick={() => onJumpCapture(stateId)}
        >
          캡처
        </button>
      ) : (
        <span className="hint">—</span>
      )}
    </div>
  );
}

function CapturePreviewModal({
  open,
  payload,
  onClose,
}: {
  open: boolean;
  payload: { dataUrl: string; label: string; screenNo?: number } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !payload) return null;
  return (
    <div
      className="wq-capture-preview-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="wq-capture-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="화면 미리보기"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wq-capture-preview-head">
          <h3>
            {payload.screenNo ? `#${payload.screenNo} · ` : ""}
            {payload.label}
          </h3>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="닫기">
            닫기
          </button>
        </header>
        <div className="wq-capture-preview-body">
          <img src={payload.dataUrl} alt={payload.label} />
        </div>
      </div>
    </div>
  );
}

function FindingRefCell({ finding }: { finding: Finding }) {
  const links = resolveFindingRefLinks(finding);
  const primaryUrl = links[0]?.url;
  if (!links.length) {
    return finding.krds_ref ? <span className="hint">{finding.krds_ref}</span> : <>—</>;
  }
  const extraLinks =
    finding.krds_ref && primaryUrl && links[0]?.url === primaryUrl ? links.slice(1) : links;
  return (
    <div className="wq-ref-cell">
      {finding.krds_ref ? (
        primaryUrl ? (
          <a
            href={primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="wq-ref-krds wq-ref-link"
            title="관련 근거 문구로 이동"
          >
            {finding.krds_ref} ↗
          </a>
        ) : (
          <p className="wq-ref-krds">{finding.krds_ref}</p>
        )
      ) : null}
      {extraLinks.map((link) => (
        <a
          key={`${link.label}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`wq-ref-link${link.label.includes("대체") ? " wq-ref-link-fallback" : ""}`}
          title={link.label.includes("대체") ? "상위 목록 페이지로 이동" : "관련 근거 문구로 이동"}
        >
          {link.label} ↗
        </a>
      ))}
    </div>
  );
}

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
    <div className="wq-fix-cell wq-fix-cell-block">
      {text ? <p className="wq-fix-text">{text}</p> : null}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="wq-fix-link">
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
  const [mode, setMode] = useState<ScanMode>("ipms-online");
  const modeRef = useRef<ScanMode>(mode);
  const [pageUrl, setPageUrl] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [ipmsUrl, setIpmsUrl] = useState(IPMS_DEFAULT_URL);
  const [accessPublic, setAccessPublic] = useState(true);
  const [accessAuth, setAccessAuth] = useState(true);
  const [sessionJobId, setSessionJobId] = useState("");
  const [sessionPageUrl, setSessionPageUrl] = useState("");
  const [sessionStorageFile, setSessionStorageFile] = useState<File | null>(null);
  const [ipmsLoginStatus, setIpmsLoginStatus] = useState<IpmsLoginStatus>("none");
  const [externalLoginStatus, setExternalLoginStatus] = useState<IpmsLoginStatus>("none");
  const [sessionScope, setSessionScope] = useState<SessionScope>(null);
  const [loginSessionMode, setLoginSessionMode] = useState<LoginSessionMode>("browser");
  const activeSessionKeyRef = useRef("");
  const [sessionProgress, setSessionProgress] = useState<WqJobProgress | null>(null);
  const [discoverProgress, setDiscoverProgress] = useState<WqJobProgress | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [javaZipExtractCount, setJavaZipExtractCount] = useState<number | null>(null);
  const [ipmsScenarioSource, setIpmsScenarioSource] = useState<IpmsScenarioSource>("url");
  const [ipmsSourceZip, setIpmsSourceZip] = useState<File | null>(null);
  const [scenarioSourceLabel, setScenarioSourceLabel] = useState("");
  const [scenarioDiffOpen, setScenarioDiffOpen] = useState(false);
  const [scenarioDiffRows, setScenarioDiffRows] = useState<ScenarioDiffRow[]>([]);
  const [pendingUrlPayload, setPendingUrlPayload] = useState<ScenarioPayload | null>(null);
  const [pendingZipPayload, setPendingZipPayload] = useState<ScenarioPayload | null>(null);
  const [pendingZipFileName, setPendingZipFileName] = useState("");
  const [ipmsUrlApplyMsg, setIpmsUrlApplyMsg] = useState("");
  const [ipmsUrlApplyTone, setIpmsUrlApplyTone] = useState<"ok" | "warn" | "err">("ok");
  const [ipmsZipApplyMsg, setIpmsZipApplyMsg] = useState("");
  const [ipmsZipApplyTone, setIpmsZipApplyTone] = useState<"ok" | "warn" | "err">("ok");
  const [ipmsFullUrlPayload, setIpmsFullUrlPayload] = useState<ScenarioPayload | null>(null);
  const [ipmsFullZipPayload, setIpmsFullZipPayload] = useState<ScenarioPayload | null>(null);
  const [externalSourceApplyMsg, setExternalSourceApplyMsg] = useState("");
  const [externalSourceApplyTone, setExternalSourceApplyTone] = useState<"ok" | "warn" | "err">("ok");
  const [javaBaseUrl, setJavaBaseUrl] = useState("http://");
  const [javaNeedLogin, setJavaNeedLogin] = useState(false);
  const [javaLoginStatus, setJavaLoginStatus] = useState<IpmsLoginStatus>("none");
  const [javaStaticHint, setJavaStaticHint] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [includeRuntime, setIncludeRuntime] = useState(true);
  const [includeKrds, setIncludeKrds] = useState(true);
  const [scenarios, setScenarios] = useState<ScenarioCandidate[]>([]);
  const [extractable, setExtractable] = useState(false);
  const [scenarioLoaded, setScenarioLoaded] = useState(false);
  const [lastScenarioPayload, setLastScenarioPayload] = useState<ScenarioPayload | null>(
    null,
  );
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [javaZipBusy, setJavaZipBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scenarioWarnings, setScenarioWarnings] = useState<string[]>([]);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [envLoadError, setEnvLoadError] = useState("");
  const [envLoading, setEnvLoading] = useState(true);
  const [fixGuides, setFixGuides] = useState<Record<string, FixGuideEntry>>({});
  const [designCheck, setDesignCheck] = useState<DesignCheck>(IDLE_CHECK);
  const [busyByMode, setBusyByMode] = useState<Partial<Record<ScanMode, boolean>>>({});
  const [progressByMode, setProgressByMode] = useState<Partial<Record<ScanMode, string>>>({});
  const [msg, setMsg] = useState("");
  const [resultsByMode, setResultsByMode] = useState<Partial<Record<ScanMode, ScanResult>>>({});
  const [jobIdsByMode, setJobIdsByMode] = useState<Partial<Record<ScanMode, string>>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [selectedIdsByMode, setSelectedIdsByMode] = useState<
    Partial<Record<ScanMode, string[]>>
  >({});
  const prefsHydrated = useRef(false);
  const prefsSaveTimer = useRef<number | null>(null);
  const scenariosRef = useRef<ScenarioCandidate[]>([]);
  const scenarioLoadedRef = useRef(false);
  const ipmsAutoFetchKeyRef = useRef("");
  const javaZipLoadedKeyRef = useRef("");
  const javaZipResolvedKeyRef = useRef("");
  const javaZipStatusMsgRef = useRef("");
  const javaUploadCacheRef = useRef<JavaUploadCache | null>(null);
  const externalCacheRef = useRef<ExternalScenarioCache | null>(null);
  const prevModeRef = useRef<ScanMode>(mode);
  const [scanProgressByMode, setScanProgressByMode] = useState<
    Partial<Record<ScanMode, WqJobProgress>>
  >({});
  const [ipmsEnabled, setIpmsEnabled] = useState<boolean | null>(null);
  const [ipmsUnlocked, setIpmsUnlocked] = useState(false);
  const [ipmsUnlockOpen, setIpmsUnlockOpen] = useState(false);
  const [ipmsUnlockPending, setIpmsUnlockPending] = useState<ScanMode | null>(null);
  const [ipmsUnlockInput, setIpmsUnlockInput] = useState("");
  const [ipmsUnlockError, setIpmsUnlockError] = useState("");
  const [ipmsUnlockBusy, setIpmsUnlockBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([...WQ_STATUS_PRESETS.issues]);
  const [statusPreset, setStatusPreset] = useState<keyof typeof WQ_STATUS_PRESETS>("issues");
  const [exportScopeMode, setExportScopeMode] = useState<"all" | "tab">("tab");
  const [captureCategory, setCaptureCategory] = useState<ResultCategory | "all">("all");
  const [captureIssuesOnly, setCaptureIssuesOnly] = useState(true);
  const [captureFocusId, setCaptureFocusId] = useState<string | null>(null);
  const [capturePreview, setCapturePreview] = useState<{
    dataUrl: string;
    label: string;
    screenNo?: number;
  } | null>(null);
  const captureCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMsg, setPreviewMsg] = useState("");
  const [previewMsgTone, setPreviewMsgTone] = useState<"ok" | "warn" | "err">("ok");
  const [previewItems, setPreviewItems] = useState<
    { state_id: string; label: string; ok: boolean; error?: string }[]
  >([]);
  const validateTimer = useRef<number | null>(null);
  const validateRef = useRef<() => Promise<void>>(async () => {});

  const accessParam = useMemo(
    () => buildAccessParam(accessPublic, accessAuth),
    [accessPublic, accessAuth],
  );

  const rawResult = resultsByMode[mode] ?? null;
  const result =
    mode === "java-upload" && !zipFile ? null : rawResult;
  const lastJobId = jobIdsByMode[mode] ?? result?.job_id ?? "";
  const anyScanBusy = useMemo(
    () => Object.values(busyByMode).some(Boolean),
    [busyByMode],
  );
  const isBusyHere = Boolean(busyByMode[mode]);
  const activeScanProgress = isBusyHere ? (scanProgressByMode[mode] ?? null) : null;
  const scanProgressHint = isBusyHere ? (progressByMode[mode] ?? "") : "";

  const busyByModeRef = useRef(busyByMode);
  useEffect(() => {
    busyByModeRef.current = busyByMode;
  }, [busyByMode]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const switchMode = useCallback((next: ScanMode, opts?: { includeRuntime?: boolean }) => {
    setMode(next);
    if (opts?.includeRuntime !== undefined) setIncludeRuntime(opts.includeRuntime);
    setMsg("");
    if (!anyScanBusy) {
      setDesignCheck(IDLE_CHECK);
      setSessionProgress(null);
      setSessionStorageFile(null);
      activeSessionKeyRef.current = "";
    }
    if (!anyScanBusy) {
      setTab("all");
      setQuery("");
    }
    if (isIpmsMode(next)) {
      setSessionScope("ipms");
      const url = (ipmsUrl.trim() || IPMS_DEFAULT_URL).trim();
      const persisted = loadWqIpmsBrowserSession();
      if (persisted?.pageUrl === url) {
        setSessionJobId(persisted.jobId);
        setSessionPageUrl(persisted.pageUrl);
        setIpmsLoginStatus("ok");
      } else {
        setSessionJobId("");
        setSessionPageUrl("");
        setIpmsLoginStatus("none");
      }
      setExternalLoginStatus("none");
    } else if (next === "external") {
      setSessionScope("external");
      const url = pageUrl.trim();
      const persisted = loadWqExternalBrowserSession();
      if (persisted?.pageUrl === url) {
        setSessionJobId(persisted.jobId);
        setSessionPageUrl(persisted.pageUrl);
        setExternalLoginStatus("ok");
      } else {
        setSessionJobId("");
        setSessionPageUrl("");
        setExternalLoginStatus("none");
      }
      setIpmsLoginStatus("none");
    } else if (next === "java-upload") {
      setSessionScope("java-upload");
      setIpmsLoginStatus("none");
      setExternalLoginStatus("none");
      const cache = javaUploadCacheRef.current;
      if (cache?.javaBaseUrl) {
        setJavaBaseUrl(cache.javaBaseUrl);
      }
      if (cache?.javaNeedLogin !== undefined) {
        setJavaNeedLogin(cache.javaNeedLogin);
      }
      const deployUrl = (cache?.javaBaseUrl || javaBaseUrl).trim();
      if (isValidDeployUrl(deployUrl)) {
        const norm = normalizeWqPageUrl(deployUrl);
        const javaPersisted = loadWqJavaBrowserSession();
        const ipmsPersisted = isStoredIpmsUrl(deployUrl) ? loadWqIpmsBrowserSession() : null;
        const persisted =
          javaPersisted && normalizeWqPageUrl(javaPersisted.pageUrl) === norm
            ? { ...javaPersisted, via: "java" as const }
            : ipmsPersisted && normalizeWqPageUrl(ipmsPersisted.pageUrl) === norm
              ? { ...ipmsPersisted, via: "ipms" as const }
              : null;
        if (persisted) {
          setSessionJobId(persisted.jobId);
          setSessionPageUrl(persisted.pageUrl);
          setJavaLoginStatus("none");
          setIpmsLoginStatus("none");
        } else {
          setSessionJobId("");
          setSessionPageUrl("");
          setJavaLoginStatus("none");
          setIpmsLoginStatus("none");
        }
      } else {
        setSessionJobId("");
        setSessionPageUrl("");
        setJavaLoginStatus("none");
        setIpmsLoginStatus("none");
      }
    } else {
      setSessionScope(null);
      setSessionJobId("");
      setSessionPageUrl("");
      setIpmsLoginStatus("none");
      setExternalLoginStatus("none");
      setJavaLoginStatus("none");
    }
    const stored = selectedIdsByMode[next];
    if (next === "java-upload") {
      const cache = javaUploadCacheRef.current;
      const cacheIds =
        cache?.zipKey === javaZipKey(zipFile) && cache.resolveComplete
          ? cache.selectedIds
          : null;
      if (cacheIds) {
        setSelectedIds(cacheIds);
      } else if (stored !== undefined) {
        setSelectedIds(stored);
      }
    } else if (stored !== undefined) {
      setSelectedIds(stored);
    }
  }, [selectedIdsByMode, ipmsUrl, pageUrl, zipFile, anyScanBusy, javaBaseUrl]);

  const requestIpmsOnline = useCallback(() => {
    if (ipmsUnlocked) {
      switchMode("ipms-online", { includeRuntime: true });
      return;
    }
    setIpmsUnlockPending("ipms-online");
    setIpmsUnlockOpen(true);
    setIpmsUnlockInput("");
    setIpmsUnlockError("");
  }, [ipmsUnlocked, switchMode]);

  const submitIpmsUnlock = useCallback(async () => {
    setIpmsUnlockBusy(true);
    setIpmsUnlockError("");
    try {
      const res = await fetch("/api/portal/ipms-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: ipmsUnlockInput }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setIpmsUnlockError(
          j.error === "not_configured"
            ? "서버에 IPMS_UNLOCK_PASSWORD 가 설정되지 않았습니다."
            : "암호가 올바르지 않습니다.",
        );
        return;
      }
      setIpmsUnlocked(true);
      setIpmsUnlockOpen(false);
      if (ipmsUnlockPending) {
        switchMode(ipmsUnlockPending, { includeRuntime: true });
        setIpmsUnlockPending(null);
      }
    } catch {
      setIpmsUnlockError("확인 요청에 실패했습니다.");
    } finally {
      setIpmsUnlockBusy(false);
    }
  }, [ipmsUnlockInput, ipmsUnlockPending, switchMode]);

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

    void (async () => {
      try {
        const refRes = await fetchScanApi("v1/web-quality/ref-links");
        const refJ = await readJsonResponse(refRes);
        if (refRes.ok && refJ.kwcag_anchors) {
          setRefLinksCatalog(refJ as RefLinksCatalog);
        }
      } catch {
        /* static fallback in webQualityRefLinks */
      }
    })();
  }, []);

  useEffect(() => {
    void loadWqEnvironment();
  }, [loadWqEnvironment]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/portal/auth");
        const j = (await res.json()) as { ipmsEnabled?: boolean; ipmsUnlocked?: boolean };
        setIpmsEnabled(Boolean(j.ipmsEnabled));
        setIpmsUnlocked(Boolean(j.ipmsUnlocked));
      } catch {
        setIpmsEnabled(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (ipmsEnabled === false && isIpmsMode(mode)) {
      switchMode("external", { includeRuntime: true });
    }
  }, [ipmsEnabled, mode, switchMode]);

  useEffect(() => {
    const prefs = loadWqPrefs();
    setIpmsUrl(prefs.ipmsUrl || IPMS_DEFAULT_URL);
    const savedPageUrl = prefs.pageUrl || "";
    setPageUrl(isStoredIpmsUrl(savedPageUrl) ? "" : savedPageUrl);
    setLoginUrl(prefs.loginUrl || "");
    setLoginUsername(prefs.loginUsername || "");
    setIncludeRuntime(prefs.includeRuntime);
    setIncludeKrds(true);
    setNeedLogin(false);
    setAccessPublic(prefs.accessPublic ?? true);
    setAccessAuth(prefs.accessAuth ?? true);
    setSelectedIdsByMode(prefs.selectedIdsByMode || {});
    setJavaBaseUrl(prefs.javaBaseUrl?.trim() || "http://");
    prefsHydrated.current = true;
  }, []);

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
          includeKrds,
          needLogin: false,
          accessPublic,
          accessAuth,
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
    includeKrds,
    accessPublic,
    accessAuth,
    mode,
    selectedIds,
    selectedIdsByMode,
  ]);

  useEffect(() => {
    setSelectedIdsByMode((prev) => {
      const current = prev[mode];
      if (current && sameStringList(current, selectedIds)) return prev;
      return { ...prev, [mode]: selectedIds };
    });
  }, [mode, selectedIds]);

  useEffect(() => {
    if (!scenarioLoaded || !scenarios.length) return;
    if (mode === "java-upload") return;
    const hasSession = isIpmsMode(mode)
      ? ipmsLoginStatus === "ok"
      : externalLoginStatus === "ok";
    setSelectedIds((prev) => {
      let next = filterSelectableScenarioIds(prev, scenarios, hasSession, mode);
      if (hasSession && isIpmsMode(mode)) {
        next = buildDefaultScenarioIds(scenarios, true, mode);
      }
      return sameStringList(next, prev) ? prev : next;
    });
  }, [scenarioLoaded, scenarios, mode, externalLoginStatus, ipmsLoginStatus]);

  useEffect(() => {
    scenariosRef.current = scenarios;
  }, [scenarios]);

  useEffect(() => {
    scenarioLoadedRef.current = scenarioLoaded;
  }, [scenarioLoaded]);

  const applyScenarioPayload = useCallback(
    (j: Record<string, unknown>, opts?: { hasSession?: boolean }) => {
      const list = candidatesFromPayload(j);
      const hasSession = opts?.hasSession ?? false;
      setLastScenarioPayload(j as ScenarioPayload);
      setExtractable(Boolean(j.extractable));
      setScenarios(list);
      setScenarioLoaded(true);
      setScenarioWarnings(Array.isArray(j.warnings) ? (j.warnings as string[]) : []);
      setJavaStaticHint(typeof j.static_only_hint === "string" ? j.static_only_hint : "");
      setSelectedIds(defaultScenarioIdsFromPayload(j, list, hasSession, mode));
    },
    [mode],
  );

  const externalSessionReady = useMemo(() => {
    if (sessionScope !== "external") return false;
    const url = pageUrl.trim();
    if (sessionStorageFile) return externalLoginStatus === "ok";
    return Boolean(
      externalLoginStatus === "ok" &&
        sessionJobId.trim() &&
        sessionPageUrl.trim() === url,
    );
  }, [
    pageUrl,
    sessionJobId,
    sessionPageUrl,
    sessionStorageFile,
    sessionScope,
    externalLoginStatus,
  ]);

  const scopedSessionProgress = useMemo(() => {
    if (!sessionProgress) return null;
    if (isIpmsMode(mode) && sessionScope === "ipms") return sessionProgress;
    if (mode === "external" && sessionScope === "external") return sessionProgress;
    if (mode === "java-upload" && sessionScope === "java-upload") return sessionProgress;
    return null;
  }, [sessionProgress, sessionScope, mode]);

  const javaSessionReady = useMemo(() => {
    if (mode !== "java-upload") return false;
    const url = javaBaseUrl.trim();
    if (!isValidDeployUrl(url)) return false;
    if (sessionStorageFile && sessionScope === "java-upload" && javaLoginStatus === "ok") {
      return !sessionPageUrl.trim() || wqSessionMatchesUrl(sessionPageUrl, url);
    }
    if (wqJobSessionReady(javaLoginStatus, sessionJobId, sessionPageUrl, url)) return true;
    if (isStoredIpmsUrl(url) && wqJobSessionReady(ipmsLoginStatus, sessionJobId, sessionPageUrl, url)) {
      return true;
    }
    return false;
  }, [
    mode,
    javaBaseUrl,
    sessionStorageFile,
    sessionScope,
    javaLoginStatus,
    ipmsLoginStatus,
    sessionJobId,
    sessionPageUrl,
  ]);

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
    const url = pageUrl.trim();
    if (!url) {
      setMsg("진단 URL을 입력하세요.");
      return;
    }
    if (!isHttpUrl(url)) {
      setExternalSourceApplyMsg("");
      setExternalSourceApplyTone("err");
      return;
    }
    setScenarioBusy(true);
    setScenarioLoaded(false);
    setExternalSourceApplyMsg("");
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
      setExternalSourceApplyMsg(`시나리오 ${candidates.length}건 추출 성공`);
      setExternalSourceApplyTone("ok");
      setMsg("");
    } catch (e) {
      setExtractable(false);
      setScenarios([]);
      setSelectedIds([]);
      const err = String((e as Error).message || e);
      setExternalSourceApplyMsg(`시나리오 추출 실패 — ${err}`);
      setExternalSourceApplyTone("err");
      setMsg(err);
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

  const clearJavaUploadArtifacts = useCallback((opts?: { keepZip?: boolean }) => {
    if (!opts?.keepZip) {
      setZipFile(null);
      javaZipLoadedKeyRef.current = "";
      javaZipResolvedKeyRef.current = "";
      javaZipStatusMsgRef.current = "";
      javaUploadCacheRef.current = null;
      setJavaZipExtractCount(null);
    }
    setScenarios([]);
    setSelectedIds([]);
    setScenarioLoaded(false);
    setLastScenarioPayload(null);
    setScenarioWarnings([]);
    setJavaStaticHint("");
    setPreviewItems([]);
    setPreviewMsg("");
    setJavaZipBusy(false);
    setMsg("");
    javaZipStatusMsgRef.current = "";
    setResultsByMode((prev) => {
      if (!prev["java-upload"]) return prev;
      const next = { ...prev };
      delete next["java-upload"];
      return next;
    });
    setJobIdsByMode((prev) => {
      if (!prev["java-upload"]) return prev;
      const next = { ...prev };
      delete next["java-upload"];
      return next;
    });
  }, []);

  const applyJavaUploadCache = useCallback((cache: JavaUploadCache) => {
    setScenarios(cache.scenarios);
    setScenarioLoaded(cache.scenarioLoaded);
    setSelectedIds(filterSelectableScenarioIds(cache.selectedIds, cache.scenarios, true, "java-upload"));
    setLastScenarioPayload(cache.lastScenarioPayload);
    setScenarioWarnings(cache.scenarioWarnings);
    setJavaStaticHint(cache.javaStaticHint);
    setExtractable(cache.extractable);
    setJavaZipExtractCount(cache.extractCount);
    setJavaBaseUrl(cache.javaBaseUrl || "http://");
    setJavaNeedLogin(cache.javaNeedLogin);
    setMsg("");
    setJavaZipBusy(false);
    setScenarioBusy(false);
    javaZipLoadedKeyRef.current = cache.zipKey;
    javaZipResolvedKeyRef.current = cache.zipKey;
  }, []);

  const applyExternalCache = useCallback((cache: ExternalScenarioCache) => {
    setScenarios(cache.scenarios);
    setScenarioLoaded(cache.scenarioLoaded);
    setSelectedIds(
      filterSelectableScenarioIds(cache.selectedIds, cache.scenarios, externalSessionReady, "external"),
    );
    setLastScenarioPayload(cache.lastScenarioPayload);
    setScenarioWarnings(cache.scenarioWarnings);
    setExtractable(cache.extractable);
    setExternalSourceApplyMsg(cache.externalSourceApplyMsg);
    setExternalSourceApplyTone(cache.externalSourceApplyTone);
    setNeedLogin(cache.needLogin);
    setMsg("");
    setScenarioBusy(false);
  }, [externalSessionReady]);

  const snapshotExternalCache = useCallback((): ExternalScenarioCache | null => {
    const url = pageUrl.trim();
    if (!url || !scenarioLoaded) return null;
    return {
      pageUrl: normalizeWqPageUrl(url),
      scenarios,
      scenarioLoaded,
      resolveComplete: true,
      selectedIds,
      lastScenarioPayload,
      scenarioWarnings,
      extractable,
      externalSourceApplyMsg,
      externalSourceApplyTone,
      needLogin,
    };
  }, [
    pageUrl,
    scenarios,
    scenarioLoaded,
    selectedIds,
    lastScenarioPayload,
    scenarioWarnings,
    extractable,
    externalSourceApplyMsg,
    externalSourceApplyTone,
    needLogin,
  ]);

  const clearExternalArtifacts = useCallback(() => {
    externalCacheRef.current = null;
    setScenarios([]);
    setSelectedIds([]);
    setScenarioLoaded(false);
    setLastScenarioPayload(null);
    setScenarioWarnings([]);
    setPreviewItems([]);
    setPreviewMsg("");
    setPreviewMsgTone("ok");
    setExternalSourceApplyMsg("");
    setExternalSourceApplyTone("ok");
    setNeedLogin(false);
    setMsg("");
  }, []);

  const snapshotJavaUploadCache = useCallback((): JavaUploadCache | null => {
    const key = zipFile ? javaZipKey(zipFile) : "";
    if (!zipFile || !key || javaZipResolvedKeyRef.current !== key) return null;
    return {
      zipKey: key,
      scenarios,
      scenarioLoaded,
      resolveComplete: true,
      extractCount: javaZipExtractCount ?? scenarios.length,
      statusMsg: javaZipStatusMsgRef.current,
      selectedIds,
      lastScenarioPayload,
      scenarioWarnings,
      javaStaticHint,
      extractable,
      javaBaseUrl,
      javaNeedLogin,
    };
  }, [
    zipFile,
    scenarios,
    scenarioLoaded,
    javaZipExtractCount,
    selectedIds,
    lastScenarioPayload,
    scenarioWarnings,
    javaStaticHint,
    extractable,
    javaBaseUrl,
    javaNeedLogin,
  ]);

  const loadJavaScenarios = useCallback(async (fileOverride?: File, force = false) => {
    const file = fileOverride ?? zipFile;
    if (!file) {
      setMsg("ZIP 파일을 선택하세요.");
      return;
    }
    const key = javaZipKey(file);
    if (!force && key === javaZipResolvedKeyRef.current) {
      setJavaZipBusy(false);
      return;
    }
    setJavaZipBusy(true);
    setScenarioLoaded(false);
    setJavaNeedLogin(false);
    setMsg("");
    javaZipStatusMsgRef.current = "";
    try {
      const fd = new FormData();
      fd.append("extractor", "auto");
      fd.append("target", "java-upload");
      fd.append("file", file);
      const res = await postScanMultipart("v1/web-quality/scenarios/resolve", fd);
      const j = (await readJsonResponse(res)) as ScenarioPayload & {
        ok?: boolean;
        detail?: string;
        message?: string;
        method?: string;
      };
      if (!res.ok || !j.ok) {
        throw new Error(String(j.detail || j.message || `시나리오 읽기 실패 (HTTP ${res.status})`));
      }
      applyScenarioPayload(j);
      const candidates = candidatesFromPayload(j);
      javaZipLoadedKeyRef.current = key;
      javaZipResolvedKeyRef.current = key;
      setJavaZipExtractCount(candidates.length);
      setScenarioLoaded(true);
      javaZipStatusMsgRef.current = "";
      setMsg("");
    } catch (e) {
      javaZipLoadedKeyRef.current = "";
      javaZipResolvedKeyRef.current = key;
      setExtractable(false);
      setScenarios([]);
      setSelectedIds([]);
      setScenarioLoaded(true);
      setJavaStaticHint("");
      setJavaZipExtractCount(0);
      javaZipStatusMsgRef.current = "";
      setMsg("");
    } finally {
      setJavaZipBusy(false);
    }
  }, [applyScenarioPayload, zipFile]);

  const handleJavaZipChange = useCallback(
    (file: File) => {
      const nextKey = javaZipKey(file);
      const currentKey = javaZipKey(zipFile);

      if (nextKey === currentKey && javaZipResolvedKeyRef.current === nextKey) {
        setZipFile(file);
        return;
      }

      const cache = javaUploadCacheRef.current;
      if (cache?.zipKey === nextKey && cache.resolveComplete) {
        setZipFile(file);
        applyJavaUploadCache(cache);
        return;
      }

      if (nextKey !== currentKey) {
        clearJavaUploadArtifacts({ keepZip: true });
      }
      setZipFile(file);
      javaZipLoadedKeyRef.current = "";
      javaZipResolvedKeyRef.current = "";
      setJavaZipExtractCount(null);
      void loadJavaScenarios(file);
    },
    [
      zipFile,
      clearJavaUploadArtifacts,
      applyJavaUploadCache,
      loadJavaScenarios,
    ],
  );

  useEffect(() => {
    const prev = prevModeRef.current;
    if (prev === mode) return;

    if (prev === "java-upload") {
      const snap = snapshotJavaUploadCache();
      if (snap) {
        const javaIds = selectedIdsByMode["java-upload"];
        if (javaIds !== undefined) {
          snap.selectedIds = [...javaIds];
        }
        snap.javaBaseUrl = javaBaseUrl;
        snap.javaNeedLogin = javaNeedLogin;
        javaUploadCacheRef.current = snap;
      }
    }

    if (prev === "external") {
      const snap = snapshotExternalCache();
      if (snap) {
        const extIds = selectedIdsByMode.external;
        if (extIds !== undefined) {
          snap.selectedIds = [...extIds];
        }
        externalCacheRef.current = snap;
      }
    }

    if (mode === "java-upload") {
      if (!zipFile) {
        clearJavaUploadArtifacts();
      } else {
        const key = javaZipKey(zipFile);
        const cache = javaUploadCacheRef.current;
        if (cache?.zipKey === key && cache.resolveComplete) {
          applyJavaUploadCache(cache);
        } else if (key === javaZipResolvedKeyRef.current) {
          setJavaZipBusy(false);
        } else {
          void loadJavaScenarios(zipFile);
        }
      }
    }

    if (mode === "external") {
      const url = pageUrl.trim();
      const cache = externalCacheRef.current;
      if (url && cache?.pageUrl === normalizeWqPageUrl(url) && cache.resolveComplete) {
        applyExternalCache(cache);
      } else if (!url) {
        clearExternalArtifacts();
      } else {
        setNeedLogin(false);
      }
    }

    prevModeRef.current = mode;
  }, [
    mode,
    zipFile,
    pageUrl,
    selectedIdsByMode,
    javaBaseUrl,
    javaNeedLogin,
    snapshotJavaUploadCache,
    snapshotExternalCache,
    clearExternalArtifacts,
    clearJavaUploadArtifacts,
    applyJavaUploadCache,
    applyExternalCache,
    loadJavaScenarios,
  ]);

  useEffect(() => {
    if (mode !== "java-upload" || !zipFile) return;
    if (javaZipResolvedKeyRef.current !== javaZipKey(zipFile)) return;
    javaUploadCacheRef.current = snapshotJavaUploadCache();
  }, [
    mode,
    zipFile,
    scenarioLoaded,
    javaZipExtractCount,
    snapshotJavaUploadCache,
    scenarios,
    selectedIds,
    javaBaseUrl,
    javaNeedLogin,
  ]);

  useEffect(() => {
    if (mode !== "external") return;
    const snap = snapshotExternalCache();
    if (snap) externalCacheRef.current = snap;
  }, [
    mode,
    scenarioLoaded,
    snapshotExternalCache,
    scenarios,
    selectedIds,
    needLogin,
    externalSourceApplyMsg,
    externalSourceApplyTone,
  ]);

  useEffect(() => {
    if (mode !== "java-upload" || !zipFile) return;
    const key = javaZipKey(zipFile);
    if (key === javaZipResolvedKeyRef.current) {
      setJavaZipBusy(false);
    }
  }, [mode, zipFile]);

  const validateIpmsSessionUpload = useCallback(
    async (file: File) => {
      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      setIpmsLoginStatus("checking");
      setSessionStorageFile(file);
      setSessionJobId("");
      setSessionPageUrl("");
      setSessionScope("ipms");
      setExternalLoginStatus("none");
      try {
        const fd = new FormData();
        fd.append("base_url", ipmsUrl.trim() || IPMS_DEFAULT_URL);
        fd.append("session_storage", file);
        const res = await postScanMultipart("v1/web-quality/ipms/session/validate", fd);
        const j = (await readJsonResponse(res)) as { ok?: boolean; message?: string };
        if (!res.ok || !j.ok) {
          setIpmsLoginStatus("fail");
          setSessionStorageFile(null);
          activeSessionKeyRef.current = "";
          setMsg(j.message || "로그인 실패");
          return;
        }
        activeSessionKeyRef.current = fileKey;
        setIpmsLoginStatus("ok");
        setMsg("");
      } catch (e) {
        setIpmsLoginStatus("fail");
        setSessionStorageFile(null);
        activeSessionKeyRef.current = "";
        setMsg(String((e as Error).message || "로그인 실패"));
      }
    },
    [ipmsUrl],
  );

  const fetchIpmsScenarioResolve = useCallback(
    async (zipFile?: File | null, accessOverride?: string) => {
      const fd = new FormData();
      fd.append("extractor", "auto");
      fd.append("target", "ipms-online");
      fd.append("base_url", ipmsUrl.trim());
      fd.append("access", accessOverride ?? accessParam);
      if (zipFile) {
        fd.append("file", zipFile);
      }
      fd.append("allow_playwright_fallback", "false");
      const res = await postScanMultipart("v1/web-quality/scenarios/resolve", fd);
      const j = (await readJsonResponse(res)) as ScenarioPayload & {
        ok?: boolean;
        detail?: string;
        message?: string;
      };
      if (!res.ok || !j.ok) {
        throw new Error(String(j.detail || j.message || `시나리오 읽기 실패 (HTTP ${res.status})`));
      }
      return j;
    },
    [ipmsUrl, accessParam],
  );

  const compareIpmsUrlAndZip = useCallback(
    async (zipFile: File) => {
      if (!accessPublic && !accessAuth) {
        setMsg("공개·로그인 시나리오 중 하나 이상 체크하세요.");
        return;
      }
      setScenarioBusy(true);
      try {
        const [urlJ, zipJ] = await Promise.all([
          fetchIpmsScenarioResolve(null, IPMS_FULL_ACCESS),
          fetchIpmsScenarioResolve(zipFile, IPMS_FULL_ACCESS),
        ]);
        const urlList = candidatesFromPayload(urlJ);
        const zipList = candidatesFromPayload(zipJ);
        const rows = diffScenarioLists(urlList, zipList);
        setPendingUrlPayload(urlJ);
        setPendingZipPayload(zipJ);
        setPendingZipFileName(zipFile.name);
        setScenarioDiffRows(rows);
        setScenarioDiffOpen(true);
        const zipApply = buildIpmsApplyMessage(zipJ, zipList.length);
        setIpmsZipApplyMsg(zipApply.text);
        setIpmsZipApplyTone(zipApply.tone);
        const sum = diffSummary(rows);
        setMsg(
          `접속 URL ${urlList.length}개 vs ZIP ${zipList.length}개 · 추가 ${sum.added} · 삭제 ${sum.removed} · 변경 ${sum.changed} — 적용 여부를 선택하세요.`,
        );
        setScenarioLoaded(true);
      } catch (e) {
        setMsg(String((e as Error).message || e));
      } finally {
        setScenarioBusy(false);
      }
    },
    [accessPublic, accessAuth, fetchIpmsScenarioResolve],
  );

  const loadIpmsScenarios = useCallback(
    async (opts?: {
      source?: IpmsScenarioSource;
      zipOverride?: File | null;
      resetSelection?: boolean;
    }) => {
      if (!accessPublic && !accessAuth) {
        setExtractable(false);
        setScenarios([]);
        setSelectedIds([]);
        setScenarioLoaded(true);
        setMsg("공개·로그인 시나리오 중 하나 이상 체크하세요.");
        return;
      }
      const source = opts?.source ?? ipmsScenarioSource;
      const zipForRequest =
        source === "zip" ? (opts?.zipOverride !== undefined ? opts.zipOverride : ipmsSourceZip) : null;

      if (source === "zip") {
        const zipFile = zipForRequest;
        if (!zipFile) {
          setMsg("ZIP 파일을 선택하세요.");
          return;
        }
        await compareIpmsUrlAndZip(zipFile);
        return;
      }

      setScenarioBusy(true);
      setScenarioLoaded(false);
      setIpmsUrlApplyMsg("");
      setIpmsUrlApplyTone("ok");
      try {
        const j = await fetchIpmsScenarioResolve(null, IPMS_FULL_ACCESS);
        const fullList = candidatesFromPayload(j);
        const hasSession = ipmsLoginStatus === "ok";
        setIpmsFullUrlPayload(j);
        ipmsAutoFetchKeyRef.current = ipmsUrl.trim();
        const filtered = filterScenarioPayloadByAccess(j, accessPublic, accessAuth);
        const filteredList = candidatesFromPayload(filtered);

        applyScenarioPayload(filtered, { hasSession });
        if (opts?.resetSelection) {
          setSelectedIds(defaultScenarioIdsFromPayload(filtered, filteredList, hasSession, mode));
        } else {
          setSelectedIds((prev) => {
            const kept = filterSelectableScenarioIds(prev, filteredList, hasSession, mode);
            return kept.length
              ? kept
              : defaultScenarioIdsFromPayload(filtered, filteredList, hasSession, mode);
          });
        }
        setScenarioSourceLabel(formatScenarioSourceLabel(j.method, filteredList.length));
        setIpmsScenarioSource("url");
        const applyResult = buildIpmsApplyMessage(j, fullList.length);
        setIpmsUrlApplyMsg(applyResult.text);
        setIpmsUrlApplyTone(applyResult.tone);
        setMsg("");
      } catch (e) {
        setExtractable(false);
        setScenarios([]);
        setSelectedIds([]);
        setIpmsFullUrlPayload(null);
        const err = String((e as Error).message || e);
        setIpmsUrlApplyMsg(`시나리오 추출 실패 — ${err}`);
        setIpmsUrlApplyTone("err");
        setMsg(err);
      } finally {
        setScenarioBusy(false);
      }
    },
    [
      accessPublic,
      accessAuth,
      ipmsScenarioSource,
      ipmsSourceZip,
      fetchIpmsScenarioResolve,
      compareIpmsUrlAndZip,
      applyScenarioPayload,
      sessionJobId,
      sessionStorageFile,
      ipmsLoginStatus,
    ],
  );

  const applyPendingIpmsScenarioRefresh = useCallback(() => {
    if (!pendingZipPayload) return;
    if (lastScenarioPayload && scenarios.length) {
      saveScenarioBackup({
        savedAt: new Date().toISOString(),
        source: "ipms-online",
        zipName: pendingZipFileName || ipmsSourceZip?.name,
        payload: lastScenarioPayload as unknown as Record<string, unknown>,
        selectedIds: [...selectedIds],
      });
    }
    const fullList = candidatesFromPayload(pendingZipPayload);
    setIpmsFullZipPayload(pendingZipPayload);
    const filtered = filterScenarioPayloadByAccess(pendingZipPayload, accessPublic, accessAuth);
    applyScenarioPayload(filtered, {
      hasSession: ipmsLoginStatus === "ok",
    });
    const filteredList = candidatesFromPayload(filtered);
    const label = formatScenarioSourceLabel(pendingZipPayload.method, filteredList.length);
    setScenarioSourceLabel(label);
    setIpmsScenarioSource("zip");
    setIpmsZipApplyMsg(`시나리오 ${fullList.length}건 추출 성공`);
    setIpmsZipApplyTone("ok");
    setScenarioDiffOpen(false);
    setPendingUrlPayload(null);
    setPendingZipPayload(null);
    setScenarioDiffRows([]);
    setPendingZipFileName("");
    setMsg(`ZIP 시나리오 ${fullList.length}건 적용 · ${ipmsSourceLabel(pendingZipPayload.method)}`);
  }, [
    applyScenarioPayload,
    pendingZipPayload,
    pendingZipFileName,
    lastScenarioPayload,
    scenarios.length,
    selectedIds,
    ipmsSourceZip,
    accessPublic,
    accessAuth,
    ipmsLoginStatus,
  ]);

  const cancelPendingIpmsScenarioRefresh = useCallback(() => {
    setScenarioDiffOpen(false);
    setPendingZipPayload(null);
    setScenarioDiffRows([]);
    setPendingZipFileName("");
    if (pendingUrlPayload) {
      const filtered = filterScenarioPayloadByAccess(pendingUrlPayload, accessPublic, accessAuth);
      applyScenarioPayload(filtered, {
        hasSession: ipmsLoginStatus === "ok",
      });
      setScenarioSourceLabel(
        formatScenarioSourceLabel(
          pendingUrlPayload.method,
          candidatesFromPayload(filtered).length,
        ),
      );
      setIpmsScenarioSource("url");
    }
    setPendingUrlPayload(null);
    setScenarioLoaded(true);
    setMsg("ZIP 미적용 — 접속 URL 시나리오를 유지합니다.");
  }, [
    applyScenarioPayload,
    pendingUrlPayload,
    accessPublic,
    accessAuth,
    ipmsLoginStatus,
  ]);

  useEffect(() => {
    if (!isIpmsMode(mode) || !ipmsEnabled || !ipmsUnlocked) return;
    const fullPayload =
      ipmsScenarioSource === "zip" ? ipmsFullZipPayload : ipmsFullUrlPayload;
    if (!fullPayload) return;

    if (!accessPublic && !accessAuth) {
      setScenarios([]);
      setSelectedIds([]);
      setScenarioLoaded(true);
      setExtractable(false);
      setLastScenarioPayload(null);
      setScenarioSourceLabel("");
      setMsg("공개·로그인 시나리오 중 하나 이상 체크하세요.");
      return;
    }

    const filtered = filterScenarioPayloadByAccess(fullPayload, accessPublic, accessAuth);
    const filteredList = candidatesFromPayload(filtered);
    applyScenarioPayload(filtered, { hasSession: ipmsLoginStatus === "ok" });
    setScenarioSourceLabel(formatScenarioSourceLabel(fullPayload.method, filteredList.length));
  }, [
    mode,
    ipmsEnabled,
    ipmsUnlocked,
    ipmsScenarioSource,
    ipmsFullUrlPayload,
    ipmsFullZipPayload,
    accessPublic,
    accessAuth,
    ipmsLoginStatus,
    applyScenarioPayload,
  ]);

  useEffect(() => {
    if (mode !== "ipms-online") return;
    setPreviewMsg("");
    setPreviewItems([]);
  }, [mode, accessParam]);

  useEffect(() => {
    if (mode !== "ipms-online" || accessAuth) return;
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const c = scenarios.find((s) => s.state_id === id);
        return c && (c.access || "public").toLowerCase() !== "auth";
      }),
    );
  }, [mode, accessAuth, scenarios]);

  useEffect(() => {
    if (mode !== "external") return;
    const url = pageUrl.trim();
    if (!url) return;
    if (sessionPageUrl && sessionPageUrl !== url) {
      setSessionJobId("");
      setSessionPageUrl("");
      setSessionStorageFile(null);
      setSessionProgress(null);
      setExternalLoginStatus("none");
      clearWqExternalBrowserSession();
    }
    const cache = externalCacheRef.current;
    if (cache && cache.pageUrl !== normalizeWqPageUrl(url)) {
      clearExternalArtifacts();
    }
  }, [pageUrl, mode, sessionPageUrl, clearExternalArtifacts]);

  useEffect(() => {
    if (!isIpmsMode(mode) || !accessAuth || !ipmsEnabled || !ipmsUnlocked) return;
    const url = (ipmsUrl.trim() || IPMS_DEFAULT_URL).trim();
    if (sessionStorageFile) return;
    const persisted = loadWqIpmsBrowserSession();
    if (persisted && persisted.pageUrl !== url) {
      if (sessionJobId === persisted.jobId) {
        setSessionJobId("");
        setSessionPageUrl("");
        setIpmsLoginStatus("none");
        activeSessionKeyRef.current = "";
        setSessionProgress(null);
      }
      return;
    }
    if (sessionJobId.trim() || ipmsLoginStatus === "ok") return;
    if (!persisted || persisted.pageUrl !== url) return;

    let cancelled = false;
    void (async () => {
      try {
        setIpmsLoginStatus("checking");
        const res = await fetchScanApi(`v1/web-quality/jobs/${persisted.jobId}`);
        const j = (await readJsonResponse(res)) as WqJobProgress;
        if (cancelled || !res.ok || j.status !== "done") {
          if (!cancelled) {
            clearWqIpmsBrowserSession();
            setIpmsLoginStatus("none");
            setSessionProgress(null);
          }
          return;
        }
        setSessionJobId(persisted.jobId);
        setSessionPageUrl(persisted.pageUrl);
        activeSessionKeyRef.current = `job:${persisted.jobId}`;
        setSessionScope("ipms");
        setIpmsLoginStatus("ok");
        setExternalLoginStatus("none");
        setSessionProgress({
          job_id: persisted.jobId,
          status: "done",
          pct: 100,
          message: "기존 로그인 세션 자동 연결",
        });
      } catch {
        if (!cancelled) {
          clearWqIpmsBrowserSession();
          setIpmsLoginStatus("none");
          setSessionProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    accessAuth,
    ipmsEnabled,
    ipmsUnlocked,
    ipmsUrl,
    sessionJobId,
    sessionStorageFile,
    ipmsLoginStatus,
  ]);

  useEffect(() => {
    if (mode !== "external" || !needLogin) return;
    const url = pageUrl.trim();
    if (!url || sessionStorageFile || sessionJobId.trim()) return;
    const persisted = loadWqExternalBrowserSession();
    if (!persisted || persisted.pageUrl !== url) return;

    let cancelled = false;
    void (async () => {
      try {
        setExternalLoginStatus("checking");
        setSessionScope("external");
        const res = await fetchScanApi(`v1/web-quality/jobs/${persisted.jobId}`);
        const j = (await readJsonResponse(res)) as WqJobProgress;
        if (cancelled || !res.ok || j.status !== "done") {
          if (!cancelled) {
            clearWqExternalBrowserSession();
            setExternalLoginStatus("none");
            setSessionProgress(null);
          }
          return;
        }
        setSessionJobId(persisted.jobId);
        setSessionPageUrl(persisted.pageUrl);
        setIpmsLoginStatus("none");
        setExternalLoginStatus("ok");
        setSessionProgress({
          job_id: persisted.jobId,
          status: "done",
          pct: 100,
          message: "기존 로그인 세션 자동 연결",
        });
      } catch {
        if (!cancelled) {
          clearWqExternalBrowserSession();
          setExternalLoginStatus("none");
          setSessionProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, needLogin, pageUrl, sessionJobId, sessionStorageFile]);

  useEffect(() => {
    if (mode !== "java-upload") return;
    const url = javaBaseUrl.trim();
    if (!isValidDeployUrl(url) || sessionStorageFile) return;
    if (javaLoginStatus === "ok" && sessionJobId.trim() && wqSessionMatchesUrl(sessionPageUrl, url)) {
      return;
    }
    const persisted = loadWqPersistedBrowserSessionForUrl(url);
    if (!persisted) return;
    if (sessionJobId.trim() === persisted.jobId && javaLoginStatus === "checking") return;

    let cancelled = false;
    void (async () => {
      try {
        setSessionScope("java-upload");
        const res = await fetchScanApi(`v1/web-quality/jobs/${persisted.jobId}`);
        const j = (await readJsonResponse(res)) as WqJobProgress;
        if (cancelled || !res.ok || j.status !== "done") {
          if (!cancelled) {
            if (isStoredIpmsUrl(url)) clearWqIpmsBrowserSession();
            clearWqJavaBrowserSession();
            setJavaLoginStatus("none");
            setIpmsLoginStatus("none");
            setSessionProgress(null);
          }
          return;
        }
        const valid = await validateIpmsSessionJob(persisted.jobId, url);
        if (cancelled || !valid) {
          if (!cancelled) {
            if (isStoredIpmsUrl(url)) clearWqIpmsBrowserSession();
            clearWqJavaBrowserSession();
            setSessionJobId("");
            setSessionPageUrl("");
            setJavaLoginStatus("none");
            setIpmsLoginStatus("none");
            setSessionProgress(null);
          }
          return;
        }
        setSessionJobId(persisted.jobId);
        setSessionPageUrl(persisted.pageUrl);
        setJavaLoginStatus("ok");
        if (isStoredIpmsUrl(url) && normalizeWqPageUrl(persisted.pageUrl) === normalizeWqPageUrl(url)) {
          setIpmsLoginStatus("ok");
        } else {
          setIpmsLoginStatus("none");
        }
        setSessionProgress({
          job_id: persisted.jobId,
          status: "done",
          pct: 100,
          message: "기존 로그인 세션 자동 연결",
        });
      } catch {
        if (!cancelled) {
          clearWqJavaBrowserSession();
          if (isStoredIpmsUrl(url)) clearWqIpmsBrowserSession();
          setJavaLoginStatus("none");
          setIpmsLoginStatus("none");
          setSessionProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    javaBaseUrl,
    sessionJobId,
    sessionPageUrl,
    sessionStorageFile,
    javaLoginStatus,
  ]);

  async function tryReconnectBrowserSession(
    targetUrl: string,
    saveAs: "ipms" | "external" | "java",
    opts?: { scope?: SessionScope },
  ): Promise<boolean> {
    const url = targetUrl.trim();
    if (!url) return false;
    const norm = normalizeWqPageUrl(url);
    const persisted =
      saveAs === "ipms"
        ? loadWqIpmsBrowserSession()
        : saveAs === "java"
          ? loadWqJavaBrowserSession()
          : loadWqExternalBrowserSession();
    if (!persisted || normalizeWqPageUrl(persisted.pageUrl) !== norm) return false;

    const scope =
      opts?.scope ??
      (saveAs === "ipms" ? "ipms" : saveAs === "java" ? "java-upload" : "external");
    const forJavaUpload = scope === "java-upload";

    setSessionScope(scope);
    setSessionStorageFile(null);
    setSessionProgress({
      job_id: persisted.jobId,
      status: "checking",
      pct: 50,
      message: "기존 로그인 세션 확인 중…",
    });
    try {
      const res = await fetchScanApi(`v1/web-quality/jobs/${persisted.jobId}`);
      const j = (await readJsonResponse(res)) as WqJobProgress;
      if (!res.ok || j.status !== "done") {
        if (saveAs === "ipms") clearWqIpmsBrowserSession();
        else if (saveAs === "java") clearWqJavaBrowserSession();
        else clearWqExternalBrowserSession();
        setSessionProgress(null);
        return false;
      }
      const valid = await validateIpmsSessionJob(persisted.jobId, url);
      if (!valid) {
        if (saveAs === "ipms") clearWqIpmsBrowserSession();
        else if (saveAs === "java") clearWqJavaBrowserSession();
        else clearWqExternalBrowserSession();
        setSessionProgress(null);
        return false;
      }
      setSessionJobId(persisted.jobId);
      setSessionPageUrl(persisted.pageUrl);
      if (forJavaUpload) {
        setJavaLoginStatus("ok");
        setExternalLoginStatus("none");
        setIpmsLoginStatus(isStoredIpmsUrl(url) ? "ok" : "none");
        saveWqJavaBrowserSession(persisted.jobId, persisted.pageUrl);
      } else if (saveAs === "ipms") {
        setIpmsLoginStatus("ok");
        setExternalLoginStatus("none");
        setJavaLoginStatus("none");
        activeSessionKeyRef.current = `job:${persisted.jobId}`;
      } else if (saveAs === "java") {
        setJavaLoginStatus("ok");
        setIpmsLoginStatus(isStoredIpmsUrl(url) ? "ok" : "none");
        setExternalLoginStatus("none");
        saveWqJavaBrowserSession(persisted.jobId, persisted.pageUrl);
      } else {
        setExternalLoginStatus("ok");
        setIpmsLoginStatus("none");
        setJavaLoginStatus("none");
      }
      setSessionProgress({
        job_id: persisted.jobId,
        status: "done",
        pct: 100,
        message: "기존 로그인 세션 자동 연결",
      });
      setMsg("");
      return true;
    } catch {
      setSessionProgress(null);
      return false;
    }
  }

  async function pollSessionJob(
    jobId: string,
    targetUrl: string,
    detect: "ipms" | "generic" = "generic",
    saveAs: "ipms" | "external" | "java" = detect === "ipms" ? "ipms" : "external",
  ): Promise<void> {
    for (let i = 0; i < 900; i++) {
      const res = await fetchScanApi(`v1/web-quality/jobs/${jobId}`);
      const j = (await readJsonResponse(res)) as WqJobProgress & { ok?: boolean; has_file?: boolean };
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
        const trimmedUrl = targetUrl.trim();
        if (saveAs === "java" || saveAs === "ipms") {
          const valid = await validateIpmsSessionJob(jobId, trimmedUrl);
          if (!valid) {
            setSessionProgress(null);
            if (saveAs === "java") {
              setJavaLoginStatus("fail");
              clearWqJavaBrowserSession();
              if (isStoredIpmsUrl(trimmedUrl)) clearWqIpmsBrowserSession();
            } else {
              setIpmsLoginStatus("fail");
              clearWqIpmsBrowserSession();
            }
            setMsg("로그인 세션이 만료되었거나 배포 URL과 맞지 않습니다. 「로그인 창 띄움」을 다시 실행하세요.");
            return;
          }
        }
        setSessionJobId(jobId);
        setSessionPageUrl(trimmedUrl);
        if (saveAs === "ipms") {
          setSessionStorageFile(null);
          setIpmsLoginStatus("ok");
          activeSessionKeyRef.current = `job:${jobId}`;
          saveWqIpmsBrowserSession(jobId, targetUrl.trim());
          setMsg("");
          return;
        }
        if (saveAs === "java") {
          setSessionStorageFile(null);
          setJavaLoginStatus("ok");
          if (isStoredIpmsUrl(targetUrl.trim())) setIpmsLoginStatus("ok");
          else setIpmsLoginStatus("none");
          setExternalLoginStatus("none");
          saveWqJavaBrowserSession(jobId, targetUrl.trim());
          setMsg("");
          return;
        }
        saveWqExternalBrowserSession(jobId, targetUrl.trim());
        setExternalLoginStatus("ok");
        setIpmsLoginStatus("none");
        setMsg("로그인 세션 생성 완료 — 「화면 시나리오 가져오기」를 실행하세요.");
        return;
      }
      if (j.status === "error") {
        const errMsg = String(j.error || j.message || "세션 생성 실패");
        setSessionProgress(null);
        if (isBrowserClosedSessionError(errMsg)) {
          if (saveAs === "ipms") {
            setIpmsLoginStatus("none");
            activeSessionKeyRef.current = "";
            clearWqIpmsBrowserSession();
          } else if (saveAs === "java") {
            setJavaLoginStatus("none");
            clearWqJavaBrowserSession();
          } else {
            setExternalLoginStatus("none");
            clearWqExternalBrowserSession();
          }
        } else if (saveAs === "ipms") {
          setIpmsLoginStatus("fail");
          activeSessionKeyRef.current = "";
          clearWqIpmsBrowserSession();
        } else if (saveAs === "java") {
          setJavaLoginStatus("fail");
          clearWqJavaBrowserSession();
        } else {
          setExternalLoginStatus("fail");
          clearWqExternalBrowserSession();
        }
        setMsg(friendlySessionError(errMsg));
        return;
      }
      if (j.status === "cancelled") {
        setSessionProgress(null);
        if (saveAs === "ipms") {
          setIpmsLoginStatus("none");
          activeSessionKeyRef.current = "";
        } else if (saveAs === "java") {
          setJavaLoginStatus("none");
        } else {
          setExternalLoginStatus("none");
        }
        setMsg("로그인 세션이 취소되었습니다.");
        return;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error("세션 생성 시간 초과");
  }

  async function startBrowserSession(
    targetUrl: string,
    detect: "ipms" | "generic",
    saveAs: "ipms" | "external" | "java" = detect === "ipms" ? "ipms" : "external",
  ) {
    setSessionScope(
      saveAs === "ipms" ? "ipms" : saveAs === "java" ? "java-upload" : "external",
    );
    setSessionJobId("");
    setSessionPageUrl("");
    setSessionStorageFile(null);
    if (saveAs === "ipms") {
      setExternalLoginStatus("none");
      setJavaLoginStatus("none");
      setIpmsLoginStatus("checking");
    } else if (saveAs === "java") {
      setIpmsLoginStatus("none");
      setExternalLoginStatus("none");
      setJavaLoginStatus("checking");
    } else {
      setIpmsLoginStatus("none");
      setJavaLoginStatus("none");
      setExternalLoginStatus("checking");
    }
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
      await pollSessionJob(j.job_id, targetUrl.trim(), detect, saveAs);
    } catch (e) {
      const errMsg = String((e as Error).message || e);
      setSessionProgress(null);
      if (isBrowserClosedSessionError(errMsg)) {
        if (saveAs === "ipms") {
          setIpmsLoginStatus("none");
          activeSessionKeyRef.current = "";
        } else if (saveAs === "java") {
          setJavaLoginStatus("none");
        } else {
          setExternalLoginStatus("none");
        }
      } else if (saveAs === "ipms") {
        setIpmsLoginStatus("fail");
        activeSessionKeyRef.current = "";
      } else if (saveAs === "java") {
        setJavaLoginStatus("fail");
      } else {
        setExternalLoginStatus("fail");
      }
      setMsg(friendlySessionError(errMsg));
    }
  }

  async function startIpmsSession() {
    const url = (ipmsUrl.trim() || IPMS_DEFAULT_URL).trim();
    if (await tryReconnectBrowserSession(url, "ipms")) return;
    setSessionStorageFile(null);
    setSessionScope("ipms");
    setExternalLoginStatus("none");
    setJavaLoginStatus("none");
    setIpmsLoginStatus("checking");
    await startBrowserSession(ipmsUrl.trim() || IPMS_DEFAULT_URL, "ipms", "ipms");
  }

  async function startExternalSession() {
    const url = pageUrl.trim();
    if (await tryReconnectBrowserSession(url, "external")) return;
    setSessionStorageFile(null);
    setSessionScope("external");
    setIpmsLoginStatus("none");
    setJavaLoginStatus("none");
    setExternalLoginStatus("checking");
    await startBrowserSession(pageUrl.trim(), "generic", "external");
  }

  async function startJavaSession() {
    const url = javaBaseUrl.trim();
    if (!isValidDeployUrl(url)) {
      setMsg("배포 URL(http:// 또는 https://)을 입력하세요.");
      return;
    }
    if (await tryReconnectBrowserSession(url, "java", { scope: "java-upload" })) return;
    if (isStoredIpmsUrl(url) && (await tryReconnectBrowserSession(url, "ipms", { scope: "java-upload" }))) {
      return;
    }
    setSessionStorageFile(null);
    setSessionScope("java-upload");
    setIpmsLoginStatus("none");
    setExternalLoginStatus("none");
    setJavaLoginStatus("checking");
    const useIpms = isStoredIpmsUrl(url);
    await startBrowserSession(url, useIpms ? "ipms" : "generic", "java");
  }

  async function pollWqJob(
    jobId: string,
    scanMode: ScanMode,
  ): Promise<Record<string, unknown> | null> {
    for (let i = 0; i < 900; i++) {
      const res = await fetchScanApi(`v1/web-quality/jobs/${jobId}`);
      const j = (await readJsonResponse(res)) as WqJobProgress & {
        ok?: boolean;
        result?: Record<string, unknown>;
      };
      if (!res.ok) throw new Error(j.message || `job poll failed (${res.status})`);
      setScanProgressByMode((prev) => ({
        ...prev,
        [scanMode]: {
          job_id: jobId,
          status: j.status,
          pct: j.pct ?? 0,
          message: j.message || "",
          step_label: j.step_label,
          error: j.error,
        },
      }));
      if (j.status === "done" && j.result) return j.result;
      if (j.status === "cancelled") throw new Error("진단이 취소되었습니다.");
      if (j.status === "error") throw new Error(j.error || j.message || "진단 실패");
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error("진단 시간 초과");
  }

  async function cancelScan() {
    const jobId = scanProgressByMode[mode]?.job_id;
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

  const appendCommonFields = useCallback(
    (fd: FormData) => {
      fd.append("mode", mode);
      fd.append("include_runtime", includeRuntime ? "true" : "false");
      fd.append("include_krds", includeKrds ? "true" : "false");
      if (isIpmsMode(mode)) {
        fd.append("target", "ipms-online");
        fd.append("page_url", ipmsUrl.trim());
        fd.append("ipms_access", accessParam);
        if (ipmsLoginStatus === "ok" && sessionJobId.trim()) fd.append("session_job_id", sessionJobId.trim());
        if (sessionStorageFile) fd.append("session_storage", sessionStorageFile);
        if (selectedIds.length) fd.append("state_ids", selectedIds.join(","));
      } else if (mode === "java-upload") {
        fd.append("target", "java-upload");
        const deployUrl = javaBaseUrl.trim();
        if (includeRuntime && isValidDeployUrl(deployUrl)) {
          fd.append("page_url", deployUrl);
          if (loginUrl.trim()) fd.append("login_url", loginUrl.trim());
          if (loginUsername.trim()) fd.append("login_username", loginUsername.trim());
          if (loginPassword.trim()) fd.append("login_password", loginPassword.trim());
        }
        const javaSessionJobId = resolveWqBrowserSessionJobId(deployUrl, {
          sessionJobId,
          sessionPageUrl,
          javaLoginStatus,
          ipmsLoginStatus,
          externalLoginStatus,
        });
        if (javaSessionJobId) {
          fd.append("session_job_id", javaSessionJobId);
        }
        if (sessionStorageFile && sessionScope === "java-upload") {
          fd.append("session_storage", sessionStorageFile);
        }
        if (selectedIds.length) fd.append("state_ids", selectedIds.join(","));
      } else {
        fd.append("target", "external");
        fd.append("page_url", pageUrl.trim());
        if (isStoredIpmsUrl(pageUrl.trim())) {
          fd.append("ipms_access", accessParam);
        }
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
      includeKrds,
      selectedIds,
      ipmsUrl,
      accessParam,
      sessionJobId,
      sessionStorageFile,
      externalSessionReady,
      javaBaseUrl,
      loginUrl,
      loginUsername,
      loginPassword,
      javaSessionReady,
      javaLoginStatus,
      ipmsLoginStatus,
      externalLoginStatus,
      sessionScope,
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
    if (Object.values(busyByModeRef.current).some(Boolean)) {
      if (modeRef.current === scanMode) {
        setMsg("다른 탭 진단이 진행 중입니다. 완료 후 다시 시도하세요.");
      }
      return;
    }
    const format = "json" as const;
    setResultsByMode((prev) => {
      if (!prev[scanMode]) return prev;
      const next = { ...prev };
      delete next[scanMode];
      return next;
    });
    setJobIdsByMode((prev) => {
      if (!prev[scanMode]) return prev;
      const next = { ...prev };
      delete next[scanMode];
      return next;
    });
    setTab("all");
    setQuery("");
    setCaptureFocusId(null);
    setBusyByMode((prev) => ({ ...prev, [scanMode]: true }));
    setScanProgressByMode((prev) => {
      const next = { ...prev };
      delete next[scanMode];
      return next;
    });
    setProgressByMode((prev) => ({
      ...prev,
      [scanMode]:
        scanMode === "ipms-online"
          ? "IPMS 화면 진단 실행 중…"
          : scanMode === "java-upload"
            ? includeRuntime
              ? "Java ZIP 정적 + 화면 진단 실행 중…"
              : "Java ZIP 정적 진단 실행 중…"
            : "외부 URL 화면 진단 실행 중…",
    }));
    setMsg("");
    try {
      const fd = new FormData();
      appendCommonFields(fd);
      if (mode === "java-upload") {
        if (!zipFile) throw new Error("ZIP 파일을 선택하세요.");
        fd.append("file", zipFile);
      }
      if (mode === "ipms-online") {
        if (!accessPublic && !accessAuth) {
          throw new Error("공개·로그인 시나리오 중 하나 이상 체크하세요.");
        }
        const needsAuthSession = selectedIds.some((id) => {
          const c = scenarios.find((s) => s.state_id === id);
          return c && (c.access || "public").toLowerCase() === "auth";
        });
        if (needsAuthSession && includeRuntime && ipmsLoginStatus !== "ok") {
          throw new Error("로그인 시나리오가 포함되어 있습니다. 로그인 세션을 먼저 완료하세요.");
        }
      }
      if (mode === "external" && !scenarioLoaded) {
        throw new Error("먼저 「화면 시나리오 가져오기」를 실행하세요.");
      }
      if (mode === "external" && scenarioLoaded && !selectedIds.length) {
        throw new Error("진단할 화면을 하나 이상 선택하세요.");
      }
      fd.append("format", format);
      if (format === "json" && isAsyncScanMode(scanMode)) {
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
      if (start.async && start.job_id && isAsyncScanMode(scanMode)) {
        setScanProgressByMode((prev) => ({
          ...prev,
          [scanMode]: {
            job_id: start.job_id as string,
            status: "running",
            pct: start.pct ?? 0,
            message: start.message || "진단 시작…",
          },
        }));
        const polled = await pollWqJob(start.job_id, scanMode);
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
      if (modeRef.current === scanMode) {
        setTab("all");
        const diffNote = j.diff
          ? ` · diff 신규 ${j.diff.new_count ?? 0} / 해소 ${j.diff.resolved_count ?? 0}`
          : "";
        const rtNote =
          j.runtime_available ? "" : ` (화면: ${formatRuntimeError(j.runtime_error) || "런타임 불가"})`;
        setMsg(
          `진단 완료 — ${j.findings.length}건 · 캡처 ${j.screenshots?.length ?? 0}장 · 미실행 ${j.stats?.not_scanned ?? 0}건${diffNote}${rtNote}`
        );
      }
    } catch (e) {
      if (modeRef.current === scanMode) {
        setMsg(wrapScanFetchError(e).message);
      }
    } finally {
      setBusyByMode((prev) => {
        const next = { ...prev };
        delete next[scanMode];
        return next;
      });
      setProgressByMode((prev) => {
        const next = { ...prev };
        delete next[scanMode];
        return next;
      });
      setScanProgressByMode((prev) => {
        const next = { ...prev };
        delete next[scanMode];
        return next;
      });
    }
  }

  const hasIpmsSession = ipmsLoginStatus === "ok";
  const hasExternalSession = externalSessionReady;
  const wqSessionBundle = useMemo(
    () => ({ hasIpmsSession, hasExternalSession, javaSessionReady }),
    [hasIpmsSession, hasExternalSession, javaSessionReady],
  );
  const hasSessionForMode = wqHasSessionForMode(mode, wqSessionBundle);
  const externalUrlInvalid = Boolean(pageUrl.trim() && !isHttpUrl(pageUrl));
  const ipmsUrlInvalid = Boolean(ipmsUrl.trim() && !isHttpUrl(ipmsUrl));

  const runnableSelectedCount = useMemo(
    () =>
      selectedIds.filter((id) => {
        const c = scenarios.find((s) => s.state_id === id);
        if (!c) return false;
        if (mode === "java-upload") return c.selectable;
        return isScenarioRunnable(c, mode, hasSessionForMode).runnable;
      }).length,
    [selectedIds, scenarios, mode, hasSessionForMode],
  );

  async function previewScenarios() {
    if (!selectedIds.length) {
      setPreviewMsg("미리볼 시나리오를 1개 이상 선택하세요.");
      setPreviewMsgTone("err");
      return;
    }
    if (mode === "java-upload") {
      if (!isValidDeployUrl(javaBaseUrl)) {
        setPreviewMsg("미리보기에는 배포 URL(http:// 또는 https://)이 필요합니다.");
        setPreviewMsgTone("err");
        return;
      }
      if (!scenarios.length) {
        setPreviewMsg("화면 시나리오가 없습니다. ZIP을 선택해 시나리오를 불러오세요.");
        setPreviewMsgTone("err");
        return;
      }
    } else if (runnableSelectedCount === 0) {
      setPreviewMsg("검증 가능한 시나리오가 없습니다. 세션·탭(공개/로그인)을 확인하세요.");
      setPreviewMsgTone("err");
      return;
    }
    setPreviewLoading(true);
    setPreviewMsg("");
    setPreviewMsgTone("ok");
    setPreviewItems([]);
    try {
      const fd = new FormData();
      appendCommonFields(fd);
      fd.set("state_ids", selectedIds.join(","));
      if ((isIpmsMode(mode) || mode === "java-upload") && scenarios.length) {
        fd.set("candidates_json", JSON.stringify(scenarios));
      }
      if (mode === "java-upload") {
        const deployUrl = javaBaseUrl.trim();
        fd.set("page_url", deployUrl);
        if (loginUrl.trim()) fd.set("login_url", loginUrl.trim());
        if (loginUsername.trim()) fd.set("login_username", loginUsername.trim());
        if (loginPassword.trim()) fd.set("login_password", loginPassword.trim());
        const javaSessionJobId = resolveWqBrowserSessionJobId(deployUrl, {
          sessionJobId,
          sessionPageUrl,
          javaLoginStatus,
          ipmsLoginStatus,
          externalLoginStatus,
        });
        if (javaSessionJobId) {
          fd.set("session_job_id", javaSessionJobId);
        }
        if (sessionStorageFile && sessionScope === "java-upload") {
          fd.set("session_storage", sessionStorageFile);
        }
      }
      const res = await postScanMultipart("v1/web-quality/scenarios/preview", fd);
      const j = await readJsonResponse(res);
      const rawItems = Array.isArray(j.items) ? j.items : [];
      const items = rawItems.map(
        (item: {
          state_id?: string;
          label?: string;
          ok?: boolean;
          open_ok?: boolean;
          error?: string;
          open_error?: string;
        }) => {
          let error = String(item.error || item.open_error || "");
          if (
            !(item.ok ?? item.open_ok) &&
            isJavaPreviewSessionError(error, javaSessionReady)
          ) {
            error = error.includes("로그인")
              ? error
              : error.match(/HTTP\s404/i)
                ? "로그인 세션 필요 — 배포 URL 로그인 후 다시 시도하세요."
                : `로그인 필요 — ${error.replace(/^HTTP 401\s*—\s*/, "")}`;
          }
          return {
            state_id: String(item.state_id || ""),
            label: String(item.label || item.state_id || ""),
            ok: Boolean(item.ok ?? item.open_ok),
            error,
          };
        },
      );
      if (!res.ok && !items.length) {
        throw new Error(
          Array.isArray(j.errors) ? j.errors.join("; ") : String(j.detail || "미리보기 실패"),
        );
      }
      setPreviewItems(items);
      const summary = j.summary as { ok?: number; fail?: number } | undefined;
      const ok = Number(summary?.ok ?? items.filter((i: { ok?: boolean }) => i.ok).length);
      const fail = Number(summary?.fail ?? items.length - ok);
      const loginFailed = items.some(
        (item: { ok?: boolean; error?: string }) =>
          !item.ok && isJavaPreviewSessionError(String(item.error || ""), javaSessionReady),
      );
      const topErrors = Array.isArray(j.errors) ? j.errors.join("; ") : String(j.detail || "");
      const ipmsDirectBlocked = items.some(
        (item: { ok?: boolean; error?: string }) =>
          !item.ok && isIpmsDirectUrlPreviewError(String(item.error || "")),
      );
      if (mode === "java-upload" && ipmsDirectBlocked) {
        setJavaNeedLogin(false);
      } else if (mode === "java-upload" && (loginFailed || isLoginPreviewError(topErrors))) {
        setJavaNeedLogin(true);
        const hadSession = javaSessionReady;
        const authFailed = items.some(
          (item: { ok?: boolean; error?: string }) =>
            !item.ok && isLoginPreviewError(String(item.error || "")),
        );
        if (hadSession && authFailed) {
          setSessionJobId("");
          setSessionPageUrl("");
          setJavaLoginStatus("none");
          setIpmsLoginStatus("none");
          setSessionProgress(null);
          clearWqJavaBrowserSession();
          if (isStoredIpmsUrl(javaBaseUrl.trim())) clearWqIpmsBrowserSession();
        }
      }
      if (mode === "external" && (loginFailed || isLoginPreviewError(topErrors))) {
        setNeedLogin(true);
      }
      const formatted =
        mode === "java-upload"
          ? formatJavaPreviewResultMessage(ok, fail, items, topErrors)
          : {
              text: !res.ok || !j.ok
                ? topErrors
                  ? `미리보기 일부 실패 — 검증 가능 ${ok} / 실패 ${fail} (${topErrors})`
                  : `미리보기 완료 — 검증 가능 ${ok} / 실패 ${fail}`
                : `미리보기 완료 — 검증 가능 ${ok} / 실패 ${fail}`,
              tone: (fail > 0 || !res.ok ? "err" : "ok") as "ok" | "warn" | "err",
            };
      setPreviewMsg(formatted.text);
      setPreviewMsgTone(formatted.tone);
    } catch (e) {
      setPreviewMsg(String((e as Error).message || e));
      setPreviewMsgTone("err");
    } finally {
      setPreviewLoading(false);
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
      const exportScope = buildExportScope({
        mode: exportScopeMode,
        tab,
        statusFilter: exportScopeMode === "tab" ? statusFilter : [],
        query: exportScopeMode === "tab" ? query : "",
        captureCategory: tab === "captures" ? captureCategory : undefined,
        captureIssuesOnly: tab === "captures" ? captureIssuesOnly : undefined,
      });
      const postExport = (payload: ScanResult) =>
        fetchScanApi("v1/web-quality/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format, payload, export_scope: exportScope }),
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

  const canExport = Boolean((result || lastJobId) && !isBusyHere && !exportBusy);

  const loadHistoryRecord = useCallback(async (jobId: string, recordMode?: string) => {
    const loadMode = mode;
    setBusyByMode((prev) => ({ ...prev, [loadMode]: true }));
    setMsg("");
    try {
      const res = await fetchScanApi(`v1/web-quality/history/${jobId}`);
      const j = await readJsonResponse(res);
      if (!res.ok || !j.payload) {
        throw new Error(String(j.detail || `이력 불러오기 실패 (HTTP ${res.status})`));
      }
      const payload = j.payload as ScanResult;
      let scanMode = (recordMode as string) || (payload.mode as string) || mode;
      if (scanMode === "ipms-public" || scanMode === "ipms-auth") {
        scanMode = "ipms-online";
      }
      if (
        scanMode === "ipms-online" ||
        scanMode === "external" ||
        scanMode === "java-upload"
      ) {
        if (scanMode === "ipms-online" && (!ipmsEnabled || !ipmsUnlocked)) {
          setMsg(
            ipmsEnabled
              ? "IPMS 이력 — IPMS 탭 선택 후 2차 암호를 입력해야 열람할 수 있습니다."
              : "IPMS 이력은 정식 암호(30일) 또는 MP-F 발급 코드 로그인 후 열람할 수 있습니다.",
          );
          return;
        }
        setMode(scanMode as ScanMode);
        setResultsByMode((prev) => ({ ...prev, [scanMode as ScanMode]: payload }));
        setJobIdsByMode((prev) => ({ ...prev, [scanMode as ScanMode]: jobId }));
        setTab("all");
        setMsg(`이력 불러옴 — ${payload.findings.length}건 (${formatUtcIsoToKst(payload.scanned_at, "")})`);
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      }
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusyByMode((prev) => {
        const next = { ...prev };
        delete next[loadMode];
        return next;
      });
    }
  }, [mode, ipmsEnabled, ipmsUnlocked]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; jobId?: string; mode?: string };
      if (data?.type === "web-quality-load-history" && data.jobId) {
        void loadHistoryRecord(data.jobId, data.mode);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadHistoryRecord]);

  useEffect(() => {
    if (tab === "uiux" && statusPreset === "all" && statusFilter.length === 0) {
      setStatusPreset("issues");
      setStatusFilter([...WQ_STATUS_PRESETS.issues]);
    }
  }, [tab, statusPreset, statusFilter.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loadId = params.get("load");
    if (!loadId) return;
    void loadHistoryRecord(loadId, params.get("mode") || undefined);
    window.history.replaceState({}, "", "/apps/web-quality");
  }, [loadHistoryRecord]);

  useEffect(() => {
    const cat = tabToCategory(tab);
    if (cat) setCaptureCategory(cat);
  }, [tab]);

  const filteredFindings = useMemo(() => {
    if (!result) return [] as Finding[];
    let list = result.findings;
    if (tab === "standard") list = list.filter((f) => f.category === "standard");
    else if (tab === "compat") list = list.filter((f) => f.category === "compat");
    else if (tab === "a11y") list = list.filter((f) => f.category === "a11y");
    else if (tab === "uiux") list = list.filter((f) => f.category === "uiux");
    else if (tab === "not_scanned")
      list = list.filter((f) => f.status === "not_scanned");
    else if (tab === "manual")
      list = list.filter((f) => f.status === "manual" || f.status === "na");
    else if (tab === "diff") list = result?.diff?.new ?? [];
    else if (tab === "captures") list = [];
    if (!["not_scanned", "manual", "captures", "diff"].includes(tab)) {
      list = list.filter((f) => findingMatchesStatusFilter(f, statusFilter));
    }
    return list.filter((f) => findingMatchesSearch(f, query, fixGuides));
  }, [result, tab, query, fixGuides, statusFilter]);

  const captureScopeFindings = useMemo(() => {
    if (!result || tab !== "captures") return [] as Finding[];
    const cat = captureCategory === "all" ? null : captureCategory;
    return filterFindingsByScope(result.findings, {
      category: cat,
      statuses: captureIssuesOnly ? ["fail", "review"] : statusFilter,
      issuesOnly: captureIssuesOnly,
    });
  }, [result, tab, captureCategory, captureIssuesOnly, statusFilter]);

  const filteredCaptures = useMemo(() => {
    const shots = result?.screenshots ?? [];
    if (!result || tab !== "captures") {
      return {
        state: shots.filter((s) => s.kind === "state"),
        element: shots.filter((s) => s.kind === "element"),
        stats: {
          total: 0,
          screenFindings: 0,
          sourceFindings: 0,
          uniqueStates: 0,
          elementShots: 0,
        },
      };
    }
    const cat = captureCategory === "all" ? null : captureCategory;
    if (!captureIssuesOnly && !cat && !statusFilter.length) {
      const all = filterCapturesForFindings(shots, result.findings);
      return all;
    }
    return filterCapturesForFindings(shots, captureScopeFindings);
  }, [result, tab, captureCategory, captureIssuesOnly, statusFilter, captureScopeFindings]);

  const stateCaptures = filteredCaptures.state;
  const elementCaptures = filteredCaptures.element;
  const captureStats = filteredCaptures.stats;

  const resultScreens = useMemo(
    () => result?.coverage?.screens ?? [],
    [result?.coverage?.screens],
  );

  const screenIndexMap = useMemo(
    () => buildScreenIndexMap(result?.screenshots ?? [], resultScreens),
    [result?.screenshots, resultScreens],
  );

  const skippedSelectedPreview = useMemo(
    () =>
      mode === "java-upload"
        ? []
        : selectedIds
            .filter((id) => {
              const c = scenarios.find((s) => s.state_id === id);
              if (!c) return false;
              return !isScenarioRunnable(c, mode, hasSessionForMode).runnable;
            })
            .map((id) => scenarios.find((s) => s.state_id === id)?.label || id)
            .slice(0, 6),
    [selectedIds, scenarios, mode, hasSessionForMode],
  );

  const jumpToCapture = useCallback((stateId: string) => {
    setCaptureFocusId(stateId);
    setTab("captures");
    setCaptureCategory("all");
    setCaptureIssuesOnly(false);
  }, []);

  useEffect(() => {
    if (tab !== "captures") setCaptureFocusId(null);
  }, [tab]);

  useEffect(() => {
    if (tab !== "captures" || !captureFocusId) return;
    const timer = window.setTimeout(() => {
      captureCardRefs.current[captureFocusId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [tab, captureFocusId, stateCaptures.length]);

  const displayStateCaptures = useMemo(() => {
    if (!captureFocusId) return stateCaptures;
    const hit = stateCaptures.filter((s) => s.state_id === captureFocusId);
    return hit.length ? hit : stateCaptures;
  }, [stateCaptures, captureFocusId]);

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
    [scenarios],
  );

  const displayScenarios = useMemo(() => {
    if (mode === "java-upload") return selectableScenarios;
    return scenarios;
  }, [mode, scenarios, selectableScenarios]);

  const javaStaticInspectCount = useMemo(() => {
    if (mode !== "java-upload" || !scenarioLoaded) return 0;
    const stats = lastScenarioPayload?.file_stats;
    if (!stats) return 0;
    return stats.static_views ?? stats.views ?? 0;
  }, [mode, scenarioLoaded, lastScenarioPayload]);

  const javaRuntimeDiagnosisAvailable = useMemo(() => {
    if (mode !== "java-upload") return true;
    if (!scenarioLoaded) return false;
    return selectableScenarios.length > 0;
  }, [mode, scenarioLoaded, selectableScenarios.length]);

  const javaLoginPanelVisible = useMemo(() => {
    if (mode !== "java-upload") return false;
    return javaNeedLogin;
  }, [mode, javaNeedLogin]);

  const javaPreviewIpmsDirectBlocked = useMemo(
    () =>
      mode === "java-upload" &&
      previewItems.some(
        (item) => !item.ok && isIpmsDirectUrlPreviewError(String(item.error || "")),
      ),
    [mode, previewItems],
  );

  const javaSessionPanelBusy = useMemo(() => {
    if (mode !== "java-upload") return false;
    const st = scopedSessionProgress?.status;
    return st === "running" || st === "queued" || st === "checking";
  }, [mode, scopedSessionProgress?.status]);

  const javaKrdsInspectAvailable = useMemo(() => {
    if (mode !== "java-upload") return true;
    if (!scenarioLoaded) return true;
    if (selectableScenarios.length > 0) return true;
    return javaStaticInspectCount > 0;
  }, [mode, scenarioLoaded, selectableScenarios.length, javaStaticInspectCount]);

  useEffect(() => {
    if (mode === "java-upload" && scenarioLoaded && !javaRuntimeDiagnosisAvailable && includeRuntime) {
      setIncludeRuntime(false);
    }
  }, [mode, scenarioLoaded, javaRuntimeDiagnosisAvailable, includeRuntime]);

  useEffect(() => {
    if (mode === "java-upload" && scenarioLoaded && !javaKrdsInspectAvailable && includeKrds) {
      setIncludeKrds(false);
    }
  }, [mode, scenarioLoaded, javaKrdsInspectAvailable, includeKrds]);

  const checkableScenarioIds = useMemo(() => {
    if (mode === "java-upload") {
      return selectableScenarios.map((c) => c.state_id);
    }
    return selectableScenarios
      .filter((c) => {
        const isAuth = (c.access || "public").toLowerCase() === "auth";
        return !(isAuth && !hasSessionForMode);
      })
      .map((c) => c.state_id);
  }, [selectableScenarios, mode, hasSessionForMode]);

  const scenarioPanel =
    mode === "java-upload" && !zipFile ? null : mode === "external" && scenarioLoaded && !displayScenarios.length ? (
      <div className="wq-alert">
        <p>선택 가능한 화면 없음</p>
        <ul>
          {scenarioWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
          <li>2단계 인증·로그인 필요 링크는 자동 제외됩니다.</li>
        </ul>
      </div>
    ) : scenarioLoaded && displayScenarios.length ? (
      <div className="wq-scenario-block">
        <div className="wq-scenario-head">
          <h3>
            화면 시나리오
            {isIpmsMode(mode) && scenarioSourceLabel ? (
              <span className="wq-scenario-source"> (출처: {scenarioSourceLabel})</span>
            ) : null}
          </h3>
            <div className="btn-row">
              <button
                type="button"
                className="btn ghost"
                disabled={
                  previewLoading ||
                  !selectedIds.length ||
                  (mode === "java-upload"
                    ? !isValidDeployUrl(javaBaseUrl) || !selectableScenarios.length
                    : runnableSelectedCount === 0)
                }
                onClick={() => void previewScenarios()}
              >
                {previewLoading ? "화면 여는 중…" : "선택 시나리오 미리보기"}
              </button>
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
                disabled={javaZipBusy || !zipFile}
                onClick={() => void loadJavaScenarios(zipFile ?? undefined, true)}
              >
                {javaZipBusy ? "읽는 중…" : "ZIP 다시 읽기"}
              </button>
            ) : null}
            {isIpmsMode(mode) ? (
              <button
                type="button"
                className="btn ghost"
                disabled={scenarioBusy}
                onClick={() =>
                  void loadIpmsScenarios({
                    source: ipmsScenarioSource,
                    resetSelection: ipmsScenarioSource === "url",
                  })
                }
              >
                {scenarioBusy
                  ? "새로고침 중…"
                  : ipmsScenarioSource === "zip"
                    ? "URL vs ZIP 비교"
                    : "시나리오 다시 적용"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() => setSelectedIds([...checkableScenarioIds])}
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
        {mode === "java-upload" ? (
          <p className="hint">
            JSP/HTML 정적 진단은 URL 없이. 화면 캡처는 배포 URL + 「화면 진단 포함」.
            권장 화면은 ZIP 읽기 후 자동 선택됩니다. 「선택 시나리오 미리보기」로 열기를 확인하세요.
            로그인 패널은 401·세션 만료 등 <strong>실제 로그인 오류</strong>일 때만 표시됩니다.
            {isStoredIpmsUrl(javaBaseUrl.trim()) ? (
              <>
                {" "}
                IPMS 배포 URL은 @GetMapping 직링크가 「비정상적인 접근」으로 차단되어
                미리보기 실패가 <strong>로그인 문제가 아닙니다</strong>.
                화면 Playwright 진단은 「IPMS 온라인」 탭(GNB 메뉴)을 이용하세요.
              </>
            ) : (
              <> 로그인 오류(401 등)가 나오면 아래 로그인 세션을 만든 뒤 다시 시도하세요.</>
            )}
            {" "}
            JSP에서 id만 추출된 모달(다이얼로그)은 열기 동작이 없어 기본 선택·미리보기·화면 진단에서
            제외됩니다.
          </p>
        ) : mode === "external" ? (
          <p className="hint">
            O2 SPA는 MenuTree.js를 우선 분석하고, 없으면 Playwright 링크 탐색을 사용합니다.
            2단계 인증 등 접근 불가 화면은 제외됩니다.
          </p>
        ) : null}
        {scenarioWarnings.length && mode !== "ipms-online" ? (
          <ul className="hint">
            {scenarioWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {selectedIds.length > 0 && mode === "external" ? (
          <p className="hint">
            전체 {displayScenarios.length}건 · 선택 {selectedIds.length}개
            {runnableSelectedCount < selectedIds.length ? (
              <>
                {" "}
                · 검증 가능 {runnableSelectedCount}개
                {skippedSelectedPreview.length ? (
                  <> (검증 불가: {skippedSelectedPreview.join(", ")})</>
                ) : null}
              </>
            ) : null}
          </p>
        ) : selectedIds.length > 0 && !isIpmsMode(mode) ? (
          <p className="hint">
            선택 {selectedIds.length}개
            {runnableSelectedCount < selectedIds.length ? (
              <>
                {" "}
                · 검증 가능 {runnableSelectedCount}개
                {skippedSelectedPreview.length ? (
                  <> (검증 불가: {skippedSelectedPreview.join(", ")})</>
                ) : null}
              </>
            ) : null}
          </p>
        ) : null}
        <p className="hint">
          「선택 시나리오 미리보기」는 화면만 열어 검증 가능 여부를 확인합니다.
        </p>
        {previewMsg ? (
          <p className={`msg ${previewMsgTone}`}>{previewMsg}</p>
        ) : null}
        {javaPreviewIpmsDirectBlocked ? (
          <div className="wq-alert warn">
            <p>
              <strong>로그인 확인 화면이 나오지 않는 이유</strong>
            </p>
            <p>
              선택한 화면은 IPMS에서 주소창·@GetMapping 직접 접근이 차단됩니다. 세션이 있어도
              Playwright 미리보기는 열리지 않으며, 이는 로그인 실패가 아닙니다.
            </p>
            <ul>
              <li>
                <strong>정적 진단</strong> — JSP/HTML 소스 기준 (URL·로그인 불필요)
              </li>
              <li>
                <strong>IPMS 온라인 탭</strong> — GNB·메뉴 클릭으로 화면 진입 후 Playwright 진단
              </li>
            </ul>
            <div className="btn-row" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setJavaNeedLogin(true)}
              >
                로그인 세션 만들기 (401·세션 만료 시)
              </button>
            </div>
          </div>
        ) : null}
        {previewItems.length ? (
          <ul className="perf-scenario-preview-list">
            {previewItems.map((item) => (
              <li key={item.state_id} className={item.ok ? "ok" : "fail"}>
                <span className="perf-scenario-preview-label">{item.label || item.state_id}</span>
                <span className="perf-scenario-preview-meta">
                  {item.ok ? "열림" : item.error || "실패"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="wq-scenario-list">
          {displayScenarios.map((c) => {
            const checked = selectedIds.includes(c.state_id);
            const risks = (c.risk ?? [])
              .map((r) => RISK_LABEL[r] || r)
              .filter(Boolean);
            const access = (c.access || "public").toLowerCase();
            const isAuth = access === "auth";
            const authBlocked = mode !== "java-upload" && isAuth && !hasSessionForMode;
            const checkEnabled = c.selectable && !authBlocked;
            const run =
              mode === "java-upload"
                ? {
                    runnable: c.selectable,
                    reason: c.selectable
                      ? "미리보기로 확인"
                      : c.skip_reason || "선택 불가",
                  }
                : isScenarioRunnable(c, mode, hasSessionForMode);
            return (
              <li key={c.state_id}>
                <label className={`check-row ${checkEnabled ? "" : "is-disabled"}`}>
                  <input
                    type="checkbox"
                    checked={checkEnabled ? checked : false}
                    disabled={!checkEnabled}
                    onChange={() => {
                      if (!checkEnabled) return;
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
                      {isAuth ? (
                        <span className="perf-url-badge auth">로그인</span>
                      ) : (
                        <span className="perf-url-badge public">공개</span>
                      )}
                      <WqCheckBadge runnable={run.runnable} reason={run.reason} />
                      {c.recommended && c.selectable ? " · 권장" : ""}
                      {mode === "java-upload" &&
                      c.kind === "dialog" &&
                      c.recommended === false
                        ? " · 기본 제외"
                        : ""}
                      {risks.length ? ` · ${risks.join(", ")}` : ""}
                    </span>
                  </span>
                </label>
                <p className="wq-scenario-desc">
                  {formatScenarioDescription(
                    authBlocked
                      ? "로그인 세션 필요 — 「로그인 필요」 체크 후 세션 생성"
                      : c.selectable
                        ? c.description
                        : c.skip_reason || c.description,
                  )}
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
          KWCAG 2.2 · KRDS/UI·UX(2025.08) · IPMS·외부 URL·Java ZIP 화면 품질 진단.
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
        {ipmsEnabled === false ? (
          <p className="hint">
            <strong>IPMS(화면)</strong> 진단은{" "}
            <strong>정식 암호(30일)</strong> 또는 <code>MP-F-</code> 발급 코드로 로그인한 경우에만
            표시됩니다. 정적(소스) · 외부 URL(화면)은 체험 암호에서도 이용할 수 있습니다.
          </p>
        ) : null}
        <div className="tabs wq-mode-tabs" role="tablist">
          {ipmsEnabled ? (
            <>
              <button
                type="button"
                role="tab"
                className={`tab ${mode === "ipms-online" ? "active" : ""}`}
                aria-selected={mode === "ipms-online"}
                onClick={() => requestIpmsOnline()}
              >
                IPMS(화면)
              </button>
            </>
          ) : null}
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "java-upload" ? "active" : ""}`}
            aria-selected={mode === "java-upload"}
            onClick={() => switchMode("java-upload", { includeRuntime: false })}
          >
            정적(소스)
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${mode === "external" ? "active" : ""}`}
            aria-selected={mode === "external"}
            onClick={() => switchMode("external", { includeRuntime: true })}
          >
            외부 URL(화면)
          </button>
        </div>

        {ipmsEnabled && !ipmsUnlocked && mode === "ipms-online" ? (
          <div className="wq-step-block">
            <p className="hint">
              <strong>IPMS</strong> 진단을 사용하려면 암호 확인이 필요합니다.
            </p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={() => requestIpmsOnline()}>
                IPMS 암호 입력
              </button>
            </div>
          </div>
        ) : null}

        {ipmsEnabled && ipmsUnlocked && mode === "ipms-online" ? (
          <div className="wq-step-block">
            <p className="hint">
              <strong>전기사업정보시스템</strong> · 공개·로그인 시나리오를 동시에 선택할 수
              있습니다. 로그인 메뉴는 세션 JSON이 필요합니다.
            </p>
            <fieldset className="wq-ipms-source">
              <legend>화면 시나리오 가져오기</legend>
              <div className="wq-ipms-source-url-block">
                <label className="wq-ipms-source-option">
                  <input
                    type="radio"
                    name="ipms-scenario-source"
                    checked={ipmsScenarioSource === "url"}
                    onChange={() => setIpmsScenarioSource("url")}
                  />
                  접속 URL
                </label>
                <div className="wq-ipms-source-url-controls">
                  <input
                    type="url"
                    className="wq-ipms-source-input"
                    value={ipmsUrl}
                    onChange={(e) => {
                      setIpmsUrl(e.target.value);
                      setIpmsUrlApplyMsg("");
                      setIpmsUrlApplyTone("ok");
                      setIpmsFullUrlPayload(null);
                      ipmsAutoFetchKeyRef.current = "";
                    }}
                    placeholder={IPMS_DEFAULT_URL}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      scenarioBusy ||
                      ipmsScenarioSource !== "url" ||
                      ipmsUrlInvalid
                    }
                    onClick={() => void loadIpmsScenarios({ source: "url", resetSelection: true })}
                  >
                    {scenarioBusy && ipmsScenarioSource === "url" ? "적용 중…" : "적용"}
                  </button>
                </div>
                {ipmsScenarioSource === "url" && ipmsUrlInvalid ? (
                  <p className="msg err wq-ipms-source-url-validation">{HTTP_URL_REQUIRED_MSG}</p>
                ) : null}
                {ipmsScenarioSource === "url" && !ipmsUrlInvalid && ipmsUrlApplyMsg ? (
                  <p className={`msg wq-ipms-source-apply-msg-inline ${ipmsUrlApplyTone}`}>
                    {ipmsUrlApplyMsg}
                  </p>
                ) : null}
              </div>
              <div className="wq-ipms-source-row">
                <label className="wq-ipms-source-option">
                  <input
                    type="radio"
                    name="ipms-scenario-source"
                    checked={ipmsScenarioSource === "zip"}
                    onChange={() => {
                      setIpmsScenarioSource("zip");
                      if (ipmsSourceZip) {
                        void compareIpmsUrlAndZip(ipmsSourceZip);
                      }
                    }}
                  />
                  프론트 JS ZIP
                </label>
                <label className="wq-ipms-source-file">
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    disabled={ipmsScenarioSource !== "zip"}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setIpmsSourceZip(file);
                      if (file) {
                        setIpmsScenarioSource("zip");
                        void compareIpmsUrlAndZip(file);
                      } else {
                        setIpmsZipApplyMsg("");
                        setIpmsZipApplyTone("ok");
                        setIpmsFullZipPayload(null);
                      }
                    }}
                  />
                </label>
              </div>
              {ipmsScenarioSource === "zip" && ipmsSourceZip && ipmsZipApplyMsg ? (
                <p className={`msg wq-ipms-source-apply-msg ${ipmsZipApplyTone}`}>
                  {ipmsZipApplyMsg}
                </p>
              ) : null}
              <p className="hint wq-ipms-source-foot">
                시나리오는 소스를 분석해 추출합니다. ZIP 선택 시 접속 URL과 비교 창이 열립니다.
              </p>
            </fieldset>
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
            {accessAuth ? (
              <fieldset
                className={`wq-runtime-block wq-session-fieldset${hasIpmsSession ? " is-ready" : " is-pending"}`}
                style={{ marginTop: "0.75rem" }}
                disabled={!accessAuth}
              >
                <legend className="hint" style={{ marginBottom: "0.5rem" }}>
                  <strong>로그인 세션</strong>
                  {ipmsLoginStatus === "ok" ? (
                    <span className="wq-chip ok" style={{ marginLeft: "0.5rem" }}>
                      로그인 완료 — 로그인 시나리오 선택 가능
                    </span>
                  ) : ipmsLoginStatus === "fail" ? (
                    <span className="wq-chip err" style={{ marginLeft: "0.5rem" }}>
                      로그인 실패
                    </span>
                  ) : ipmsLoginStatus === "checking" ? (
                    <span className="wq-chip warn" style={{ marginLeft: "0.5rem" }}>
                      확인 중…
                    </span>
                  ) : (
                    <span className="wq-chip warn" style={{ marginLeft: "0.5rem" }}>
                      {LOGIN_SESSION_NOT_READY}
                    </span>
                  )}
                </legend>
                <p className="hint">
                  공동인증서(2단계)는 세션 JSON 업로드를 권장합니다.
                </p>
                <div className="wq-session-methods" role="radiogroup" aria-label="로그인 세션 방식">
                  <label className="wq-ipms-source-option">
                    <input
                      type="radio"
                      name="ipms-login-session"
                      checked={loginSessionMode === "browser"}
                      onChange={() => setLoginSessionMode("browser")}
                    />
                    로그인 세션 자동 생성
                  </label>
                  {loginSessionMode === "browser" ? (
                    <div className="wq-session-method-body">
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            !accessAuth ||
                            scopedSessionProgress?.status === "running" ||
                            scopedSessionProgress?.status === "queued"
                          }
                          onClick={() => void startIpmsSession()}
                        >
                          {scopedSessionProgress?.status === "running" ||
                          scopedSessionProgress?.status === "queued"
                            ? "로그인 창 대기 중…"
                            : "로그인 창 띄움"}
                        </button>
                      </div>
                      {scopedSessionProgress ? (
                        <div className="run-progress source-scan-progress">
                          <div
                            className="progress-bar"
                            role="progressbar"
                            aria-valuenow={Math.round(scopedSessionProgress.pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className="progress-fill"
                              style={{ width: `${scopedSessionProgress.pct}%` }}
                            />
                          </div>
                          <p className="hint">
                            {Math.round(scopedSessionProgress.pct)}% · {scopedSessionProgress.message}
                          </p>
                          {scopedSessionProgress.status === "running" ||
                          scopedSessionProgress.status === "queued" ? (
                            <p className="hint">
                              창이 뒤에 가려지면 작업 표시줄 또는 Alt+Tab으로 창을 선택하세요.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="wq-ipms-source-option">
                    <input
                      type="radio"
                      name="ipms-login-session"
                      checked={loginSessionMode === "upload"}
                      onChange={() => setLoginSessionMode("upload")}
                    />
                    세션 JSON 업로드
                  </label>
                  {loginSessionMode === "upload" ? (
                    <div className="wq-session-method-body">
                      <label className="wq-ipms-source-file">
                        <input
                          type="file"
                          accept=".json,application/json"
                          disabled={!accessAuth}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (!file) {
                              setSessionStorageFile(null);
                              setIpmsLoginStatus("none");
                              activeSessionKeyRef.current = "";
                              return;
                            }
                            void validateIpmsSessionUpload(file);
                          }}
                        />
                      </label>
                      {ipmsLoginStatus === "checking" ? (
                        <p className="msg wq-session-status">로그인 세션 확인 중…</p>
                      ) : ipmsLoginStatus === "ok" ? (
                        <p className="msg ok wq-session-status">로그인 완료</p>
                      ) : ipmsLoginStatus === "fail" ? (
                        <p className="msg err wq-session-status">로그인 실패</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </fieldset>
            ) : null}
          </div>
        ) : mode === "java-upload" ? (
          <div className="wq-step-block">
            <p className="hint">
              Java/WAR <strong>ZIP</strong> — JSP·HTML <strong>정적</strong> 품질 진단 (URL
              불필요). 배포 URL이 있으면 「화면 진단 포함」으로 캡처 가능.
            </p>
            <div className="wq-ipms-source-row wq-java-zip-row">
              <span className="wq-ipms-source-option">Java 소스 ZIP</span>
              <label className="wq-ipms-source-file">
                <input
                  type="file"
                  accept=".zip,application/zip"
                  disabled={javaZipBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleJavaZipChange(file);
                  }}
                />
              </label>
            </div>
            {zipFile ? (
              <p className="hint wq-java-zip-result">
                {javaZipBusy ? "분석 중…" : formatJavaZipExtractLabel(javaZipExtractCount ?? 0)}
              </p>
            ) : null}
            <CloudLargeZipHint />
            <label
              className="check-row"
              style={{ marginTop: "0.75rem" }}
              title={
                !javaRuntimeDiagnosisAvailable && scenarioLoaded
                  ? "화면 시나리오(URL 매핑)가 없으면 Playwright 화면 진단을 사용할 수 없습니다."
                  : undefined
              }
            >
              <input
                type="checkbox"
                checked={includeRuntime}
                disabled={!javaRuntimeDiagnosisAvailable}
                onChange={(e) => setIncludeRuntime(e.target.checked)}
              />
              화면(Playwright) 진단 포함 — 배포 URL 필요
            </label>
            {includeRuntime || (scenarioLoaded && selectableScenarios.length > 0) ? (
              <div className="form-grid" style={{ marginTop: "0.5rem" }}>
                <label>
                  배포 URL
                  <input
                    type="url"
                    name="wq-java-deploy-url"
                    autoComplete="off"
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
            <fieldset className="wq-ipms-source">
              <legend>화면 시나리오 가져오기</legend>
              <div className="wq-ipms-source-url-block">
                <label className="wq-ipms-source-option">
                  <input type="radio" name="external-scenario-source" checked readOnly />
                  접속 URL
                </label>
                <div className="wq-ipms-source-url-controls">
                  <input
                    type="url"
                    className="wq-ipms-source-input"
                    value={pageUrl}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (normalizeWqPageUrl(next.trim()) !== normalizeWqPageUrl(pageUrl.trim())) {
                        externalCacheRef.current = null;
                        setScenarios([]);
                        setSelectedIds([]);
                        setScenarioLoaded(false);
                        setLastScenarioPayload(null);
                        setScenarioWarnings([]);
                        setNeedLogin(false);
                      }
                      setPageUrl(next);
                      setExternalSourceApplyMsg("");
                      setExternalSourceApplyTone("ok");
                    }}
                    placeholder={EXTERNAL_URL_PLACEHOLDER}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={scenarioBusy || !pageUrl.trim() || externalUrlInvalid}
                    onClick={() => void loadExternalScenarios()}
                  >
                    {scenarioBusy ? "적용 중…" : "적용"}
                  </button>
                </div>
                {externalUrlInvalid ? (
                  <p className="msg err wq-ipms-source-url-validation">{HTTP_URL_REQUIRED_MSG}</p>
                ) : null}
                {!externalUrlInvalid && externalSourceApplyMsg ? (
                  <p className={`msg wq-ipms-source-apply-msg-inline ${externalSourceApplyTone}`}>
                    {externalSourceApplyMsg}
                  </p>
                ) : null}
              </div>
              {discoverProgress ? (
                <div className="run-progress source-scan-progress wq-ipms-source-discover">
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
            </fieldset>
            <label className="check-row" style={{ marginTop: "0.75rem" }}>
              <input
                type="checkbox"
                checked={needLogin}
                onChange={(e) => setNeedLogin(e.target.checked)}
              />
              로그인 필요
            </label>
            {needLogin ? (
              <fieldset
                className={`wq-runtime-block wq-session-fieldset${hasExternalSession ? " is-ready" : " is-pending"}`}
                style={{ marginTop: "0.75rem" }}
              >
                <legend className="hint" style={{ marginBottom: "0.5rem" }}>
                  <strong>로그인 세션</strong>
                  {externalLoginStatus === "ok" ? (
                    <span className="wq-chip ok" style={{ marginLeft: "0.5rem" }}>
                      로그인 완료 — 로그인 시나리오 선택 가능
                    </span>
                  ) : externalLoginStatus === "fail" ? (
                    <span className="wq-chip err" style={{ marginLeft: "0.5rem" }}>
                      로그인 실패
                    </span>
                  ) : externalLoginStatus === "checking" ? (
                    <span className="wq-chip warn" style={{ marginLeft: "0.5rem" }}>
                      확인 중…
                    </span>
                  ) : (
                    <span className="wq-chip warn" style={{ marginLeft: "0.5rem" }}>
                      {LOGIN_SESSION_NOT_READY}
                    </span>
                  )}
                </legend>
                <p className="hint">
                  공동인증서(2단계)는 세션 JSON 업로드를 권장합니다.
                </p>
                <div className="wq-session-methods" role="radiogroup" aria-label="로그인 세션 방식">
                  <label className="wq-ipms-source-option">
                    <input
                      type="radio"
                      name="external-login-session"
                      checked={loginSessionMode === "browser"}
                      onChange={() => setLoginSessionMode("browser")}
                    />
                    로그인 세션 자동 생성
                  </label>
                  {loginSessionMode === "browser" ? (
                    <div className="wq-session-method-body">
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            !pageUrl.trim() ||
                            scopedSessionProgress?.status === "running" ||
                            scopedSessionProgress?.status === "queued"
                          }
                          onClick={() => void startExternalSession()}
                        >
                          {scopedSessionProgress?.status === "running" ||
                          scopedSessionProgress?.status === "queued"
                            ? "로그인 창 대기 중…"
                            : "로그인 창 띄움"}
                        </button>
                      </div>
                      {scopedSessionProgress ? (
                        <div className="run-progress source-scan-progress">
                          <div
                            className="progress-bar"
                            role="progressbar"
                            aria-valuenow={Math.round(scopedSessionProgress.pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className="progress-fill"
                              style={{ width: `${scopedSessionProgress.pct}%` }}
                            />
                          </div>
                          <p className="hint">
                            {Math.round(scopedSessionProgress.pct)}% · {scopedSessionProgress.message}
                          </p>
                          {scopedSessionProgress.status === "running" ||
                          scopedSessionProgress.status === "queued" ? (
                            <p className="hint">
                              창이 뒤에 가려지면 작업 표시줄 또는 Alt+Tab으로 창을 선택하세요.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="wq-ipms-source-option">
                    <input
                      type="radio"
                      name="external-login-session"
                      checked={loginSessionMode === "upload"}
                      onChange={() => setLoginSessionMode("upload")}
                    />
                    세션 JSON 업로드
                  </label>
                  {loginSessionMode === "upload" ? (
                    <div className="wq-session-method-body">
                      <label className="wq-ipms-source-file">
                        <input
                          type="file"
                          accept=".json,application/json"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (!file) {
                              setSessionStorageFile(null);
                              setExternalLoginStatus("none");
                              activeSessionKeyRef.current = "";
                              return;
                            }
                            setSessionScope("external");
                            setIpmsLoginStatus("none");
                            setSessionJobId("");
                            setSessionPageUrl(pageUrl.trim());
                            setSessionStorageFile(file);
                            clearWqIpmsBrowserSession();
                            clearWqExternalBrowserSession();
                            setExternalLoginStatus("ok");
                            setSessionProgress(null);
                          }}
                        />
                      </label>
                      {externalLoginStatus === "checking" ? (
                        <p className="msg wq-session-status">로그인 세션 확인 중…</p>
                      ) : externalLoginStatus === "ok" ? (
                        <p className="msg ok wq-session-status">로그인 완료</p>
                      ) : externalLoginStatus === "fail" ? (
                        <p className="msg err wq-session-status">로그인 실패</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </fieldset>
            ) : null}
          </div>
        )}

        {scenarioPanel}

        {javaLoginPanelVisible ? (
          <div className="wq-step-block" style={{ marginTop: "0.75rem" }}>
            <label className="check-row">
              <input
                type="checkbox"
                checked={javaNeedLogin}
                onChange={(e) => setJavaNeedLogin(e.target.checked)}
              />
              로그인 필요
            </label>
            <fieldset
              className={`wq-runtime-block wq-session-fieldset${javaSessionReady ? " is-ready" : " is-pending"}`}
              style={{ marginTop: "0.75rem" }}
            >
                <legend className="hint" style={{ marginBottom: "0.5rem" }}>
                  <strong>로그인 세션</strong>
                  {javaSessionReady ? (
                    <span className="wq-chip ok" style={{ marginLeft: "0.5rem" }}>
                      로그인 완료 — 화면 미리보기·진단 가능
                    </span>
                  ) : javaLoginStatus === "fail" ? (
                    <span className="wq-chip err" style={{ marginLeft: "0.5rem" }}>
                      로그인 실패
                    </span>
                  ) : javaSessionPanelBusy || javaLoginStatus === "checking" ? (
                    <span className="wq-chip warn" style={{ marginLeft: "0.5rem" }}>
                      확인 중…
                    </span>
                  ) : (
                    <span className="wq-chip warn" style={{ marginLeft: "0.5rem" }}>
                      배포 URL 로그인 후 「선택 시나리오 미리보기」를 다시 실행하세요.
                    </span>
                  )}
                </legend>
                <p className="hint">
                  공동인증서(2단계)는 세션 JSON 업로드를 권장합니다.
                </p>
                <div className="wq-session-methods" role="radiogroup" aria-label="로그인 세션 방식">
                  <label className="wq-ipms-source-option">
                    <input
                      type="radio"
                      name="java-login-session"
                      checked={loginSessionMode === "browser"}
                      onChange={() => setLoginSessionMode("browser")}
                    />
                    로그인 세션 자동 생성
                  </label>
                  {loginSessionMode === "browser" ? (
                    <div className="wq-session-method-body">
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            !isValidDeployUrl(javaBaseUrl) ||
                            scopedSessionProgress?.status === "running" ||
                            scopedSessionProgress?.status === "queued"
                          }
                          onClick={() => void startJavaSession()}
                        >
                          {scopedSessionProgress?.status === "running" ||
                          scopedSessionProgress?.status === "queued"
                            ? "로그인 창 대기 중…"
                            : "로그인 창 띄움"}
                        </button>
                      </div>
                      {scopedSessionProgress ? (
                        <div className="run-progress source-scan-progress">
                          <div
                            className="progress-bar"
                            role="progressbar"
                            aria-valuenow={Math.round(scopedSessionProgress.pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className="progress-fill"
                              style={{ width: `${scopedSessionProgress.pct}%` }}
                            />
                          </div>
                          <p className="hint">
                            {Math.round(scopedSessionProgress.pct)}% · {scopedSessionProgress.message}
                          </p>
                          {scopedSessionProgress.status === "running" ||
                          scopedSessionProgress.status === "queued" ? (
                            <p className="hint">
                              창이 뒤에 가려지면 작업 표시줄 또는 Alt+Tab으로 창을 선택하세요.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="wq-ipms-source-option">
                    <input
                      type="radio"
                      name="java-login-session"
                      checked={loginSessionMode === "upload"}
                      onChange={() => setLoginSessionMode("upload")}
                    />
                    세션 JSON 업로드
                  </label>
                  {loginSessionMode === "upload" ? (
                    <div className="wq-session-method-body">
                      <label className="wq-ipms-source-file">
                        <input
                          type="file"
                          accept=".json,application/json"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (!file) {
                              setSessionStorageFile(null);
                              setJavaLoginStatus("none");
                              activeSessionKeyRef.current = "";
                              return;
                            }
                            setSessionScope("java-upload");
                            setIpmsLoginStatus("none");
                            setExternalLoginStatus("none");
                            setSessionJobId("");
                            setSessionPageUrl(javaBaseUrl.trim());
                            setSessionStorageFile(file);
                            clearWqIpmsBrowserSession();
                            clearWqExternalBrowserSession();
                            clearWqJavaBrowserSession();
                            setJavaLoginStatus("ok");
                            setSessionProgress(null);
                          }}
                        />
                      </label>
                      {javaLoginStatus === "checking" ? (
                        <p className="msg wq-session-status">로그인 세션 확인 중…</p>
                      ) : javaSessionReady ? (
                        <p className="msg ok wq-session-status">로그인 완료</p>
                      ) : javaLoginStatus === "fail" ? (
                        <p className="msg err wq-session-status">로그인 실패</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </fieldset>
          </div>
        ) : null}

        <label
          className="check-row"
          style={{ marginTop: "0.75rem" }}
          title={
            mode === "java-upload" && scenarioLoaded && !javaKrdsInspectAvailable
              ? "JSP/HTML 정적 검사 대상이 없어 UI·UX(KRDS) 검증을 사용할 수 없습니다."
              : undefined
          }
        >
          <input
            type="checkbox"
            checked={includeKrds}
            disabled={mode === "java-upload" && scenarioLoaded && !javaKrdsInspectAvailable}
            onChange={(e) => setIncludeKrds(e.target.checked)}
          />
          UI·UX 검증 포함(검증기준 : UI/UX(KRDS)가이드라인(2025.08))
        </label>


        {!(activeScanProgress || discoverProgress) &&
        designCheck.message &&
        !designCheck.checking &&
        designCheck.message !== HTTP_URL_REQUIRED_MSG &&
        !(mode === "external" && externalUrlInvalid) &&
        !(isIpmsMode(mode) && ipmsUrlInvalid) &&
        (!designCheck.canRun ||
          (includeRuntime && designCheck.runtimeReady === false)) ? (
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

        <div className="source-scan-actions">
          <div className="source-scan-actions-primary">
            <button
              type="button"
              className="btn"
              disabled={anyScanBusy || (!designCheck.canRun && !designCheck.checking)}
              onClick={() => void runScan()}
            >
              {anyScanBusy
                ? isBusyHere
                  ? "진단 실행 중…"
                  : "다른 탭 진단 중…"
                : mode === "ipms-online"
                ? "IPMS 진단 실행"
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
            <button type="button" className="btn ghost" onClick={() => openWebQualityHistoryPopout()}>
              진단 이력
            </button>
          </div>
          <div className="source-scan-export-block">
            <p className="export-title">보고서 내보내기</p>
            <div className="wq-filter-bar wq-filter-bar-export">
              <span className="hint wq-filter-label">범위</span>
              <div className="wq-env-chips" role="group" aria-label="보고서 범위">
                <button
                  type="button"
                  className={`wq-chip ${exportScopeMode === "tab" ? "ok" : ""}`}
                  aria-pressed={exportScopeMode === "tab"}
                  onClick={() => setExportScopeMode("tab")}
                >
                  현재 탭{tab !== "all" ? ` (${RESULT_TAB_LABEL[tab]})` : ""}
                </button>
                <button
                  type="button"
                  className={`wq-chip ${exportScopeMode === "all" ? "ok" : ""}`}
                  aria-pressed={exportScopeMode === "all"}
                  onClick={() => setExportScopeMode("all")}
                >
                  전체
                </button>
              </div>
            </div>
            <p className="export-hint">
              HTML = 새 탭 미리보기 · HTML 저장 = .html 파일 · ZIP = html+xlsx 묶음
              {exportScopeMode === "tab" && result
                ? " · 현재 탭·상태·검색어 기준으로 findings·캡처만 포함"
                : ""}
            </p>
            <div className="btn-row">
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
                HTML 보기
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
            </div>
          </div>
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
        ) : isBusyHere && scanProgressHint ? (
          <p className="hint">{scanProgressHint}</p>
        ) : null}
        {msg &&
        !(mode === "java-upload" && zipFile && msg === javaZipStatusMsgRef.current) &&
        !(mode === "java-upload" && javaNeedLogin && javaSessionReady && msg === "로그인 완료") &&
        !(
          isIpmsMode(mode) &&
          accessAuth &&
          ipmsLoginStatus === "ok" &&
          msg === "로그인 완료"
        ) ? (
          <p className={`msg ${msg.includes("완료") || msg.includes("시나리오") ? "ok" : "err"}`}>
            {msg}
          </p>
        ) : null}
      </section>

      {result && !isBusyHere ? (
        <section className="panel">
          <h2>진단 결과</h2>
          <p className="hint">
            {result.target_name}
            {result.mode === "external"
              ? ` · 외부 URL · ${result.page_url || result.base_url}`
              : result.mode === "java-upload"
                ? ` · Java ZIP · ${result.page_url || "정적만"}`
                : result.mode === "ipms-online" ||
                    result.mode === "ipms-public" ||
                    result.mode === "ipms-auth"
                  ? ` · IPMS · ${result.page_url || result.base_url}`
                  : ` · ${result.page_url || result.base_url}`}{" "}
            · {formatUtcIsoToKst(result.scanned_at)}
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
              <span className="stat-label">검토</span>
              <strong>{stats?.review ?? 0}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">수동</span>
              <strong>{stats?.manual ?? 0}</strong>
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
              {" "}(동일 모드·URL의 직전 저장 진단과 비교)
            </p>
          ) : null}

          <div className="tabs" role="tablist">
            {(
              [
                ["all", "전체"],
                ["standard", "웹표준"],
                ["compat", "웹호환성"],
                ["a11y", "웹접근성"],
                ["uiux", "UI·UX(KRDS)"],
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
              <div className="wq-filter-bar wq-filter-bar-captures">
                <span className="hint wq-filter-label">분류</span>
                <div className="wq-env-chips" role="group" aria-label="캡처 분류">
                  {(
                    [
                      ["all", "전체"],
                      ["standard", "웹표준"],
                      ["compat", "웹호환성"],
                      ["a11y", "웹접근성"],
                      ["uiux", "UI·UX(KRDS)"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`wq-chip ${captureCategory === id ? "ok" : ""}`}
                      aria-pressed={captureCategory === id}
                      onClick={() => setCaptureCategory(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="check-row wq-capture-filter-check">
                  <input
                    type="checkbox"
                    checked={captureIssuesOnly}
                    onChange={(e) => setCaptureIssuesOnly(e.target.checked)}
                  />
                  미흡·검토 화면만
                </label>
                <span
                  className="hint wq-filter-count wq-capture-counts"
                  title="미흡·검토 건수 ≠ 화면+요소 합계. 화면=페이지 캡처 수, 요소=axe DOM 클로즈업 수(일부 미흡만)."
                >
                  미흡·검토 {captureStats.total}건
                  {captureStats.sourceFindings
                    ? ` (화면 ${captureStats.screenFindings} · 소스 ${captureStats.sourceFindings})`
                    : null}
                  {" · "}페이지 캡처 {captureStats.uniqueStates} · DOM 요소 {captureStats.elementShots}
                </span>
              </div>
              {captureFocusId ? (
                <p className="hint">
                  캡처 포커스: <code>{captureFocusId}</code>{" "}
                  <button type="button" className="btn ghost wq-capture-jump-btn" onClick={() => setCaptureFocusId(null)}>
                    전체 보기
                  </button>
                </p>
              ) : null}
              {!displayStateCaptures.length && !elementCaptures.length ? (
                <div className="wq-alert warn">
                  <p>
                    {captureIssuesOnly || captureCategory !== "all"
                      ? "조건에 맞는 캡처 없음 — 「미흡·검토 화면만」 해제 또는 분류를 「전체」로 바꿔 보세요."
                      : "화면 캡처 없음"}
                  </p>
                  <ul>
                    <li>
                      Playwright Chromium 설치:{" "}
                      <code>cd apps/api && python -m playwright install chromium</code>
                    </li>
                  </ul>
                </div>
              ) : null}
              {displayStateCaptures.length ? <h3>화면 전체</h3> : null}
              <div className="wq-capture-grid">
                {displayStateCaptures.map((shot) => {
                  const no = screenIndexMap.get(shot.state_id);
                  return (
                  <figure
                    key={shot.id}
                    ref={(el) => {
                      captureCardRefs.current[shot.state_id] = el;
                    }}
                    className={`wq-capture-card${captureFocusId === shot.state_id ? " is-focused" : ""}`}
                  >
                    {shot.data_url ? (
                      <button
                        type="button"
                        className="wq-capture-card-img-btn"
                        onClick={() =>
                          setCapturePreview({
                            dataUrl: shot.data_url!,
                            label: shot.label,
                            screenNo: no,
                          })
                        }
                      >
                        <img src={shot.data_url} alt={shot.label} loading="lazy" />
                      </button>
                    ) : null}
                    <figcaption>
                      {no ? (
                        <span className="wq-screen-no wq-capture-screen-no">#{no}</span>
                      ) : null}{" "}
                      <strong>{shot.label}</strong>
                      <span className="hint"> ({shot.state_id})</span>
                      <p>{shot.description}</p>
                    </figcaption>
                  </figure>
                  );
                })}
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
              <div className="wq-filter-bar wq-filter-bar-status">
                <span className="hint wq-filter-label">상태</span>
                <div className="wq-env-chips" role="group" aria-label="상태 필터">
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`wq-chip ${statusPreset === opt.id ? "ok" : ""}`}
                      aria-pressed={statusPreset === opt.id}
                      onClick={() => {
                        setStatusPreset(opt.id);
                        setStatusFilter([...WQ_STATUS_PRESETS[opt.id]]);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="hint wq-filter-count">
                  {filteredFindings.length}건
                  {statusFilter.length
                    ? ` (${statusFilter.map((s) => STATUS_LABEL[s] || s).join("·")})`
                    : " (전체)"}
                </span>
              </div>
              <label className="search-row">
                검색
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="상태(미흡·검토), 분류, 위치, 기준, 내용, 개선안, KRDS"
                />
              </label>
              <div className="table-wrap wq-result-table-wrap">
                <table className="result-table wq-result-table">
                  <thead>
                    <tr>
                      <th className="col-type">유형</th>
                      <th className="col-screen">화면</th>
                      <th className="col-loc">위치</th>
                      <th className="col-rule">기준</th>
                      <th className="col-cat">분류</th>
                      <th className="col-status">상태</th>
                      <th className="col-msg">내용</th>
                      <th className={tab === "manual" ? "col-review" : "col-fix"}>
                        {tab === "manual" ? "검토 위치" : "개선안"}
                      </th>
                      <th className="col-ref">관련근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFindings.slice(0, PAGE_SIZE).map((f) => {
                      const stateId = resolveFindingStateId(f);
                      const screenNo = stateId ? screenIndexMap.get(stateId) : undefined;
                      const shot =
                        result?.screenshots && stateId
                          ? resolveFindingScreenshot(f, result.screenshots)
                          : null;
                      return (
                        <tr key={f.id}>
                          <td className="col-type">{f.target === "source" ? "소스" : "화면"}</td>
                          <td className="col-screen">
                            <FindingScreenCell
                              finding={f}
                              screenNo={screenNo}
                              shot={shot}
                              onPreview={setCapturePreview}
                              onJumpCapture={jumpToCapture}
                            />
                          </td>
                          <td className="col-loc">
                            <FindingLocationCell finding={f} />
                          </td>
                          <td className="col-rule">{f.rule_id}</td>
                          <td className="col-cat">{CATEGORY_LABEL[f.category] || f.category}</td>
                          <td className="col-status">
                            <span className={`wq-status-${f.status}`}>
                              {STATUS_LABEL[f.status] || f.status}
                            </span>
                          </td>
                          <td className="col-msg">
                            {f.message}
                            {f.detail ? (
                              <p className="hint wq-finding-detail">{f.detail}</p>
                            ) : null}
                          </td>
                          <td className={tab === "manual" ? "col-review" : "col-fix"}>
                            {tab === "manual" ? (
                              <ReviewLocationCell
                                finding={f}
                                screens={resultScreens}
                                onJumpCapture={jumpToCapture}
                              />
                            ) : f.status === "fail" || f.status === "review" ? (
                              <FindingFixCell finding={f} guides={fixGuides} />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="col-ref">
                            {f.status === "fail" || f.status === "review" || f.status === "manual" ? (
                              <FindingRefCell finding={f} />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredFindings.length === 0 ? (
                <p className="hint">조건에 맞는 항목이 없습니다. 「전체」 상태 필터 또는 검색어를 바꿔 보세요.</p>
              ) : null}
              {filteredFindings.length > PAGE_SIZE ? (
                <p className="hint">상위 {PAGE_SIZE}건만 표시 — 전체는 Excel/ZIP 보고서 참고</p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {ipmsUnlockOpen ? (
        <div className="wq-ipms-unlock-overlay" role="presentation">
          <div className="panel wq-ipms-unlock-dialog" role="dialog" aria-labelledby="wq-ipms-unlock-title">
            <h2 id="wq-ipms-unlock-title">IPMS 진단 2차 암호</h2>
            <p className="hint">
              <strong>IPMS</strong> 공개·로그인 기능을 사용하려면 추가 암호를 입력하세요.
            </p>
            <label className="login-label">
              암호
              <input
                type="password"
                value={ipmsUnlockInput}
                onChange={(e) => setIpmsUnlockInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitIpmsUnlock();
                }}
                autoFocus
                disabled={ipmsUnlockBusy}
              />
            </label>
            {ipmsUnlockError ? <p className="msg err">{ipmsUnlockError}</p> : null}
            <div className="source-scan-actions-primary">
              <button
                type="button"
                className="btn primary"
                disabled={ipmsUnlockBusy || !ipmsUnlockInput.trim()}
                onClick={() => void submitIpmsUnlock()}
              >
                {ipmsUnlockBusy ? "확인 중…" : "확인"}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={ipmsUnlockBusy}
                onClick={() => {
                  setIpmsUnlockOpen(false);
                  setIpmsUnlockPending(null);
                  setIpmsUnlockError("");
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scenarioDiffOpen ? (
        <div className="wq-ipms-unlock-overlay" role="presentation">
          <div
            className="panel wq-scenario-diff-dialog"
            role="dialog"
            aria-labelledby="wq-scenario-diff-title"
          >
            <h2 id="wq-scenario-diff-title">접속 URL vs ZIP 시나리오 비교</h2>
            <p className="hint">
              <strong>접속 URL</strong>({ipmsUrl.trim() || IPMS_DEFAULT_URL})과{" "}
              <strong>ZIP</strong>
              {pendingZipFileName ? ` (${pendingZipFileName})` : ""}에서 추출한 화면 시나리오를
              비교합니다. 「ZIP 적용」 시 <strong>접속 URL</strong>에서 추출한 시나리오·선택 상태는
              브라우저 localStorage(
              <code>{SCENARIO_BACKUP_STORAGE_KEY}</code>)에 백업됩니다. 사전 정의 프리셋이
              아닙니다.
            </p>
            {(() => {
              const sum = diffSummary(scenarioDiffRows);
              return (
                <p className="hint wq-scenario-diff-summary">
                  추가 <strong className="wq-diff-added">{sum.added}</strong> · 삭제{" "}
                  <strong className="wq-diff-removed">{sum.removed}</strong> · 변경{" "}
                  <strong className="wq-diff-changed">{sum.changed}</strong> · 동일 {sum.same}
                </p>
              );
            })()}
            <div className="wq-scenario-diff-columns">
              <div>
                <h3 className="hint">접속 URL ({candidatesFromPayload(pendingUrlPayload || {}).length}개)</h3>
                <ul className="wq-scenario-diff-list">
                  {scenarioDiffRows
                    .filter((r) => r.status !== "added")
                    .map((r) => (
                      <li
                        key={`before-${r.state_id}`}
                        className={`wq-diff-row wq-diff-${r.status}`}
                      >
                        {r.beforeLabel || r.state_id}
                        {r.status === "changed" ? " →" : ""}
                      </li>
                    ))}
                </ul>
              </div>
              <div>
                <h3 className="hint">
                  ZIP{pendingZipFileName ? `: ${pendingZipFileName}` : ""} (
                  {candidatesFromPayload(pendingZipPayload || {}).length}개)
                </h3>
                <ul className="wq-scenario-diff-list">
                  {scenarioDiffRows
                    .filter((r) => r.status !== "removed")
                    .map((r) => (
                      <li
                        key={`after-${r.state_id}`}
                        className={`wq-diff-row wq-diff-${r.status}`}
                      >
                        {r.afterLabel || r.state_id}
                        {r.status === "changed" && r.beforeLabel !== r.afterLabel
                          ? ` (was: ${r.beforeLabel})`
                          : ""}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
            <div className="source-scan-actions-primary">
              <button
                type="button"
                className="btn primary"
                onClick={() => applyPendingIpmsScenarioRefresh()}
              >
                ZIP 적용
              </button>
              <button type="button" className="btn secondary" onClick={cancelPendingIpmsScenarioRefresh}>
                미적용 (URL 유지)
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <CapturePreviewModal
        open={Boolean(capturePreview)}
        payload={capturePreview}
        onClose={() => setCapturePreview(null)}
      />
    </main>
    </>
  );
}
