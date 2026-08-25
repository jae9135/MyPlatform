const URL_RE = /^https?:\/\//i;

export type FixGuideEntry = { fix: string; example?: string };

export type FindingFixInput = {
  fix?: string;
  fix_url?: string;
  axe_id?: string;
};

export function extractAxeIdFromUrl(url: string): string {
  const m = url.match(/\/rules\/axe\/[\d.]+\/([^/?#]+)/);
  return m?.[1] ?? "";
}

export function resolveFindingFix(
  f: FindingFixInput,
  guides: Record<string, FixGuideEntry>
): { text: string; url?: string } {
  let fixUrl = f.fix_url?.trim();
  let fixText = (f.fix || "").trim();

  if (fixText && URL_RE.test(fixText)) {
    fixUrl = fixUrl || fixText;
    fixText = "";
  }

  const axeId = f.axe_id?.trim() || (fixUrl ? extractAxeIdFromUrl(fixUrl) : "");
  const guide = axeId ? guides[axeId] : undefined;

  if (guide?.fix) {
    const parts = [guide.fix];
    if (guide.example) parts.push(`예: ${guide.example}`);
    return { text: parts.join(" "), url: fixUrl };
  }

  if (fixText) return { text: fixText, url: fixUrl };

  if (fixUrl) {
    return { text: "axe-core 공식 가이드를 참고해 수정하세요.", url: fixUrl };
  }

  return { text: "" };
}
