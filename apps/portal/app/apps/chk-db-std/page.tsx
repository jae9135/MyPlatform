"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalNav } from "@/lib/PortalNav";
import {
  clearDesignHandoff,
  loadDesignHandoff,
} from "@/lib/designHandoff";

import { API_BASE } from "@/lib/apiBase";

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

type TermGenItem = {
  input: string;
  status: "exact" | "composed" | "none";
  matched_via?: string;
  term?: {
    공통표준용어명: string;
    공통표준용어영문약어명: string;
    공통표준도메인명: string;
    공통표준용어설명?: string;
  } | null;
  word_compose?: {
    segments: { 단어명: string; 행번호: number; 약어: string }[];
    suggested_eng: string;
    coverage: number;
  } | null;
  standard_word?: string;
  standard_word_eng?: string;
  standard_term?: string;
  standard_term_eng?: string;
  recommended_eng?: string;
};

function termGenStatusLabel(status: TermGenItem["status"]): string {
  switch (status) {
    case "exact":
      return "표준용어";
    case "composed":
      return "단어조합";
    default:
      return "없음";
  }
}

function termGenIsFullMatch(item: TermGenItem): boolean {
  if (item.status === "exact") {
    return !item.matched_via;
  }
  if (item.status === "composed") {
    return (item.word_compose?.coverage ?? 0) >= 1.0;
  }
  return false;
}

function termGenStatusDisplay(item: TermGenItem): string {
  const base = termGenStatusLabel(item.status);
  const matchKind = termGenIsFullMatch(item) ? "일치" : "권장";
  const via = item.matched_via ? `, ${item.matched_via}` : "";
  return `${base} (${matchKind}${via})`;
}

function recommendedEngCopy(item: TermGenItem): string {
  const direct = item.recommended_eng?.trim();
  if (direct) return direct;
  const fromTerm = item.standard_term_eng?.trim();
  if (fromTerm) return fromTerm;
  const fromWords = item.word_compose?.suggested_eng?.trim();
  if (fromWords) return fromWords;
  return item.standard_word_eng?.trim() || "";
}

function emptyTermGenItem(input: string): TermGenItem {
  return {
    input,
    status: "none",
    term: null,
    word_compose: null,
    standard_word: "",
    standard_word_eng: "",
    standard_term: "",
    standard_term_eng: "",
    recommended_eng: "",
  };
}

type DesignCheck = {
  checking: boolean;
  canCheck: boolean;
  message: string;
  sheet?: string;
  designFormat?: string;
  tables?: number;
  columns?: number;
  rows?: number;
};

type ResultTab = "match" | "review" | "unmatch";

const IDLE_TABLE_CHECK: DesignCheck = {
  checking: false,
  canCheck: false,
  message: "테이블정의서 Excel을 선택하면 점검 가능 여부를 확인합니다.",
};

const IDLE_CODE_CHECK: DesignCheck = {
  checking: false,
  canCheck: false,
  message: "코드정의서 Excel을 선택하면 점검 가능 여부를 확인합니다.",
};

function isTableKind(kind: Kind): boolean {
  return kind !== "code";
}

function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

function buildRunCacheKey(
  kind: Kind,
  file: File,
  sheet: string,
  wordsCsv: File | null,
  termsCsv: File | null,
  domainsCsv: File | null
): string {
  const csvPart = [
    wordsCsv ? fileKey(wordsCsv) : "",
    termsCsv ? fileKey(termsCsv) : "",
    domainsCsv ? fileKey(domainsCsv) : "",
  ].join("|");
  return `${kind}:${fileKey(file)}:${sheet.trim()}:${csvPart}`;
}

const STAT_LABELS: Record<string, string> = {
  total_cols: "설계 컬럼 수",
  matched_cols: "매칭 컬럼",
  review_cols: "검토 컬럼",
  unmatched_cols: "미매칭 컬럼",
  match_rows: "일치 행",
  review_rows: "검토 행",
  total_rows: "코드값 행",
  std_files: "표준코드 파일",
  from_term_cols: "용어 기준",
  from_word_cols: "단어 기준",
};

function formatStatLabel(key: string, kind: Kind): string {
  if (key === "total_cols" && kind === "code") return "코드 종류";
  return STAT_LABELS[key] || key;
}

type RunProgress = {
  pct: number;
  elapsedSec: number;
  etaSec: number | null;
};

function estimateRunMs(file: File, checkKind: Kind): number {
  const mb = file.size / (1024 * 1024);
  const base =
    checkKind === "code" ? 4000 : checkKind === "domain" ? 5000 : 3500;
  return Math.min(120000, Math.max(base, base + mb * 2500));
}

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

function filterResultRows(
  rows: Record<string, unknown>[],
  query: string,
  onlyEngMismatch: boolean
): Record<string, unknown>[] {
  let out = rows;
  if (onlyEngMismatch) {
    out = out.filter((row) => {
      const reason = String(row["사유"] ?? row["영문일치"] ?? "");
      return reason.includes("영문");
    });
  }
  const q = query.trim().toLowerCase();
  if (!q) return out;
  return out.filter((row) =>
    Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q))
  );
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
  const [tableFile, setTableFile] = useState<File | null>(null);
  const [codeFile, setCodeFile] = useState<File | null>(null);
  const [tableSheet, setTableSheet] = useState("");
  const [codeSheet, setCodeSheet] = useState("");
  const [designCheck, setDesignCheck] = useState<DesignCheck>(IDLE_TABLE_CHECK);
  const tableSheetRef = useRef(tableSheet);
  const codeSheetRef = useRef(codeSheet);
  const skipSheetValidateRef = useRef(false);
  const tableCheckCacheRef = useRef<{
    fileKey: string;
    sheet: string;
    check: DesignCheck;
  } | null>(null);
  const resultCacheRef = useRef<Map<string, CheckResult>>(new Map());
  const tableKind = isTableKind(kind);
  const activeFile = tableKind ? tableFile : codeFile;
  const activeSheet = tableKind ? tableSheet : codeSheet;
  tableSheetRef.current = tableSheet;
  codeSheetRef.current = codeSheet;
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [tab, setTab] = useState<ResultTab>("match");
  const [resultQuery, setResultQuery] = useState("");
  const [filterEngMismatch, setFilterEngMismatch] = useState(false);
  const [wordsCsv, setWordsCsv] = useState<File | null>(null);
  const [termsCsv, setTermsCsv] = useState<File | null>(null);
  const [domainsCsv, setDomainsCsv] = useState<File | null>(null);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [termGenInput, setTermGenInput] = useState("");
  const [termGenBusy, setTermGenBusy] = useState(false);
  const [termGenMsg, setTermGenMsg] = useState("");
  const [termGenItems, setTermGenItems] = useState<TermGenItem[]>([]);
  const handoffLoadedRef = useRef(false);

  const getRunCacheKey = useCallback(
    (targetKind: Kind) => {
      const file = isTableKind(targetKind) ? tableFile : codeFile;
      if (!file) return null;
      const sheet = (
        isTableKind(targetKind) ? tableSheet : codeSheet
      ).trim();
      return buildRunCacheKey(
        targetKind,
        file,
        sheet,
        wordsCsv,
        termsCsv,
        domainsCsv
      );
    },
    [codeFile, codeSheet, domainsCsv, tableFile, tableSheet, termsCsv, wordsCsv]
  );

  useEffect(() => {
    if (handoffLoadedRef.current) return;
    handoffLoadedRef.current = true;
    void (async () => {
      try {
        const handoff = await loadDesignHandoff();
        if (!handoff) return;
        skipSheetValidateRef.current = false;
        setTableFile(handoff.file);
        tableCheckCacheRef.current = null;
        resultCacheRef.current.clear();
        if (handoff.meta.sheet) setTableSheet(handoff.meta.sheet);
        const fromLabel =
          handoff.meta.from === "db-manager" ? "DBManager" : "다른 앱";
        setMsg(`${fromLabel}에서 설계서를 불러왔습니다: ${handoff.file.name}`);
        await clearDesignHandoff();
      } catch {
        /* ignore handoff errors */
      }
    })();
  }, []);

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

  const validateDesignFile = useCallback(
    async (target: File, checkKind: Kind) => {
      const sheetName = (
        isTableKind(checkKind) ? tableSheetRef : codeSheetRef
      ).current.trim();

      if (isTableKind(checkKind)) {
        const cached = tableCheckCacheRef.current;
        if (
          cached &&
          cached.fileKey === fileKey(target) &&
          cached.sheet === sheetName &&
          cached.check.canCheck
        ) {
          setDesignCheck(cached.check);
          return;
        }
      }

      setDesignCheck({
        checking: true,
        canCheck: false,
        message: "설계서 형식 확인 중…",
      });
      try {
        const fd = new FormData();
        fd.append("design", target);
        fd.append("kind", checkKind);
        if (sheetName) fd.append("sheet", sheetName);
        const res = await fetch(`${API_BASE}/v1/chk-db-std/validate`, {
          method: "POST",
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok && !j.message) {
          throw new Error(j.detail || "형식 확인 실패");
        }
        const canCheck = Boolean(j.can_check);
        const detectedSheet = j.sheet ? String(j.sheet) : "";
        const nextCheck: DesignCheck = {
          checking: false,
          canCheck,
          message: String(j.message || (canCheck ? "점검 가능" : "확인 실패")),
          sheet: detectedSheet || undefined,
          designFormat: j.design_format ? String(j.design_format) : undefined,
          tables: typeof j.tables === "number" ? j.tables : undefined,
          columns: typeof j.columns === "number" ? j.columns : undefined,
          rows: typeof j.rows === "number" ? j.rows : undefined,
        };
        let cacheSheet = sheetName;
        if (canCheck && detectedSheet) {
          const sheetRef = isTableKind(checkKind)
            ? tableSheetRef
            : codeSheetRef;
          if (detectedSheet !== sheetRef.current) {
            skipSheetValidateRef.current = true;
            if (isTableKind(checkKind)) setTableSheet(detectedSheet);
            else setCodeSheet(detectedSheet);
          }
          cacheSheet = detectedSheet;
        }
        setDesignCheck(nextCheck);
        if (isTableKind(checkKind) && canCheck) {
          tableCheckCacheRef.current = {
            fileKey: fileKey(target),
            sheet: cacheSheet,
            check: nextCheck,
          };
        }
      } catch (e) {
        setDesignCheck({
          checking: false,
          canCheck: false,
          message: String((e as Error).message || e),
        });
      }
    },
    []
  );

  const onDesignFileChange = useCallback(
    (next: File | null, fileKind: "table" | "code") => {
      if (fileKind === "table") {
        setTableFile(next);
        tableCheckCacheRef.current = null;
        resultCacheRef.current.clear();
      } else {
        setCodeFile(next);
        for (const key of [...resultCacheRef.current.keys()]) {
          if (key.startsWith("code:")) resultCacheRef.current.delete(key);
        }
      }
      setMsg("");
      setResult(null);
      skipSheetValidateRef.current = false;
      if (!next) {
        setDesignCheck(
          fileKind === "table" ? IDLE_TABLE_CHECK : IDLE_CODE_CHECK
        );
      }
    },
    []
  );

  const onKindChange = useCallback(
    (next: Kind) => {
      setKind(next);
      setMsg("");

      if (isTableKind(next)) {
        const cached = tableCheckCacheRef.current;
        if (
          tableFile &&
          cached &&
          cached.fileKey === fileKey(tableFile) &&
          cached.sheet === tableSheet.trim() &&
          cached.check.canCheck
        ) {
          setDesignCheck(cached.check);
        } else if (!tableFile) {
          setDesignCheck(IDLE_TABLE_CHECK);
        }
      } else if (!codeFile) {
        setDesignCheck(IDLE_CODE_CHECK);
      }

      const file = isTableKind(next) ? tableFile : codeFile;
      if (file) {
        const cacheKey = buildRunCacheKey(
          next,
          file,
          (isTableKind(next) ? tableSheet : codeSheet).trim(),
          wordsCsv,
          termsCsv,
          domainsCsv
        );
        const cachedResult = resultCacheRef.current.get(cacheKey);
        if (cachedResult) {
          setResult(cachedResult);
          setTab("match");
          setResultQuery("");
          setFilterEngMismatch(false);
          setMsg("이전 점검 결과를 표시합니다.");
          return;
        }
      }
      setResult(null);
    },
    [codeFile, codeSheet, domainsCsv, tableFile, tableSheet, termsCsv, wordsCsv]
  );

  useEffect(() => {
    resultCacheRef.current.clear();
    setResult(null);
  }, [domainsCsv, termsCsv, wordsCsv]);

  useEffect(() => {
    if (!activeFile) {
      setDesignCheck(
        tableKind ? IDLE_TABLE_CHECK : IDLE_CODE_CHECK
      );
      return;
    }
    if (skipSheetValidateRef.current) {
      skipSheetValidateRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void validateDesignFile(activeFile, kind);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [activeFile, activeSheet, kind, tableKind, validateDesignFile]);

  const appendSheet = useCallback(
    (fd: FormData) => {
      const exportSheet = (
        designCheck.sheet || (tableKind ? tableSheet : codeSheet)
      ).trim();
      if (exportSheet) fd.append("sheet", exportSheet);
    },
    [codeSheet, designCheck.sheet, tableKind, tableSheet]
  );

  const appendStdCsv = useCallback(
    (fd: FormData) => {
      if (wordsCsv) fd.append("words_csv", wordsCsv);
      if (termsCsv) fd.append("terms_csv", termsCsv);
      if (domainsCsv) fd.append("domains_csv", domainsCsv);
    },
    [domainsCsv, termsCsv, wordsCsv]
  );

  const runCheck = useCallback(async () => {
    if (!activeFile) {
      setMsg(
        tableKind
          ? "테이블정의서 Excel을 선택하세요."
          : "코드정의서 Excel을 선택하세요."
      );
      return;
    }
    if (!designCheck.canCheck) {
      setMsg(designCheck.message || "형식 확인을 통과한 뒤 점검할 수 있습니다.");
      return;
    }
    setBusy(true);
    setMsg("점검 중…");
    setRunProgress({ pct: 0, elapsedSec: 0, etaSec: null });
    const started = Date.now();
    const estimateMs = estimateRunMs(activeFile, kind);
    const progressTimer = window.setInterval(() => {
      const elapsedMs = Date.now() - started;
      const pct = Math.min(95, (elapsedMs / estimateMs) * 100);
      const elapsedSec = Math.round(elapsedMs / 1000);
      const remainingMs = estimateMs - elapsedMs;
      const etaSec =
        pct >= 95 || remainingMs <= 0
          ? 0
          : Math.max(1, Math.round(remainingMs / 1000));
      setRunProgress({ pct, elapsedSec, etaSec });
    }, 250);
    try {
      const fd = new FormData();
      fd.append("design", activeFile);
      fd.append("kind", kind);
      fd.append("format", "json");
      appendSheet(fd);
      appendStdCsv(fd);
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
      const cacheKey = getRunCacheKey(kind);
      if (cacheKey) resultCacheRef.current.set(cacheKey, data);
      setRunProgress({ pct: 100, elapsedSec: Math.round((Date.now() - started) / 1000), etaSec: 0 });
      setResult(data);
      setTab("match");
      setResultQuery("");
      setFilterEngMismatch(false);
      setMsg("완료 — 아래 표에서 결과를 확인하세요.");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      window.clearInterval(progressTimer);
      setBusy(false);
      window.setTimeout(() => setRunProgress(null), 600);
    }
  }, [
    appendSheet,
    appendStdCsv,
    designCheck.canCheck,
    designCheck.message,
    activeFile,
    getRunCacheKey,
    kind,
    tableKind,
  ]);

  const downloadXlsx = useCallback(async () => {
    if (!activeFile) {
      setMsg("다운로드할 점검용 파일을 먼저 선택하세요.");
      return;
    }
    if (!designCheck.canCheck) {
      setMsg(designCheck.message || "형식 확인을 통과한 뒤 다운로드할 수 있습니다.");
      return;
    }
    setBusy(true);
    setMsg("Excel 생성 중…");
    try {
      const fd = new FormData();
      fd.append("design", activeFile);
      fd.append("kind", kind);
      fd.append("format", "xlsx");
      appendSheet(fd);
      appendStdCsv(fd);
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
  }, [appendSheet, appendStdCsv, designCheck.canCheck, designCheck.message, activeFile, kind]);

  const downloadDictionary = useCallback(async () => {
    if (!activeFile) {
      setMsg("설계서를 먼저 선택하세요.");
      return;
    }
    if (!designCheck.canCheck) {
      setMsg(designCheck.message || "형식 확인을 통과한 뒤 다운로드할 수 있습니다.");
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
      fd.append("design", activeFile);
      fd.append("kind", kind);
      fd.append("format", dictFormat);
      appendSheet(fd);
      appendStdCsv(fd);
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
  }, [appendSheet, appendStdCsv, designCheck.canCheck, designCheck.message, activeFile, kind]);

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

  const generateTerms = useCallback(async () => {
    const lines = termGenInput
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      setTermGenMsg("한글명을 한 줄에 하나씩 입력하세요.");
      setTermGenItems([]);
      return;
    }
    setTermGenBusy(true);
    setTermGenMsg("표준용어 조회 중…");
    setTermGenItems([]);
    try {
      const fd = new FormData();
      fd.append("names", lines.join("\n"));
      if (wordsCsv) fd.append("words_csv", wordsCsv);
      if (termsCsv) fd.append("terms_csv", termsCsv);
      const res = await fetch(`${API_BASE}/v1/chk-db-std/generate-terms`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.detail || j.error || "표준용어 생성 실패");
      }
      const items = (j.items || []) as TermGenItem[];
      const byInput = new Map(items.map((item) => [item.input, item]));
      const aligned = lines.map(
        (line) => byInput.get(line) ?? emptyTermGenItem(line)
      );
      setTermGenItems(aligned);
      setTermGenMsg(`완료 — ${lines.length}건 처리했습니다.`);
    } catch (e) {
      setTermGenMsg(String((e as Error).message || e));
    } finally {
      setTermGenBusy(false);
    }
  }, [termGenInput, termsCsv, wordsCsv]);

  const termGenEngOutput = useMemo(() => {
    const byInput = new Map(termGenItems.map((item) => [item.input, item]));
    return termGenInput
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        const item = byInput.get(trimmed);
        return item ? recommendedEngCopy(item) : "";
      })
      .join("\n");
  }, [termGenInput, termGenItems]);

  const visibleResult = result && result.kind === kind ? result : null;

  const statsEntries = visibleResult
    ? Object.entries(visibleResult.stats || {})
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]) => [formatStatLabel(k, visibleResult.kind), v] as const)
    : [];

  const tabRowsRaw =
    visibleResult == null
      ? []
      : tab === "match"
        ? visibleResult.match
        : tab === "review"
          ? visibleResult.review
          : visibleResult.unmatch;

  const tabRows = useMemo(
    () =>
      filterResultRows(
        tabRowsRaw,
        resultQuery,
        filterEngMismatch && tab === "review"
      ),
    [filterEngMismatch, resultQuery, tab, tabRowsRaw]
  );

  const sheetPlaceholder =
    kind === "code" ? "비우면 코드정의서" : "비우면 자동 감지";
  const idleCheck = tableKind ? IDLE_TABLE_CHECK : IDLE_CODE_CHECK;

  return (
    <main>
      <PortalNav />
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
          API: <code>{API_BASE}</code> · 표준단어·표준용어·표준도메인은{" "}
          <strong>동일한 테이블정의서</strong>를 사용합니다. 표준코드는{" "}
          <strong>코드정의서 Excel</strong>을 별도로 선택하세요. 종류를 바꾸면
          형식을 자동 확인하고, 이미 실행한 점검 결과가 있으면 다시 실행하지
          않고 바로 표시합니다.
        </p>
        <div className="row">
          <label>
            종류{" "}
            <select
              value={kind}
              onChange={(e) => onKindChange(e.target.value as Kind)}
              disabled={busy}
            >
              <option value="word">표준단어</option>
              <option value="term">표준용어</option>
              <option value="domain">표준도메인</option>
              <option value="code">표준코드</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            시트명{" "}
            <input
              type="text"
              value={activeSheet}
              onChange={(e) =>
                tableKind
                  ? setTableSheet(e.target.value)
                  : setCodeSheet(e.target.value)
              }
              placeholder={sheetPlaceholder}
              disabled={busy}
            />
          </label>
        </div>
        {tableKind ? (
          <div className="row">
            <label className="file-field">
              테이블정의서 Excel{" "}
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(e) =>
                  onDesignFileChange(e.target.files?.[0] || null, "table")
                }
              />
            </label>
          </div>
        ) : (
          <div className="row">
            <label className="file-field">
              코드정의서 Excel{" "}
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(e) =>
                  onDesignFileChange(e.target.files?.[0] || null, "code")
                }
              />
            </label>
          </div>
        )}
        <p
          className={`msg ${
            designCheck.checking
              ? ""
              : designCheck.canCheck
                ? "ok"
                : designCheck.message !== idleCheck.message
                  ? "err"
                  : ""
          }`}
        >
          {designCheck.message}
        </p>
        {activeFile && designCheck.canCheck ? (
          <p className="hint">
            양식:{" "}
            {designCheck.designFormat === "code"
              ? "코드정의서"
              : designCheck.designFormat === "block"
                ? "블록형 테이블정의서"
                : "목록형 테이블정의서"}
            {designCheck.sheet ? (
              <>
                {" "}
                · 시트 <code>{designCheck.sheet}</code>
              </>
            ) : null}
            {typeof designCheck.tables === "number" ? (
              <> · 테이블 {designCheck.tables}개</>
            ) : null}
            {typeof designCheck.columns === "number" ? (
              <> · 컬럼 {designCheck.columns}개</>
            ) : null}
            {typeof designCheck.rows === "number" ? (
              <> · 코드 {designCheck.rows}행</>
            ) : null}
          </p>
        ) : null}
        {kind !== "code" ? (
          <>
            <div className="hint std-csv-guide">
              <p>
                <strong>표준 CSV (선택)</strong> — 파일을 올리지 않으면 서버에
                포함된 행정안전부(MOIS) 기본 표준 사전으로 점검합니다.{" "}
                <strong>아래에 해당할 때만</strong> 선택하세요.
              </p>
              <ul>
                {(kind === "word" || kind === "term") && (
                  <li>
                    <strong>표준단어 CSV</strong> — 기관·프로젝트 전용
                    표준단어 목록이 있거나, 기본 사전보다 최신·내부 확장
                    단어를 반영할 때. 표준단어 점검에서는 컬럼 한글명을
                    표준단어로 분해·매칭하고, 표준용어 점검에서는 용어에
                    없을 때 단어 조합으로 보완합니다.
                  </li>
                )}
                {(kind === "term" || kind === "domain") && (
                  <li>
                    <strong>표준용어 CSV</strong> — 자체 표준용어집·이음동의어
                    목록으로 점검할 때. 표준용어·표준도메인 점검과 하단
                    「표준용어 생성」에도 동일하게 적용됩니다.
                  </li>
                )}
                {kind === "domain" && (
                  <li>
                    <strong>표준도메인 CSV</strong> — 기관별 도메인
                    정의(데이터타입·길이)가 MOIS 기본과 다를 때. 표준용어
                    매칭 후 설계서의 타입·길이가 표준도메인과 맞는지
                    확인합니다.
                  </li>
                )}
              </ul>
            </div>
            <div className="row">
              {(kind === "word" || kind === "term") && (
                <label>
                  표준단어 CSV (선택){" "}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy}
                    onChange={(e) => setWordsCsv(e.target.files?.[0] || null)}
                  />
                </label>
              )}
              {(kind === "term" || kind === "domain") && (
                <label>
                  표준용어 CSV (선택){" "}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy}
                    onChange={(e) => setTermsCsv(e.target.files?.[0] || null)}
                  />
                </label>
              )}
              {kind === "domain" && (
                <label>
                  표준도메인 CSV (선택){" "}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy}
                    onChange={(e) =>
                      setDomainsCsv(e.target.files?.[0] || null)
                    }
                  />
                </label>
              )}
            </div>
          </>
        ) : null}
        {runProgress ? (
          <div className="run-progress">
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={Math.round(runProgress.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="progress-fill"
                style={{ width: `${runProgress.pct}%` }}
              />
            </div>
            <p className="hint">
              {Math.round(runProgress.pct)}% · 경과 {runProgress.elapsedSec}초
              {runProgress.etaSec != null && runProgress.etaSec > 0
                ? ` · 약 ${runProgress.etaSec}초 남음`
                : runProgress.pct >= 95
                  ? " · 거의 완료…"
                  : ""}
            </p>
          </div>
        ) : null}
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={
              busy ||
              designCheck.checking ||
              !activeFile ||
              !designCheck.canCheck
            }
            onClick={runCheck}
          >
            {busy ? "실행 중…" : "점검 실행"}
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={
              busy || designCheck.checking || !activeFile || !designCheck.canCheck
            }
            onClick={downloadXlsx}
          >
            결과 Excel 다운로드
          </button>
          {kind === "word" || kind === "term" ? (
            <button
              className="btn ghost"
              type="button"
              disabled={
                busy || designCheck.checking || !activeFile || !designCheck.canCheck
              }
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

      {visibleResult ? (
        <section className="panel">
          <h3>점검 결과</h3>
          <p className="hint">
            파일: {visibleResult.source_filename} · 종류: {visibleResult.kind}
          </p>
          <div className="stats-grid">
            {statsEntries.map(([label, v]) => (
              <div className="stat-card" key={label}>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{v}</div>
              </div>
            ))}
          </div>
          {tableKind ? (
            <p className="hint">
              설계 컬럼 수 = 컬럼 정의 행 + 테이블명(종류별 1건) 점검 대상
              합계입니다. 결과 표의 「점검구분」= 테이블은 테이블명 점검
              결과입니다.
            </p>
          ) : null}
          <div className="tabs">
            {(
              [
                ["match", "일치", visibleResult.match.length],
                ["review", "검토", visibleResult.review.length],
                ["unmatch", "미매칭", visibleResult.unmatch.length],
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
          <div className="row">
            <label>
              검색{" "}
              <input
                type="search"
                value={resultQuery}
                onChange={(e) => setResultQuery(e.target.value)}
                placeholder="열 값으로 필터"
              />
            </label>
            {tab === "review" ? (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filterEngMismatch}
                  onChange={(e) => setFilterEngMismatch(e.target.checked)}
                />{" "}
                영문 불일치만
              </label>
            ) : null}
          </div>
          {resultQuery || (filterEngMismatch && tab === "review") ? (
            <p className="hint">
              필터 적용: {tabRows.length}건 표시 (전체{" "}
              {tab === "match"
                ? visibleResult.match.length
                : tab === "review"
                  ? visibleResult.review.length
                  : visibleResult.unmatch.length}
              건)
            </p>
          ) : null}
          <ResultTable
            rows={tabRows}
            resetKey={`${visibleResult.kind}-${tab}-${visibleResult.source_filename}-${resultQuery}-${filterEngMismatch}`}
          />
        </section>
      ) : null}

      <section className="panel">
        <h3>표준용어 생성</h3>
        <p className="hint">
          설계서 점검과 별도 기능입니다. 한글 컬럼명·테이블명 후보를 한 줄에
          하나씩 입력하면 공통표준용어·표준단어 조합 결과를 찾아 줍니다. 위
          「점검 실행」에서 선택한 표준단어·표준용어 CSV가 있으면 함께
          사용합니다.
        </p>
        <div className="term-gen-split">
          <label className="stack-field">
            한글명 (줄 단위)
            <textarea
              className="term-gen-input"
              rows={8}
              value={termGenInput}
              onChange={(e) => setTermGenInput(e.target.value)}
              placeholder={"사용자명\n등록일시\n처리상태코드"}
              disabled={termGenBusy}
            />
          </label>
          <label className="stack-field">
            권장 영문명 (복사용)
            <textarea
              className="term-gen-input readonly"
              rows={8}
              readOnly
              value={termGenEngOutput}
              placeholder="표준용어 생성 후 여기에 줄 단위로 표시됩니다."
              aria-label="권장 영문명"
            />
          </label>
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={termGenBusy || !termGenInput.trim()}
            onClick={() => void generateTerms()}
          >
            {termGenBusy ? "조회 중…" : "표준용어 생성"}
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={!termGenEngOutput.trim()}
            onClick={() => {
              void navigator.clipboard.writeText(termGenEngOutput);
              setTermGenMsg("권장 영문명 전체를 복사했습니다.");
            }}
          >
            권장 영문명 전체 복사
          </button>
        </div>
        <p
          className={`msg ${
            termGenMsg.includes("완료")
              ? "ok"
              : termGenMsg && !termGenMsg.includes("조회 중")
                ? "err"
                : ""
          }`}
        >
          {termGenMsg}
        </p>
        {termGenItems.length > 0 ? (
          <div className="table-wrap">
            <p className="hint">
              왼쪽·오른쪽 입력창은 줄 수가 1:1로 맞습니다. 매칭되지 않은 줄은
              권장 영문명이 비어 있습니다.
            </p>
            <table className="result-table term-gen-table">
              <thead>
                <tr>
                  <th>입력</th>
                  <th>상태</th>
                  <th>표준단어</th>
                  <th>영문명</th>
                  <th>표준용어</th>
                  <th>영문명</th>
                </tr>
              </thead>
              <tbody>
                {termGenItems.map((item, idx) => (
                  <tr key={`${idx}-${item.input}`}>
                    <td>{item.input}</td>
                    <td>{termGenStatusDisplay(item)}</td>
                    <td>{item.standard_word || ""}</td>
                    <td>{item.standard_word_eng || ""}</td>
                    <td>
                      {item.standard_term ||
                        item.term?.공통표준용어명 ||
                        ""}
                    </td>
                    <td>
                      {item.standard_term_eng ||
                        item.term?.공통표준용어영문약어명 ||
                        ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
