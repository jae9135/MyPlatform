/** Deep-link URLs for 관련근거 — loads catalog from API when available. */

export type RefLinksCatalog = {
  version?: string;
  guideline_uiux_url?: string;
  kwcag_base_url?: string;
  kwcag_anchors?: Record<string, string>;
  egov_wa_kwcag_map?: Record<string, string>;
  krds_fallbacks?: Record<string, string>;
  krds_rules?: Array<{
    id: string;
    ref_url?: string;
    ref_anchor?: string;
    ref_text?: string;
    ref_fallback_url?: string;
    resolved_ref_url?: string;
    resolved_ref_fallback_url?: string;
  }>;
};

const MIN_TEXT_FRAGMENT_LEN = 8;

/** Legacy ref_url paths that return KRDS 404 — ignore stored values. */
const BROKEN_REF_PATHS = [
  "/component/component_list.html",
  "/style/style_layout.html",
  "/style/style_intro.html",
  "/style/style_token.html",
  "/pattern/pattern_list.html",
];

export function isBrokenRefUrl(url: string): boolean {
  const u = (url || "").trim().toLowerCase();
  if (!u) return true;
  return BROKEN_REF_PATHS.some((p) => u.includes(p));
}

const STATIC_CATALOG: RefLinksCatalog = {
  guideline_uiux_url:
    "https://www.krds.go.kr/html/site/community/community_01_01.html?nttId=9",
  kwcag_base_url: "https://a11ykr.github.io/kwcag22/",
  kwcag_anchors: {
    "5.1.1": "non-text-content",
    "5.2.1": "providing-captions",
    "5.3.1": "table-structure",
    "5.3.2": "linear-structure",
    "5.3.3": "providing-instructions",
    "5.4.1": "use-of-color",
    "5.4.2": "audio-control",
    "5.4.3": "text-contrast",
    "5.4.4": "consistent-identification",
    "6.1.1": "keyboard",
    "6.1.2": "focus",
    "6.1.3": "target",
    "6.2.1": "timing-adjustable",
    "6.2.2": "pause-stop-hide",
    "6.3.1": "three-flashes-or-below-threshold",
    "6.4.1": "bypass-blocks",
    "6.4.2": "page-titled",
    "6.4.3": "link-text",
    "6.4.4": "page-break-navigation",
    "6.5.1": "pointer-gestures",
    "7.1.1": "language-of-page",
    "7.2.1": "change-on-request",
    "7.3.1": "labels-or-instructions",
    "7.3.2": "error-identification",
    "8.1.1": "parsing",
    "8.2.1": "accessible-web-application",
  },
  egov_wa_kwcag_map: {
    "WA-1.1.1": "5.1.1",
    "WA-1.2.1": "5.2.1",
    "WA-1.3.1": "5.4.1",
    "WA-1.3.2": "5.3.3",
    "WA-1.3.3": "5.4.3",
    "WA-1.3.4": "5.4.2",
    "WA-1.3.5": "5.4.4",
    "WA-2.1.1": "6.1.1",
    "WA-2.1.2": "6.1.2",
    "WA-2.1.3": "6.1.3",
    "WA-2.4.1": "6.4.1",
    "WA-2.4.2": "6.4.2",
    "WA-2.4.3": "6.4.3",
    "WA-3.1.1": "7.1.1",
    "WA-3.2.1": "7.2.1",
    "WA-3.3.1": "5.3.2",
    "WA-3.4.1": "7.3.1",
    "WA-3.4.2": "7.3.2",
    "WA-4.1.1": "8.1.1",
    "WA-4.2.1": "8.2.1",
    "WS-1.1": "8.1.1",
    "WS-1.3": "7.1.1",
    "WS-1.4": "8.2.1",
    "WC-2.1": "8.2.1",
  },
  krds_fallbacks: {
    component: "https://www.krds.go.kr/html/site/component/component_summary.html",
    style: "https://www.krds.go.kr/html/site/style/style_01.html",
    service: "https://www.krds.go.kr/html/site/service/service_04_01.html",
    global: "https://www.krds.go.kr/html/site/global/global_01.html",
    guideline:
      "https://www.krds.go.kr/html/site/community/community_01_01.html?nttId=9",
  },
};

let catalog: RefLinksCatalog = STATIC_CATALOG;

export function setRefLinksCatalog(next: RefLinksCatalog | null | undefined): void {
  catalog = next?.kwcag_anchors ? { ...STATIC_CATALOG, ...next } : STATIC_CATALOG;
}

export function getRefLinksCatalog(): RefLinksCatalog {
  return catalog;
}

export function guidelineUiuxUrl(): string {
  return (
    catalog.guideline_uiux_url ||
    STATIC_CATALOG.guideline_uiux_url ||
    "https://www.krds.go.kr/html/site/community/community_01_01.html?nttId=9"
  );
}

export const GUIDELINE_UIUX_2025_URL = guidelineUiuxUrl();

export function buildRefUrl(
  baseUrl: string,
  opts?: { anchor?: string; refText?: string; allowTextFragment?: boolean },
): string {
  const url = (baseUrl || "").trim().replace(/#$/, "");
  if (!url) return "";
  const anchor = (opts?.anchor || "").trim();
  const refText = (opts?.refText || "").trim();
  const allowText = opts?.allowTextFragment !== false;
  if (anchor) {
    return url + (anchor.startsWith("#") ? anchor : `#${anchor}`);
  }
  if (allowText && refText.length >= MIN_TEXT_FRAGMENT_LEN) {
    return `${url}#:~:text=${encodeURIComponent(refText)}`;
  }
  return url;
}

function inferKrdsFallback(baseUrl: string): string {
  const fb = catalog.krds_fallbacks || STATIC_CATALOG.krds_fallbacks!;
  const path = baseUrl.toLowerCase();
  if (path.includes("/component/")) return fb.component;
  if (path.includes("/style/")) return fb.style;
  if (path.includes("/service/")) return fb.service;
  if (path.includes("/global/")) return fb.global;
  return fb.guideline;
}

function krdsRuleFromCatalog(ruleId: string) {
  return (catalog.krds_rules || []).find((r) => r.id === ruleId);
}

export function resolveRuleRefUrls(input: {
  rule_id?: string;
  category?: string;
  ref_url?: string;
  ref_anchor?: string;
  ref_text?: string;
  ref_fallback_url?: string;
  kwcag_id?: string;
}): { primary: string; fallback: string } {
  const ruleId = (input.rule_id || "").trim();
  const category = input.category || "";
  let refUrl = (input.ref_url || "").trim();
  let refAnchor = (input.ref_anchor || "").trim();
  let refText = (input.ref_text || "").trim();
  let refFallback = (input.ref_fallback_url || "").trim();

  if (ruleId.startsWith("UX-KRDS-")) {
    const catRule = krdsRuleFromCatalog(ruleId);
    if (catRule) {
      refUrl = refUrl || (catRule.resolved_ref_url || catRule.ref_url || "").trim();
      refFallback =
        refFallback ||
        (catRule.resolved_ref_fallback_url || catRule.ref_fallback_url || "").trim();
      refAnchor = refAnchor || (catRule.ref_anchor || "").trim();
      refText = refText || (catRule.ref_text || "").trim();
    }
    if (refUrl) {
      const primary = buildRefUrl(refUrl, { anchor: refAnchor, refText });
      const fallback = refFallback || inferKrdsFallback(refUrl);
      return { primary, fallback };
    }
    const g = catalog.guideline_uiux_url || STATIC_CATALOG.guideline_uiux_url!;
    return {
      primary: g,
      fallback: catalog.krds_fallbacks?.component || inferKrdsFallback(g),
    };
  }

  let kwcagId = (input.kwcag_id || "").trim();
  const egovMap = catalog.egov_wa_kwcag_map || STATIC_CATALOG.egov_wa_kwcag_map!;
  const anchors = catalog.kwcag_anchors || STATIC_CATALOG.kwcag_anchors!;
  if (!kwcagId && ruleId.startsWith("WA-")) {
    kwcagId = egovMap[ruleId] || "";
  }
  if (!kwcagId && /^\d+\.\d+/.test(ruleId)) {
    kwcagId = ruleId;
  }
  if (kwcagId) {
    const anchor = anchors[kwcagId];
    if (anchor) {
      const base = (catalog.kwcag_base_url || STATIC_CATALOG.kwcag_base_url!).replace(/\/$/, "");
      return { primary: `${base}/#${anchor}`, fallback: base };
    }
  }

  if (category === "uiux") {
    const g = catalog.guideline_uiux_url || STATIC_CATALOG.guideline_uiux_url!;
    return { primary: g, fallback: inferKrdsFallback(g) };
  }
  return { primary: "", fallback: "" };
}

export function resolveFindingRefUrl(finding: {
  rule_id?: string;
  kwcag_id?: string;
  category?: string;
  ref_url?: string;
  ref_anchor?: string;
  ref_text?: string;
  ref_fallback_url?: string;
}): string | undefined {
  const fromCatalog = resolveRuleRefUrls(finding).primary;
  if (fromCatalog) return fromCatalog;
  const stored = (finding.ref_url || "").trim();
  if (stored && !isBrokenRefUrl(stored)) {
    if (stored.includes("#")) return stored;
    const anchor = (finding.ref_anchor || "").trim();
    const refText = (finding.ref_text || "").trim();
    if (anchor || refText) {
      return buildRefUrl(stored, { anchor, refText });
    }
    return stored;
  }
  return undefined;
}

export type RefLinkItem = { label: string; url: string; kind: "primary" | "fallback" | "guideline" | "axe" };

type FindingRefKind = "krds" | "a11y" | "other";

function classifyFindingRefKind(finding: {
  rule_id?: string;
  kwcag_id?: string;
  category?: string;
}): FindingRefKind {
  const ruleId = (finding.rule_id || "").trim();
  if (ruleId.startsWith("UX-KRDS-") || finding.category === "uiux") return "krds";
  if (
    finding.category === "a11y" ||
    finding.kwcag_id ||
    ruleId.startsWith("WA-") ||
    /^\d+\.\d+/.test(ruleId)
  ) {
    return "a11y";
  }
  return "other";
}

function isKwcagRefUrl(url: string): boolean {
  const u = (url || "").trim().toLowerCase();
  return u.includes("kwcag") || u.includes("a11ykr.github.io");
}

export function resolveFindingRefLinks(finding: {
  rule_id?: string;
  kwcag_id?: string;
  category?: string;
  ref_url?: string;
  ref_anchor?: string;
  ref_text?: string;
  ref_fallback_url?: string;
  guideline_url?: string;
  fix_url?: string;
}): RefLinkItem[] {
  const urls = resolveRuleRefUrls(finding);
  const primary = urls.primary || resolveFindingRefUrl(finding) || "";
  const storedFallback = (finding.ref_fallback_url || "").trim();
  const fallback =
    (storedFallback && !isBrokenRefUrl(storedFallback) ? storedFallback : "") ||
    urls.fallback;
  const links: RefLinkItem[] = [];
  const refKind = classifyFindingRefKind(finding);

  const primaryLabel =
    refKind === "krds"
      ? "KRDS 관련근거"
      : refKind === "a11y"
        ? "KWCAG 관련근거"
        : "관련근거";

  if (primary) {
    links.push({ label: primaryLabel, url: primary, kind: "primary" });
  }
  if (fallback && fallback.split("#")[0] !== primary.split("#")[0]) {
    const fallbackLabel =
      refKind === "a11y" || isKwcagRefUrl(fallback)
        ? "KWCAG 목록 (대체)"
        : refKind === "krds"
          ? "KRDS 목록 (대체)"
          : "목록 (대체)";
    links.push({ label: fallbackLabel, url: fallback, kind: "fallback" });
  }
  if (refKind === "krds") {
    const guideline = (finding.guideline_url || "").trim();
    const guidelineUrl =
      guideline && !isBrokenRefUrl(guideline)
        ? guideline
        : catalog.guideline_uiux_url || STATIC_CATALOG.guideline_uiux_url || "";
    if (guidelineUrl && guidelineUrl !== primary && guidelineUrl !== fallback) {
      links.push({ label: "UI·UX 가이드라인(2025.08)", url: guidelineUrl, kind: "guideline" });
    }
  }
  const fixUrl = (finding.fix_url || "").trim();
  if (fixUrl) {
    links.push({ label: "axe 참고", url: fixUrl, kind: "axe" });
  }
  return links;
}

/** @deprecated use resolveFindingRefLinks return type */
export const KWCAG_ANCHORS = STATIC_CATALOG.kwcag_anchors!;
export const EGov_WA_KWCAG_MAP = STATIC_CATALOG.egov_wa_kwcag_map!;
