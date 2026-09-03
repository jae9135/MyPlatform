const WQ_IPMS_SESSION_KEY = "wq-ipms-browser-session";
const WQ_EXTERNAL_SESSION_KEY = "wq-external-browser-session";
const WQ_JAVA_SESSION_KEY = "wq-java-browser-session";

export type WqPersistedBrowserSession = {
  jobId: string;
  pageUrl: string;
};

function load(key: string): WqPersistedBrowserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as { jobId?: string; pageUrl?: string };
    if (j?.jobId?.trim() && j?.pageUrl?.trim()) {
      return { jobId: j.jobId.trim(), pageUrl: j.pageUrl.trim() };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function save(key: string, jobId: string, pageUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ jobId: jobId.trim(), pageUrl: pageUrl.trim() }),
    );
  } catch {
    /* ignore */
  }
}

function clear(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadWqIpmsBrowserSession(): WqPersistedBrowserSession | null {
  return load(WQ_IPMS_SESSION_KEY);
}

export function saveWqIpmsBrowserSession(jobId: string, pageUrl: string): void {
  save(WQ_IPMS_SESSION_KEY, jobId, pageUrl);
}

export function clearWqIpmsBrowserSession(): void {
  clear(WQ_IPMS_SESSION_KEY);
}

export function loadWqExternalBrowserSession(): WqPersistedBrowserSession | null {
  return load(WQ_EXTERNAL_SESSION_KEY);
}

export function saveWqExternalBrowserSession(jobId: string, pageUrl: string): void {
  save(WQ_EXTERNAL_SESSION_KEY, jobId, pageUrl);
}

export function clearWqExternalBrowserSession(): void {
  clear(WQ_EXTERNAL_SESSION_KEY);
}

export function loadWqJavaBrowserSession(): WqPersistedBrowserSession | null {
  return load(WQ_JAVA_SESSION_KEY);
}

export function saveWqJavaBrowserSession(jobId: string, pageUrl: string): void {
  save(WQ_JAVA_SESSION_KEY, jobId, pageUrl);
}

export function clearWqJavaBrowserSession(): void {
  clear(WQ_JAVA_SESSION_KEY);
}
