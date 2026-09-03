export type ScanMode = "ipms-online" | "external" | "java-upload";

export type WqPrefs = {
  ipmsUrl: string;
  pageUrl: string;
  javaBaseUrl: string;
  loginUrl: string;
  loginUsername: string;
  includeRuntime: boolean;
  includeKrds: boolean;
  needLogin: boolean;
  accessPublic: boolean;
  accessAuth: boolean;
  selectedIdsByMode: Partial<Record<ScanMode, string[]>>;
};

const STORAGE_KEY = "wq-prefs-v1";

const DEFAULTS: WqPrefs = {
  ipmsUrl: "http://14.35.194.178:12000/ipms.online/",
  pageUrl: "",
  javaBaseUrl: "http://",
  loginUrl: "",
  loginUsername: "",
  includeRuntime: true,
  includeKrds: true,
  needLogin: false,
  accessPublic: true,
  accessAuth: true,
  selectedIdsByMode: {},
};

function migrateSelectedIdsByMode(
  raw: Partial<Record<string, string[]>> | undefined,
): Partial<Record<ScanMode, string[]>> {
  const out: Partial<Record<ScanMode, string[]>> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (k === "ipms-public" || k === "ipms-auth") {
      const prev = out["ipms-online"] || [];
      out["ipms-online"] = [...new Set([...prev, ...(v || [])])];
    } else if (k === "ipms-online" || k === "external" || k === "java-upload") {
      out[k as ScanMode] = v;
    }
  }
  return out;
}

export function loadWqPrefs(): WqPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<WqPrefs> & {
      selectedIdsByMode?: Partial<Record<string, string[]>>;
    };
    const ipmsNorm = DEFAULTS.ipmsUrl.trim().replace(/\/+$/, "");
    const pageRaw = (parsed.pageUrl ?? DEFAULTS.pageUrl).trim();
    const pageNorm = pageRaw.replace(/\/+$/, "");
    const pageUrl =
      pageNorm === ipmsNorm || pageNorm.endsWith("/ipms.online") ? "" : parsed.pageUrl ?? "";
    return {
      ...DEFAULTS,
      ...parsed,
      pageUrl,
      javaBaseUrl: (parsed.javaBaseUrl ?? DEFAULTS.javaBaseUrl).trim() || DEFAULTS.javaBaseUrl,
      includeKrds: true,
      accessPublic: parsed.accessPublic ?? true,
      accessAuth: parsed.accessAuth ?? true,
      selectedIdsByMode: migrateSelectedIdsByMode(parsed.selectedIdsByMode),
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
  includeKrds: boolean;
  needLogin: boolean;
  accessPublic: boolean;
  accessAuth: boolean;
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
    includeKrds: input.includeKrds,
    needLogin: input.needLogin,
    accessPublic: input.accessPublic,
    accessAuth: input.accessAuth,
    selectedIdsByMode: {
      ...input.selectedIdsByMode,
      [input.mode]: input.selectedIds,
    },
  };
}
