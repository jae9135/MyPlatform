"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

const PAGE_SIZE = 100;

type Kind = "word" | "term" | "domain" | "code";

type SampleItem = {
  id: string;
  title: string;
  filename: string;
  kinds: Kind[];
  description: string;
  bytes?: number;
  download_path: string;
};

type CheckResult = {
  ok: boolean;
  kind: Kind;
  source_filename: string;
  stats: Record<string, number>;
  match: Record<string, unknown>[];
  review: Record<string, unknown>[];
  unmatch: Record<string, unknown>[];
};

type ResultTab = "match" | "review" | "unmatch";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function ResultTable({
  rows,
  resetKey,
}: {
  rows: Record<string, unknown>[];
  resetKey: string;
}) {
  const [page, setPage] = useState(1);
  const cols = useMemo(() => {
    if (!rows.length) return [] as string[];
    return Object.keys(rows[0]);
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!rows.length) {
    return <p className="hint">표시할 행이 없습니다.</p>;
  }

  const start = (page - 1) * PAGE_SIZE;
  const shown = rows.slice(start, start + PAGE_SIZE);
  const from = start + 1;
  const to = start + shown.length;

  return (
    <div>
      <div className="table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={start + i}>
                {cols.map((c) => (
                  <td key={c}>{String(row[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="hint">
          전체 {rows.length}건 · {from}–{to} 표시
        </span>
        {totalPages > 1 ? (
          <div className="pager-controls">
            <button
              type="button"
              className="pager-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              이전
            </button>
            {pageNumbers(page, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="pager-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`pager-btn ${page === p ? "active" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="pager-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              다음
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ChkDbStdPage() {
  const [kind, setKind] = useState<Kind>("word");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [tab, setTab] = useState<ResultTab>("match");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/chk-db-std/samples`);
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setSamples(j.items || []);
      } catch {
        /* ignore — API offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSamples = useMemo(
    () => samples.filter((s) => s.kinds.includes(kind)),
    [samples, kind]
  );

  const runCheck = useCallback(async () => {
    if (!file) {
      setMsg("설계서(또는 코드정의서) Excel을 선택하세요.");
      return;
    }
    setBusy(true);
    setMsg("점검 중…");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("design", file);
      fd.append("kind", kind);
      fd.append("format", "json");
      const res = await fetch(`${API_BASE}/v1/chk-db-std/run`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = "실행 실패";
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const data = (await res.json()) as CheckResult;
      setResult(data);
      setTab("match");
      setMsg("완료 — 아래 표에서 결과를 확인하세요.");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [file, kind]);

  const downloadXlsx = useCallback(async () => {
    if (!file) {
      setMsg("다운로드할 점검용 파일을 먼저 선택하세요.");
      return;
    }
    setBusy(true);
    setMsg("Excel 생성 중…");
    try {
      const fd = new FormData();
      fd.append("design", file);
      fd.append("kind", kind);
      fd.append("format", "xlsx");
      const res = await fetch(`${API_BASE}/v1/chk-db-std/run`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = "다운로드 실패";
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      downloadBlob(blob, `chkdbstd_${kind}_result.xlsx`);
      setMsg("완료 — 결과 Excel을 저장했습니다.");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [file, kind]);

  const downloadDictionary = useCallback(async () => {
    if (!file) {
      setMsg("설계서를 먼저 선택하세요.");
      return;
    }
    if (kind !== "word" && kind !== "term") {
      setMsg("단어집/용어집은 표준단어 또는 표준용어 점검에서만 가능합니다.");
      return;
    }
    const dictFormat = kind === "word" ? "word-dict" : "term-dict";
    const label = kind === "word" ? "단어집" : "용어집";
    const fname =
      kind === "word"
        ? "chkdbstd_used_word_dictionary.xlsx"
        : "chkdbstd_used_term_dictionary.xlsx";
    setBusy(true);
    setMsg(`${label} 생성 중…`);
    try {
      const fd = new FormData();
      fd.append("design", file);
      fd.append("kind", kind);
      fd.append("format", dictFormat);
      const res = await fetch(`${API_BASE}/v1/chk-db-std/run`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = `${label} 다운로드 실패`;
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      downloadBlob(blob, fname);
      setMsg(`완료 — ${label}을 저장했습니다.`);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [file, kind]);

  async function downloadSample(sample: SampleItem) {
    try {
      const res = await fetch(`${API_BASE}${sample.download_path}`);
      if (!res.ok) throw new Error("샘플 다운로드 실패");
      const blob = await res.blob();
      downloadBlob(blob, sample.filename);
      setMsg(`샘플 저장: ${sample.filename}`);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    }
  }

  const statsEntries = result
    ? Object.entries(result.stats || {}).filter(
        ([, v]) => typeof v === "number"
      )
    : [];

  const tabRows =
    result == null
      ? []
      : tab === "match"
        ? result.match
        : tab === "review"
          ? result.review
          : result.unmatch;

  return (
    <main>
      <Link className="back" href="/">
        ← MyPlatform
      </Link>
      <section className="hero">
        <h1>DB 표준 점검 도구</h1>
        <p>
          설계서를 올려 점검을 실행하고, 결과를 화면에서 확인하거나 Excel로
          받을 수 있습니다. 샘플 파일로 먼저 시험해 보세요.
        </p>
      </section>

      <section className="panel">
        <h3>샘플 데이터</h3>
        <p className="hint">
          선택한 점검 종류에 맞는 샘플을 받아 바로 점검에 사용할 수 있습니다.
        </p>
        {filteredSamples.length === 0 ? (
          <p className="hint">등록된 샘플이 없거나 API에 연결되지 않았습니다.</p>
        ) : (
          <ul className="sample-list">
            {filteredSamples.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.title}</strong>
                  <span className="hint">{s.description}</span>
                </div>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => downloadSample(s)}
                >
                  다운로드
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>점검 실행</h3>
        <p className="hint">
          API: <code>{API_BASE}</code>
        </p>
        <div className="row">
          <label>
            종류{" "}
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="word">표준단어</option>
              <option value="term">표준용어</option>
              <option value="domain">표준도메인</option>
              <option value="code">표준코드</option>
            </select>
          </label>
        </div>
        <div className="row">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={runCheck}
          >
            {busy ? "실행 중…" : "점검 실행"}
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={busy || !file}
            onClick={downloadXlsx}
          >
            결과 Excel 다운로드
          </button>
          {kind === "word" || kind === "term" ? (
            <button
              className="btn ghost"
              type="button"
              disabled={busy || !file}
              onClick={downloadDictionary}
            >
              {kind === "word" ? "단어집 다운로드" : "용어집 다운로드"}
            </button>
          ) : null}
        </div>
        <p className="hint">
          단어집/용어집: 점검에 사용된 표준단어·용어와 미등록후보를 Excel로
          받습니다. (표준단어·표준용어 종류에서만)
        </p>
        <p
          className={`msg ${
            msg.includes("완료") || msg.includes("샘플 저장")
              ? "ok"
              : msg.includes("실패") || msg.includes("Error")
                ? "err"
                : ""
          }`}
        >
          {msg}
        </p>
      </section>

      {result ? (
        <section className="panel">
          <h3>점검 결과</h3>
          <p className="hint">
            파일: {result.source_filename} · 종류: {result.kind}
          </p>
          <div className="stats-grid">
            {statsEntries.map(([k, v]) => (
              <div className="stat-card" key={k}>
                <div className="stat-label">{k}</div>
                <div className="stat-value">{v}</div>
              </div>
            ))}
          </div>
          <div className="tabs">
            {(
              [
                ["match", "일치", result.match.length],
                ["review", "검토", result.review.length],
                ["unmatch", "미매칭", result.unmatch.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={`tab ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          <ResultTable
            rows={tabRows}
            resetKey={`${result.kind}-${tab}-${result.source_filename}`}
          />
        </section>
      ) : null}
    </main>
  );
}
