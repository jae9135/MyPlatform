export type ScanMode = "ipms-public" | "ipms-auth" | "external" | "java-upload";

export type WqPrefs = {
  ipmsUrl: string;
  pageUrl: string;
  javaBaseUrl: string;
  loginUrl: string;
  loginUsername: string;
  includeRuntime: boolean;
  needLogin: boolean;
  selectedIdsByMode: Partial<Record<ScanMode, string[]>>;
};

const STORAGE_KEY = "wq-prefs-v1";

const DEFAULTS: WqPrefs = {
  ipmsUrl: "http://14.35.194.178:12000/ipms.online/",
  pageUrl: "",
  javaBaseUrl: "http://127.0.0.1:8080",
  loginUrl: "",
  loginUsername: "",
  includeRuntime: true,
  needLogin: false,
  selectedIdsByMode: {},
};

export function loadWqPrefs(): WqPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<WqPrefs>;
    return {
      ...DEFAULTS,
      ...parsed,
      selectedIdsByMode: parsed.selectedIdsByMode ?? {},
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveWqPrefs(prefs: WqPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota errors */
  }
}

export function buildWqPrefs(input: {
  ipmsUrl: string;
  pageUrl: string;
  javaBaseUrl: string;
  loginUrl: string;
  loginUsername: string;
  includeRuntime: boolean;
  needLogin: boolean;
  mode: ScanMode;
  selectedIds: string[];
  selectedIdsByMode: Partial<Record<ScanMode, string[]>>;
}): WqPrefs {
  return {
    ipmsUrl: input.ipmsUrl,
    pageUrl: input.pageUrl,
    javaBaseUrl: input.javaBaseUrl,
    loginUrl: input.loginUrl,
    loginUsername: input.loginUsername,
    includeRuntime: input.includeRuntime,
    needLogin: input.needLogin,
    selectedIdsByMode: {
      ...input.selectedIdsByMode,
      [input.mode]: input.selectedIds,
    },
  };
}
