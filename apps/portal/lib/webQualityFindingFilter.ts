import type { FixGuideEntry } from "@/lib/webQualityFix";
import { resolveFindingFix } from "@/lib/webQualityFix";

export type WqFinding = {
  target: string;
  location: string;
  rule_id: string;
  category: string;
  status: string;
  message: string;
  fix?: string;
  fix_url?: string;
  ref_url?: string;
  ref_anchor?: string;
  ref_text?: string;
  ref_fallback_url?: string;
  kwcag_id?: string;
  screenshot_url?: string;
  guideline_url?: string;
  krds_ref?: string;
  rule_title?: string;
  detail?: string;
  state_label?: string;
  state_id?: string;
  axe_id?: string;
};

export const WQ_STATUS_LABEL: Record<string, string> = {
  pass: "통과",
  fail: "미흡",
  review: "검토",
  manual: "수동",
  not_scanned: "미실행",
  na: "해당없음",
};

export const WQ_CATEGORY_LABEL: Record<string, string> = {
  standard: "웹표준",
  compat: "웹호환성",
  a11y: "웹접근성",
  uiux: "UI·UX(KRDS)",
};

/** Quick presets for status filter (empty array = show all). */
export const WQ_STATUS_PRESETS = {
  all: [] as string[],
  issues: ["fail", "review"],
  fail: ["fail"],
  review: ["review"],
  pass: ["pass"],
  manual: ["manual", "na", "not_scanned"],
} as const;

const STATUS_QUERY_ALIASES: Record<string, string[]> = {
  미흡: ["fail"],
  검토: ["review"],
  통과: ["pass"],
  수동: ["manual"],
  미실행: ["not_scanned"],
  해당없음: ["na"],
};

function statusMatchesQuery(status: string, q: string): boolean {
  for (const [label, codes] of Object.entries(STATUS_QUERY_ALIASES)) {
    if (label.includes(q) || q.includes(label)) {
      if (codes.includes(status)) return true;
    }
  }
  const label = WQ_STATUS_LABEL[status]?.toLowerCase() || "";
  return label.includes(q);
}

function categoryMatchesQuery(category: string, q: string): boolean {
  const label = WQ_CATEGORY_LABEL[category]?.toLowerCase() || "";
  return category.toLowerCase().includes(q) || label.includes(q) || q.includes(label);
}

export function findingMatchesStatusFilter(
  finding: Pick<WqFinding, "status">,
  selected: string[],
): boolean {
  if (!selected.length) return true;
  return selected.includes(finding.status);
}

export function findingMatchesSearch(
  finding: WqFinding,
  rawQuery: string,
  fixGuides: Record<string, FixGuideEntry>,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  if (statusMatchesQuery(finding.status, q)) return true;
  if (categoryMatchesQuery(finding.category, q)) return true;

  const fix = resolveFindingFix(finding, fixGuides);
  const haystack = [
    finding.location,
    finding.rule_id,
    finding.message,
    finding.detail || "",
    finding.fix || "",
    finding.krds_ref || "",
    finding.rule_title || "",
    finding.state_label || "",
    finding.ref_url || "",
    finding.guideline_url || "",
    finding.fix_url || "",
    fix.text,
    WQ_STATUS_LABEL[finding.status] || "",
    WQ_CATEGORY_LABEL[finding.category] || "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export type ResultCategory = "standard" | "compat" | "a11y" | "uiux";

export function tabToCategory(tab: string): ResultCategory | null {
  if (tab === "standard" || tab === "compat" || tab === "a11y" || tab === "uiux") return tab;
  return null;
}

export function filterFindingsByScope(
  findings: WqFinding[],
  opts: { category?: string | null; statuses?: string[]; issuesOnly?: boolean },
): WqFinding[] {
  let list = findings;
  if (opts.category) list = list.filter((f) => f.category === opts.category);
  if (opts.statuses?.length) list = list.filter((f) => opts.statuses!.includes(f.status));
  if (opts.issuesOnly) list = list.filter((f) => f.status === "fail" || f.status === "review");
  return list;
}

export type WqScreenshot = {
  id: string;
  kind: "state" | "element";
  state_id: string;
  label: string;
  description?: string;
  finding_id?: string;
  selector?: string;
  data_url?: string;
};

export type CaptureFilterStats = {
  total: number;
  screenFindings: number;
  sourceFindings: number;
  uniqueStates: number;
  elementShots: number;
};

/** state_id → 1-based screen number (coverage order, then capture order). */
export function buildScreenIndexMap(
  screenshots: WqScreenshot[],
  screens?: { state_id: string }[],
): Map<string, number> {
  const order: string[] = [];
  for (const s of screens || []) {
    if (s.state_id && !order.includes(s.state_id)) order.push(s.state_id);
  }
  for (const shot of screenshots) {
    if (shot.kind === "state" && shot.state_id && !order.includes(shot.state_id)) {
      order.push(shot.state_id);
    }
  }
  return new Map(order.map((id, i) => [id, i + 1]));
}

export function resolveFindingScreenshot(
  finding: Pick<WqFinding, "target" | "location" | "state_id" | "screenshot_url"> & {
    state_id?: string;
    screenshot_url?: string;
  },
  screenshots: WqScreenshot[],
): { dataUrl: string; label: string; stateId: string } | null {
  if (finding.screenshot_url) {
    return {
      dataUrl: finding.screenshot_url,
      label: finding.location || "",
      stateId: resolveFindingStateId(finding),
    };
  }
  const stateId = resolveFindingStateId(finding);
  if (!stateId) return null;
  const stateShot = screenshots.find((s) => s.kind === "state" && s.state_id === stateId);
  if (stateShot?.data_url) {
    return { dataUrl: stateShot.data_url, label: stateShot.label, stateId };
  }
  return null;
}

export function resolveFindingStateId(
  finding: Pick<WqFinding, "target" | "location" | "state_id"> & { state_id?: string },
): string {
  if (finding.state_id) return finding.state_id;
  if (finding.target === "screen" && finding.location && !finding.location.includes("::")) {
    return finding.location;
  }
  const m = finding.location.match(/::\s*([a-z0-9_]+)\s*::/i);
  if (m?.[1]) return m[1];
  for (const part of finding.location.split("::")) {
    const p = part.trim();
    if (/^[a-z][a-z0-9_]*$/i.test(p) && !p.startsWith("http")) return p;
  }
  return "";
}

export function filterCapturesForFindings(
  screenshots: WqScreenshot[],
  findings: WqFinding[],
): { state: WqScreenshot[]; element: WqScreenshot[]; stats: CaptureFilterStats } {
  const stateIds = new Set<string>();
  const findingIds = new Set<string>();
  let screenFindings = 0;
  let sourceFindings = 0;
  for (const f of findings) {
    if (f.target === "source") {
      sourceFindings += 1;
      continue;
    }
    screenFindings += 1;
    const sid = resolveFindingStateId(f);
    if (sid) stateIds.add(sid);
    for (const rid of (f as WqFinding & { review_state_ids?: string[] }).review_state_ids || []) {
      stateIds.add(rid);
    }
    if ((f as WqFinding & { id?: string }).id) {
      findingIds.add(String((f as WqFinding & { id?: string }).id));
    }
  }
  if (!stateIds.size && !findingIds.size) {
    return {
      state: [],
      element: [],
      stats: { total: findings.length, screenFindings, sourceFindings, uniqueStates: 0, elementShots: 0 },
    };
  }
  const state = screenshots.filter((s) => s.kind === "state" && stateIds.has(s.state_id));
  const element = screenshots.filter(
    (s) => s.kind === "element" && s.finding_id && findingIds.has(s.finding_id),
  );
  return {
    state,
    element,
    stats: {
      total: findings.length,
      screenFindings,
      sourceFindings,
      uniqueStates: state.length,
      elementShots: element.length,
    },
  };
}

export function buildExportScope(opts: {
  mode: "all" | "tab";
  tab: string;
  statusFilter: string[];
  query?: string;
  captureCategory?: ResultCategory | "all";
  captureIssuesOnly?: boolean;
}): Record<string, unknown> {
  if (opts.mode === "all") return { mode: "all" };
  const category = tabToCategory(opts.tab);
  const scope: Record<string, unknown> = { mode: "tab", tab: opts.tab };
  if (opts.tab === "manual") {
    scope.statuses = ["manual", "na"];
  } else if (opts.tab === "not_scanned") {
    scope.statuses = ["not_scanned"];
  } else if (opts.tab === "diff") {
    scope.diff_only = true;
  } else if (opts.tab === "captures") {
    if (opts.captureCategory && opts.captureCategory !== "all") {
      scope.category = opts.captureCategory;
    }
    if (opts.captureIssuesOnly) {
      scope.issues_only = true;
    } else if (opts.statusFilter.length) {
      scope.statuses = [...opts.statusFilter];
    }
  } else {
    if (category) scope.category = category;
    if (opts.statusFilter.length) scope.statuses = [...opts.statusFilter];
  }
  const q = (opts.query || "").trim();
  if (opts.mode === "tab" && q) scope.query = q;
  return scope;
}

export function resolveReviewLocations(
  finding: WqFinding & { review_state_ids?: string[]; review_hint?: string },
  screens: { state_id: string; label: string; scanned?: boolean }[],
): string {
  const ids = finding.review_state_ids || [];
  if (!ids.length) {
    return finding.review_hint || "시나리오에 해당 화면을 추가하거나 아래 「검토 위치」 안내를 따르세요.";
  }
  const labels = ids.map((id) => {
    const scr = screens.find((s) => s.state_id === id);
    return scr ? `${scr.label} (${id})` : id;
  });
  const hint = finding.review_hint ? ` ${finding.review_hint}` : "";
  return `검토 화면: ${labels.join(", ")}.${hint}`;
}

export function isScenarioRunnable(
  c: { selectable: boolean; access?: string; skip_reason?: string },
  _mode: string,
  hasSession: boolean,
): { runnable: boolean; reason: string } {
  if (!c.selectable) {
    return { runnable: false, reason: c.skip_reason || "선택 불가" };
  }
  const access = (c.access || "public").toLowerCase();
  if (access === "auth" && !hasSession) {
    return { runnable: false, reason: "로그인 세션 필요" };
  }
  return { runnable: true, reason: "검증 가능" };
}

import {
  getRefLinksCatalog,
  resolveFindingRefLinks as resolveRefLinksCore,
  resolveFindingRefUrl,
} from "@/lib/webQualityRefLinks";

export function guidelineUiuxUrl(): string {
  return getRefLinksCatalog().guideline_uiux_url
    || "https://www.krds.go.kr/html/site/community/community_01_01.html?nttId=9";
}

export const GUIDELINE_UIUX_2025_URL = guidelineUiuxUrl();

export function withFindingRefFallback(finding: WqFinding): WqFinding {
  const refs = resolveFindingRefUrl(finding);
  const next: WqFinding = { ...finding };
  if (refs && !next.ref_url) next.ref_url = refs;
  if (finding.rule_id.startsWith("UX-KRDS-")) {
    next.guideline_url = finding.guideline_url || guidelineUiuxUrl();
  }
  return next;
}

export function resolveFindingRefLinks(
  finding: WqFinding,
): { label: string; url: string }[] {
  const f = withFindingRefFallback(finding);
  return resolveRefLinksCore(f).map(({ label, url }) => ({ label, url }));
}
