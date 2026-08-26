export type SourceScanPrefs = {
  tryJavaBuild: boolean;
  tryEslintZip: boolean;
  usePrebuiltClasses: boolean;
  pmdRulesets: string;
  excludePaths: string;
  spotbugsEffort: string;
  spotbugsThreshold: string;
  showAdvanced: boolean;
};

const STORAGE_KEY = "source-scan-prefs-v3";

const DEFAULTS: SourceScanPrefs = {
  tryJavaBuild: true,
  tryEslintZip: false,
  usePrebuiltClasses: false,
  pmdRulesets: "",
  excludePaths: "",
  spotbugsEffort: "max",
  spotbugsThreshold: "low",
  showAdvanced: false,
};

export function loadSourceScanPrefs(): SourceScanPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SourceScanPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSourceScanPrefs(prefs: SourceScanPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota errors */
  }
}
