import * as XLSX from "xlsx";

export type PerfReportData = {
  job_id?: string;
  ran_at?: string;
  target?: string;
  target_name?: string;
  base_url?: string;
  users?: number;
  spawn_rate?: number;
  duration_sec?: number;
  request_source?: string;
  summary?: {
    total_requests?: number;
    total_failures?: number;
    fail_ratio?: number;
    avg_response_time_ms?: number;
    p95_ms?: number;
    rps?: number;
    duration_sec?: number;
    users?: number;
  };
  endpoints?: {
    name: string;
    method?: string;
    num_requests: number;
    num_failures?: number;
    avg_ms: number;
    p95_ms: number;
  }[];
  requests_preview?: { method?: string; path?: string; name?: string }[];
};

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function fmtPct(ratio?: number) {
  if (ratio == null) return "—";
  return `${(ratio * 100).toFixed(2)}%`;
}

export function exportPerfReportJson(data: PerfReportData) {
  const text = JSON.stringify(data, null, 2);
  downloadBlob(new Blob([text], { type: "application/json;charset=utf-8" }), `perf_report_${stamp()}.json`);
}

export function exportPerfReportExcel(data: PerfReportData) {
  const s = data.summary ?? {};
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ["항목", "값"],
    ["실행 시각", data.ran_at ?? ""],
    ["대상", data.target_name || data.target || ""],
    ["Base URL", data.base_url ?? ""],
    ["VU", s.users ?? data.users ?? ""],
    ["지속(초)", s.duration_sec ?? data.duration_sec ?? ""],
    ["TPS (rps)", s.rps ?? ""],
    ["평균 응답(ms)", s.avg_response_time_ms ?? ""],
    ["p95(ms)", s.p95_ms ?? ""],
    ["총 요청", s.total_requests ?? ""],
    ["오류율", fmtPct(s.fail_ratio)],
    ["요청 출처", data.request_source ?? ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "요약");

  const epRows = [
    ["경로", "메서드", "요청 수", "실패", "avg ms", "p95 ms"],
    ...(data.endpoints ?? []).map((ep) => [
      ep.name,
      ep.method ?? "GET",
      ep.num_requests,
      ep.num_failures ?? 0,
      ep.avg_ms,
      ep.p95_ms,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(epRows), "항목별 성능");

  if (data.requests_preview?.length) {
    const reqRows = [
      ["메서드", "경로", "이름"],
      ...data.requests_preview.map((r) => [r.method ?? "GET", r.path ?? r.name ?? "", r.name ?? ""]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reqRows), "검사 URL");
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `perf_report_${stamp()}.xlsx`,
  );
}

export function exportPerfReportHtml(data: PerfReportData) {
  const s = data.summary ?? {};
  const endpoints = data.endpoints ?? [];
  const requests = data.requests_preview ?? [];

  const epRows = endpoints
    .map(
      (ep) => `<tr>
        <td>${escapeHtml(ep.name)}</td>
        <td>${escapeHtml(ep.method ?? "GET")}</td>
        <td>${ep.num_requests}</td>
        <td>${ep.num_failures ?? 0}</td>
        <td>${ep.avg_ms}</td>
        <td>${ep.p95_ms}</td>
      </tr>`,
    )
    .join("");

  const reqRows = requests
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.method ?? "GET")}</td>
        <td>${escapeHtml(r.path ?? r.name ?? "")}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>성능 진단 보고서</title>
<style>
  body{font-family:"Malgun Gothic",sans-serif;margin:24px;color:#111;line-height:1.5}
  h1{font-size:1.4rem;margin:0 0 8px}
  .meta{color:#555;font-size:14px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}
  .card{border:1px solid #ddd;border-radius:8px;padding:10px 12px}
  .label{font-size:12px;color:#666}
  .value{font-size:20px;font-weight:700;margin-top:4px}
  table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left}
  th{background:#f5f7fa}
  h2{font-size:1.05rem;margin:24px 0 8px}
  @media print{body{margin:12px}}
</style></head><body>
  <h1>성능 진단 보고서</h1>
  <p class="meta">
    ${escapeHtml(data.target_name || data.target || "manual")} · ${escapeHtml(data.base_url ?? "")}<br/>
    실행: ${escapeHtml(data.ran_at ?? new Date().toISOString())}
  </p>
  <div class="grid">
    <div class="card"><div class="label">TPS (rps)</div><div class="value">${s.rps ?? "—"}</div></div>
    <div class="card"><div class="label">평균 응답</div><div class="value">${s.avg_response_time_ms != null ? `${s.avg_response_time_ms} ms` : "—"}</div></div>
    <div class="card"><div class="label">p95</div><div class="value">${s.p95_ms != null ? `${s.p95_ms} ms` : "—"}</div></div>
    <div class="card"><div class="label">오류율</div><div class="value">${fmtPct(s.fail_ratio)}</div></div>
    <div class="card"><div class="label">총 요청</div><div class="value">${s.total_requests ?? "—"}</div></div>
    <div class="card"><div class="label">VU · 시간</div><div class="value">${s.users ?? data.users ?? "—"} · ${s.duration_sec ?? data.duration_sec ?? "—"}s</div></div>
  </div>
  <h2>검사 URL 목록</h2>
  <table><thead><tr><th>메서드</th><th>경로</th></tr></thead><tbody>${reqRows || "<tr><td colspan=2>—</td></tr>"}</tbody></table>
  <h2>항목별 성능 (Locust)</h2>
  <table><thead><tr><th>경로</th><th>메서드</th><th>요청</th><th>실패</th><th>avg ms</th><th>p95 ms</th></tr></thead>
  <tbody>${epRows || "<tr><td colspan=6>—</td></tr>"}</tbody></table>
  <p style="font-size:12px;color:#888;margin-top:24px">MyPlatform 성능 진단 · Locust HTTP 부하 테스트</p>
</body></html>`;

  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `perf_report_${stamp()}.html`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
