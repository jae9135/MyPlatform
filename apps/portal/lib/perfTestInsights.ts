export type PerfEndpointRow = {
  name: string;
  method?: string;
  num_requests?: number;
  num_failures?: number;
  avg_ms: number;
  p95_ms: number;
  pending?: boolean;
};

export type PerfInsight = {
  name: string;
  method: string;
  avg_ms: number;
  p95_ms: number;
  num_failures: number;
  severity: "ok" | "warn" | "critical";
  hints: string[];
};

const P95_WARN_MS = 500;
const P95_CRITICAL_MS = 2000;

export const PERF_LABEL_PATH_SEP = " · ";

export function parseEndpointName(name: string): { label: string; path: string } {
  const idx = name.indexOf(PERF_LABEL_PATH_SEP);
  if (idx === -1) {
    const trimmed = name.trim();
    if (trimmed.startsWith("/") || trimmed.startsWith("http")) {
      return { label: "", path: trimmed };
    }
    return { label: trimmed, path: "" };
  }
  return {
    label: name.slice(0, idx).trim(),
    path: name.slice(idx + PERF_LABEL_PATH_SEP.length).trim(),
  };
}

/** HAR 결과 — 시나리오 라벨별 요청·응답 집계 */
export function aggregateByScenarioLabel(endpoints: PerfEndpointRow[]): PerfEndpointRow[] {
  const groups = new Map<
    string,
    { reqs: number; fails: number; avgWeighted: number; p95Max: number }
  >();

  for (const ep of endpoints) {
    if (ep.pending || !(ep.num_requests ?? 0)) continue;
    const { label } = parseEndpointName(ep.name);
    if (!label) continue;
    const n = ep.num_requests ?? 0;
    const cur = groups.get(label) ?? { reqs: 0, fails: 0, avgWeighted: 0, p95Max: 0 };
    cur.reqs += n;
    cur.fails += ep.num_failures ?? 0;
    cur.avgWeighted += (ep.avg_ms ?? 0) * n;
    cur.p95Max = Math.max(cur.p95Max, ep.p95_ms ?? 0);
    groups.set(label, cur);
  }

  return [...groups.entries()]
    .map(([label, g]) => ({
      name: label,
      method: "GET",
      num_requests: g.reqs,
      num_failures: g.fails,
      avg_ms: g.reqs ? Math.round((g.avgWeighted / g.reqs) * 10) / 10 : 0,
      p95_ms: g.p95Max,
    }))
    .sort((a, b) => (b.num_requests ?? 0) - (a.num_requests ?? 0));
}

function hintsForEndpoint(ep: PerfEndpointRow): string[] {
  const hints: string[] = [];
  const name = (ep.name || "").toLowerCase();
  const failures = ep.num_failures ?? 0;
  const p95 = ep.p95_ms ?? 0;

  if (failures > 0) {
    hints.push("HTTP 오류·타임아웃 — URL 경로, 인증(리다이렉트), 서버 로그를 확인하세요.");
  }
  if (name.includes("/login") || name.includes("redirect")) {
    hints.push("로그인 리다이렉트만 측정됐을 수 있습니다. 세션·HAR 녹화 또는 공개 URL을 사용하세요.");
  }
  if (/\.(js|css|woff2?|png|jpg|svg|ico)(\?|$)/.test(name)) {
    hints.push("정적 리소스 — CDN·캐시 헤더·번들 크기·압축(gzip/brotli)을 점검하세요.");
  }
  if (name.includes("/api/") || name.startsWith("api/")) {
    hints.push("API 구간 — DB 쿼리·N+1·외부 연동·페이징을 프로파일링하세요.");
  }
  if (p95 >= P95_CRITICAL_MS) {
    hints.push("p95 2초 이상 — 서버 CPU/메모리, DB 슬로우 쿼리, 동기 블로킹 호출을 우선 확인하세요.");
  } else if (p95 >= P95_WARN_MS) {
    hints.push("p95 500ms 이상 — 캐싱, SSR/데이터 fetch 병렬화, 불필요한 미들웨어를 검토하세요.");
  }
  if (!hints.length && p95 > 0) {
    hints.push("응답 시간이 양호합니다. 부하를 높여(VU·시간) 병목이 드러나는지 확인하세요.");
  }
  return hints;
}

function severityFor(p95: number, failures: number): PerfInsight["severity"] {
  if (failures > 0 || p95 >= P95_CRITICAL_MS) return "critical";
  if (p95 >= P95_WARN_MS) return "warn";
  return "ok";
}

export function buildPerfInsights(endpoints: PerfEndpointRow[]): PerfInsight[] {
  const rows = endpoints.filter((e) => !e.pending && (e.num_requests ?? 0) > 0);
  return [...rows]
    .sort((a, b) => (b.p95_ms || 0) - (a.p95_ms || 0))
    .map((ep) => {
      const failures = ep.num_failures ?? 0;
      const p95 = ep.p95_ms ?? 0;
      return {
        name: ep.name,
        method: ep.method || "GET",
        avg_ms: ep.avg_ms ?? 0,
        p95_ms: p95,
        num_failures: failures,
        severity: severityFor(p95, failures),
        hints: hintsForEndpoint(ep),
      };
    })
    .filter((x) => x.severity !== "ok" || x.p95_ms > 0);
}

export function endpointRowClass(p95: number, failures: number): string {
  if (failures > 0 || p95 >= P95_CRITICAL_MS) return "perf-row-critical";
  if (p95 >= P95_WARN_MS) return "perf-row-warn";
  return "";
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** 오류율 높을 때 Base URL·endpoint 패턴 기반 진단 문구 */
export function buildPerfFailDiagnosis(
  baseUrl: string,
  endpoints: PerfEndpointRow[],
  failRatio: number,
): string[] {
  if (failRatio <= 0.05) return [];

  const hints: string[] = [];
  const rows = endpoints.filter((e) => !e.pending && (e.num_requests ?? 0) > 0);
  const failed = rows.filter((e) => (e.num_failures ?? 0) > 0);

  let basePath = "";
  try {
    const parsed = new URL(baseUrl.includes("://") ? baseUrl : `http://${baseUrl}`);
    basePath = (parsed.pathname || "").replace(/\/+$/, "");
    if (basePath) {
      hints.push(
        `Base URL path: ${basePath} — Locust host에 포함됩니다. 부하 경로는 이 path 기준 상대 경로(예: /)를 사용하세요.`,
      );
    }
  } catch {
    hints.push(`Base URL 형식을 확인하세요: ${baseUrl}`);
  }

  if (basePath) {
    const doubled = `${basePath}${basePath}`;
    const prefixDup = failed.some((e) => (e.name || "").includes(doubled));
    const pathIncludesBase = failed.some((e) => {
      const n = e.name || "";
      return n.startsWith(basePath + "/") || n === basePath;
    });
    if (prefixDup) {
      hints.push(
        `경로 prefix 중복 의심: Base path「${basePath}」가 요청 path에 두 번 붙어 ${doubled}… 형태로 호출됐을 수 있습니다.`,
      );
    } else if (pathIncludesBase && basePath.length > 1) {
      hints.push(
        `일부 요청 path에 Base path「${basePath}」가 포함되어 있습니다. host+path가 겹치지 않는지 확인하세요.`,
      );
    }
  }

  if (failed.length === 1) {
    const ep = failed[0];
    const sampleUrl = ep.name?.startsWith("http") ? ep.name : joinUrl(baseUrl, ep.name || "/");
    hints.push(
      `실패가「${ep.method || "GET"} ${ep.name}」에 집중 (${ep.num_failures}건). 브라우저/curl로 응답 코드 확인: ${sampleUrl}`,
    );
  } else if (failed.length > 1) {
    hints.push(`실패 항목 ${failed.length}개 — 아래 「느린 구간 · 조치 힌트」에서 path별로 확인하세요.`);
  }

  const loginFail = failed.some((e) => /login|redirect|auth/i.test(e.name || ""));
  if (loginFail) {
    hints.push("로그인·리다이렉트 URL에서 실패 — 세션 없이 접근 시 401/302가 오류로 집계될 수 있습니다.");
  }

  if (!hints.some((h) => h.includes("curl") || h.includes("브라우저"))) {
    hints.push("HTTP 오류·타임아웃 — URL 경로, 인증, 서버 로그를 확인하세요.");
  }

  return hints;
}
