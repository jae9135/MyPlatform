const URL_RE = /^https?:\/\//i;

export type FixGuideEntry = { fix: string; example?: string };

export type FixGuidesCatalog = {
  findsecbugs: Record<string, FixGuideEntry>;
  pmd: Record<string, FixGuideEntry>;
  bandit: Record<string, FixGuideEntry>;
};

export type SourceScanFindingFixInput = {
  fix?: string;
  fix_url?: string;
  reference_url?: string;
  rule_id?: string;
  rule_set?: string;
  reference_ruleset?: string;
  scanner?: string;
  scanner_rule_id?: string;
  status?: string;
};

const EMPTY_GUIDES: FixGuidesCatalog = {
  findsecbugs: {},
  pmd: {},
  bandit: {},
};

function lookupGuide(
  f: SourceScanFindingFixInput,
  guides: FixGuidesCatalog
): FixGuideEntry | undefined {
  const rid = (f.rule_id || "").trim();
  const ref = (f.reference_ruleset || "").trim();
  const rs = (f.rule_set || "").trim().toLowerCase();
  const sc = (f.scanner || "").trim().toLowerCase();
  let sid = (f.scanner_rule_id || "").trim();
  if (sid.startsWith("bandit:")) sid = sid.slice("bandit:".length);

  if (rs === "findsecbugs" || ref === "findsecbugs") {
    const g = guides.findsecbugs[rid];
    if (g) return g;
  }
  if (rs === "pmd" || ref === "pmd") {
    const g = guides.pmd[rid];
    if (g) return g;
  }
  if (sc === "bandit" && sid.startsWith("B")) {
    const g = guides.bandit[sid];
    if (g) return g;
  }
  if (rs === "analog" && rid) {
    return guides.findsecbugs[rid] || guides.pmd[rid];
  }
  return undefined;
}

function defaultFix(f: SourceScanFindingFixInput): string {
  const rs = (f.rule_set || "").toLowerCase();
  const sc = (f.scanner || "").toLowerCase();
  if (rs === "findsecbugs" || rs === "analog") {
    return "FindSecBugs·OWASP 가이드를 참고해 취약 패턴을 제거하세요.";
  }
  if (rs === "pmd") return "PMD 규칙 설명에 맞게 코드 품질·안전성을 개선하세요.";
  if (sc === "bandit") return "Bandit/CWE 가이드를 참고해 Python 보안 취약점을 수정하세요.";
  if (sc === "eslint") return "ESLint 보안 규칙에 맞게 입력 검증·안전 API 사용을 검토하세요.";
  return "";
}

export function resolveSourceScanFix(
  f: SourceScanFindingFixInput,
  guides: FixGuidesCatalog = EMPTY_GUIDES
): { text: string; url?: string } {
  if (f.status && f.status !== "fail" && f.status !== "review") {
    return { text: "" };
  }

  let fixUrl = (f.fix_url || f.reference_url || "").trim();
  let fixText = (f.fix || "").trim();

  if (fixText && URL_RE.test(fixText)) {
    fixUrl = fixUrl || fixText;
    fixText = "";
  }

  const guide = lookupGuide(f, guides);
  if (guide?.fix) {
    const parts = [guide.fix];
    if (guide.example) parts.push(`예: ${guide.example}`);
    return { text: parts.join(" "), url: fixUrl || undefined };
  }

  if (fixText) return { text: fixText, url: fixUrl || undefined };

  if (fixUrl) {
    return { text: "공식 참조 문서를 확인해 수정하세요.", url: fixUrl };
  }

  const fallback = defaultFix(f);
  return fallback ? { text: fallback } : { text: "" };
}

export function normalizeFixGuides(raw: unknown): FixGuidesCatalog {
  if (!raw || typeof raw !== "object") return { ...EMPTY_GUIDES };
  const o = raw as Record<string, unknown>;
  return {
    findsecbugs: (o.findsecbugs as Record<string, FixGuideEntry>) || {},
    pmd: (o.pmd as Record<string, FixGuideEntry>) || {},
    bandit: (o.bandit as Record<string, FixGuideEntry>) || {},
  };
}
