"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

type SampleItem = {
  id: string;
  title: string;
  filename: string;
  description: string;
  bytes?: number;
  download_path: string;
};

type ScriptItem = {
  name: string;
  content: string;
};

type GenerateResult = {
  ok: boolean;
  source_filename: string;
  sheet: string;
  db_name: string;
  tables: {
    name: string;
    korean_name: string;
    schema: string;
    db_name: string;
    columns: number;
  }[];
  scripts: ScriptItem[];
};

type DbStatus = {
  ok: boolean;
  configured: boolean;
  target: string | null;
  message: string;
};

type ApplyStep = "schema" | "table" | "sample";

const DATA_PAGE_SIZE = 100;

type DataRows = {
  schema: string;
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  pk_columns?: string[];
  q?: string;
};

type DiffChange = {
  kind: string;
  severity: string;
  schema: string;
  table: string;
  column: string | null;
  detail: string;
};

type DiffResult = {
  ok: boolean;
  changes: DiffChange[];
  safe_sql: string;
  caution_sql: string;
  summary: Record<string, number>;
  source_filename?: string;
};

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

function scriptsForApply(result: GenerateResult | null): Record<ApplyStep, string> {
  const empty = { schema: "", table: "", sample: "" };
  if (!result) return empty;
  let schema = "";
  let sample = "";
  const tables: string[] = [];
  for (const s of result.scripts) {
    const name = s.name.toLowerCase();
    if (name.startsWith("01_schema")) schema = s.content;
    else if (name.startsWith("99_sample")) sample = s.content;
    else if (
      !name.startsWith("00_database") &&
      !name.startsWith("01_") &&
      !name.startsWith("99_")
    ) {
      tables.push(s.content);
    }
  }
  return {
    schema,
    table: tables.join("\n\n"),
    sample,
  };
}

export default function DbManagerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState("테이블정의서");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [activeScript, setActiveScript] = useState<string>("");
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [applySql, setApplySql] = useState<Record<ApplyStep, string>>({
    schema: "",
    table: "",
    sample: "",
  });
  const [applyMsg, setApplyMsg] = useState<Record<ApplyStep, string>>({
    schema: "",
    table: "",
    sample: "",
  });
  const [syncSchemas, setSyncSchemas] = useState<string[]>([]);
  const [syncSchema, setSyncSchema] = useState("db1");
  const [syncTables, setSyncTables] = useState<
    { name: string; korean_name: string; columns: number }[]
  >([]);
  const [syncSelected, setSyncSelected] = useState<string[]>([]);
  const [syncDbName, setSyncDbName] = useState("dbm");
  const [syncBaseFile, setSyncBaseFile] = useState<File | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [dataSchema, setDataSchema] = useState("db1");
  const [dataTables, setDataTables] = useState<
    { name: string; korean_name: string; columns: number }[]
  >([]);
  const [dataTable, setDataTable] = useState("");
  const [dataPage, setDataPage] = useState(1);
  const [dataRows, setDataRows] = useState<DataRows | null>(null);
  const [dataMsg, setDataMsg] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [conflictMode, setConflictMode] = useState("skip");
  const [diffFile, setDiffFile] = useState<File | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffMsg, setDiffMsg] = useState("");
  const [includeCaution, setIncludeCaution] = useState(false);
  const [alterSql, setAlterSql] = useState("");
  const [uiTab, setUiTab] = useState<
    "generate" | "apply" | "reverse" | "data" | "diff"
  >("generate");
  const [dataQ, setDataQ] = useState("");
  const [uploadPreview, setUploadPreview] = useState<{
    columns: string[];
    row_count: number;
    preview: Record<string, unknown>[];
    skipped_headers: string[];
  } | null>(null);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [runEvents, setRunEvents] = useState<
    { kind: string; ok: boolean; created_at: string | null; detail: Record<string, unknown> }[]
  >([]);
  const [uploadErrors, setUploadErrors] = useState<
    { row: number; message: string }[]
  >([]);

  const refreshDbStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/db-manager/db-status`);
      if (!res.ok) return;
      setDbStatus(await res.json());
    } catch {
      setDbStatus({
        ok: false,
        configured: false,
        target: null,
        message: "API에 연결할 수 없습니다.",
      });
    }
  }, []);

  const loadSyncSchemas = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/db-manager/schemas`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMsg(j.detail || "스키마 목록을 가져오지 못했습니다.");
        setSyncSchemas([]);
        return;
      }
      const list: string[] = j.schemas || [];
      setSyncSchemas(list);
      setSyncMsg("");
      setSyncSchema((prev) =>
        list.length === 0 ? prev : list.includes(prev) ? prev : list[0]
      );
    } catch {
      setSyncMsg("스키마 목록 API에 연결할 수 없습니다.");
    }
  }, []);

  const loadSyncTables = useCallback(async (schema: string) => {
    if (!schema) {
      setSyncTables([]);
      setSyncSelected([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/v1/db-manager/schemas/${encodeURIComponent(schema)}/tables`
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMsg(j.detail || "테이블 목록을 가져오지 못했습니다.");
        setSyncTables([]);
        setSyncSelected([]);
        return;
      }
      const list = j.tables || [];
      setSyncTables(list);
      setSyncSelected(list.map((t: { name: string }) => t.name));
      setSyncMsg(
        list.length
          ? `${schema}: 테이블 ${list.length}개`
          : `${schema}: 테이블 없음`
      );
    } catch {
      setSyncMsg("테이블 목록 API에 연결할 수 없습니다.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/db-manager/samples`);
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setSamples(j.items || []);
      } catch {
        /* API offline */
      }
    })();
    refreshDbStatus();
    return () => {
      cancelled = true;
    };
  }, [refreshDbStatus]);

  useEffect(() => {
    setApplySql(scriptsForApply(result));
    setApplyMsg({ schema: "", table: "", sample: "" });
  }, [result]);

  useEffect(() => {
    if (dbStatus?.ok) {
      loadSyncSchemas();
    }
  }, [dbStatus?.ok, loadSyncSchemas]);

  useEffect(() => {
    if (dbStatus?.ok && syncSchema) {
      loadSyncTables(syncSchema);
    }
  }, [dbStatus?.ok, syncSchema, loadSyncTables]);

  useEffect(() => {
    if (dbStatus?.ok && syncSchemas.length) {
      setDataSchema((prev) =>
        syncSchemas.includes(prev) ? prev : syncSchemas[0]
      );
    }
  }, [dbStatus?.ok, syncSchemas]);

  const loadDataTables = useCallback(async (schema: string) => {
    if (!schema) {
      setDataTables([]);
      setDataTable("");
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/v1/db-manager/schemas/${encodeURIComponent(schema)}/tables`
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDataMsg(j.detail || "테이블 목록을 가져오지 못했습니다.");
        setDataTables([]);
        setDataTable("");
        return;
      }
      const list = j.tables || [];
      setDataTables(list);
      setDataTable((prev) =>
        list.some((t: { name: string }) => t.name === prev)
          ? prev
          : list[0]?.name || ""
      );
    } catch {
      setDataMsg("테이블 목록 API에 연결할 수 없습니다.");
    }
  }, []);

  useEffect(() => {
    if (dbStatus?.ok && dataSchema) {
      loadDataTables(dataSchema);
    }
  }, [dbStatus?.ok, dataSchema, loadDataTables]);

  const loadDataRows = useCallback(
    async (page = 1) => {
      if (!dataSchema || !dataTable) {
        setDataMsg("스키마와 테이블을 선택하세요.");
        return;
      }
      setBusy(true);
      setDataMsg("조회 중…");
      try {
        const offset = (page - 1) * DATA_PAGE_SIZE;
        const qs = new URLSearchParams({
          limit: String(DATA_PAGE_SIZE),
          offset: String(offset),
        });
        if (dataQ.trim()) qs.set("q", dataQ.trim());
        const res = await fetch(
          `${API_BASE}/v1/db-manager/schemas/${encodeURIComponent(
            dataSchema
          )}/tables/${encodeURIComponent(dataTable)}/rows?${qs}`
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.detail || "조회 실패");
        setDataRows(j as DataRows);
        setDataPage(page);
        setDataMsg(`완료 — 전체 ${j.total}건`);
      } catch (e) {
        setDataRows(null);
        setDataMsg(String((e as Error).message || e));
      } finally {
        setBusy(false);
      }
    },
    [dataSchema, dataTable, dataQ]
  );

  const uploadData = useCallback(async () => {
    if (!dataSchema || !dataTable) {
      setDataMsg("스키마와 테이블을 선택하세요.");
      return;
    }
    if (!uploadFile) {
      setDataMsg("CSV 또는 Excel 파일을 선택하세요.");
      return;
    }
    setBusy(true);
    setDataMsg("업로드 중…");
    try {
      const fd = new FormData();
      fd.append("schema", dataSchema);
      fd.append("table", dataTable);
      fd.append("on_conflict", conflictMode);
      fd.append("file", uploadFile);
      const res = await fetch(`${API_BASE}/v1/db-manager/data-upload`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || "업로드 실패");
      setDataMsg(`완료 — ${j.message}`);
      setMsg(`데이터 업로드: ${dataSchema}.${dataTable}`);
      setUploadErrors(j.errors || []);
      const saved = `완료 — ${j.message}`;
      await loadDataRows(1);
      setDataMsg(saved);
    } catch (e) {
      setDataMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [dataSchema, dataTable, uploadFile, conflictMode, loadDataRows]);

  const previewUpload = useCallback(async () => {
    if (!dataSchema || !dataTable || !uploadFile) {
      setDataMsg("스키마, 테이블, 파일을 선택하세요.");
      return;
    }
    setBusy(true);
    setDataMsg("미리보기 중…");
    try {
      const fd = new FormData();
      fd.append("schema", dataSchema);
      fd.append("table", dataTable);
      fd.append("preview", "true");
      fd.append("file", uploadFile);
      const res = await fetch(`${API_BASE}/v1/db-manager/data-upload`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || "미리보기 실패");
      setUploadPreview(j);
      setDataMsg(`미리보기 — ${j.row_count}행, 컬럼 ${j.columns?.length || 0}개`);
    } catch (e) {
      setUploadPreview(null);
      setDataMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [dataSchema, dataTable, uploadFile]);

  const exportData = useCallback(
    async (fmt: "csv" | "xlsx") => {
      if (!dataSchema || !dataTable) return;
      setBusy(true);
      try {
        const qs = new URLSearchParams({ format: fmt });
        if (dataQ.trim()) qs.set("q", dataQ.trim());
        const res = await fetch(
          `${API_BASE}/v1/db-manager/schemas/${encodeURIComponent(
            dataSchema
          )}/tables/${encodeURIComponent(dataTable)}/rows?${qs}`
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.detail || "다운로드 실패");
        }
        const blob = await res.blob();
        downloadBlob(blob, `${dataSchema}_${dataTable}.${fmt}`);
        setDataMsg(`완료 — ${fmt.toUpperCase()} 저장`);
      } catch (e) {
        setDataMsg(String((e as Error).message || e));
      } finally {
        setBusy(false);
      }
    },
    [dataSchema, dataTable, dataQ]
  );

  const saveEditRow = useCallback(async () => {
    if (!editRow || !dataSchema || !dataTable || !dataRows?.pk_columns?.length) {
      setDataMsg("PK가 없어 단건 수정할 수 없습니다.");
      return;
    }
    const pk: Record<string, unknown> = {};
    for (const c of dataRows.pk_columns) pk[c] = editRow[c];
    const values: Record<string, unknown> = {};
    for (const c of dataRows.columns) {
      if (!dataRows.pk_columns.includes(c)) values[c] = editRow[c];
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/v1/db-manager/data-row`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: dataSchema,
          table: dataTable,
          pk,
          values,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || "수정 실패");
      setEditRow(null);
      setDataMsg("완료 — 행을 수정했습니다.");
      await loadDataRows(dataPage);
    } catch (e) {
      setDataMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [editRow, dataSchema, dataTable, dataRows, dataPage, loadDataRows]);

  const deleteRow = useCallback(
    async (row: Record<string, unknown>) => {
      if (!dataRows?.pk_columns?.length) {
        setDataMsg("PK가 없어 단건 삭제할 수 없습니다.");
        return;
      }
      if (!window.confirm("이 행을 삭제할까요?")) return;
      const pk: Record<string, unknown> = {};
      for (const c of dataRows.pk_columns) pk[c] = row[c];
      setBusy(true);
      try {
        const res = await fetch(`${API_BASE}/v1/db-manager/data-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema: dataSchema, table: dataTable, pk }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.detail || "삭제 실패");
        setDataMsg("완료 — 행을 삭제했습니다.");
        await loadDataRows(dataPage);
      } catch (e) {
        setDataMsg(String((e as Error).message || e));
      } finally {
        setBusy(false);
      }
    },
    [dataRows, dataSchema, dataTable, dataPage, loadDataRows]
  );

  const loadRunEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/db-manager/run-events?limit=15`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setRunEvents(j.items || []);
    } catch {
      /* ignore */
    }
  }, []);

  const runDiff = useCallback(async () => {
    const src = diffFile || file;
    if (!src) {
      setDiffMsg("비교할 테이블정의서 Excel을 선택하세요.");
      return;
    }
    setBusy(true);
    setDiffMsg("비교 중…");
    setDiffResult(null);
    try {
      const fd = new FormData();
      fd.append("design", src);
      fd.append("sheet", sheet || "테이블정의서");
      const res = await fetch(`${API_BASE}/v1/db-manager/diff`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || "비교 실패");
      setDiffResult(j as DiffResult);
      const nextSql = includeCaution
        ? [j.safe_sql, j.caution_sql].filter(Boolean).join("\n\n")
        : j.safe_sql || "";
      setAlterSql(nextSql);
      const n = (j.changes || []).length;
      setDiffMsg(n ? `완료 — 차이 ${n}건` : "완료 — 차이 없음");
    } catch (e) {
      setDiffMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [diffFile, file, sheet, includeCaution]);

  const applyAlter = useCallback(async () => {
    if (!alterSql.trim()) {
      setDiffMsg("적용할 SQL이 없습니다. 먼저 비교하세요.");
      return;
    }
    if (!window.confirm("ALTER를 실행할까요? 이 작업은 DB 구조를 바꿉니다.")) {
      return;
    }
    setBusy(true);
    setDiffMsg("ALTER 적용 중…");
    try {
      const res = await fetch(`${API_BASE}/v1/db-manager/apply-alter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: alterSql,
          include_caution: includeCaution,
          dry_run: false,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || "적용 실패");
      setDiffMsg(j.message || "완료");
      setMsg("완료 — ALTER 적용됨");
    } catch (e) {
      setDiffMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [alterSql, includeCaution]);

  const dryRunAlter = useCallback(async () => {
    if (!alterSql.trim()) {
      setDiffMsg("검증할 SQL이 없습니다.");
      return;
    }
    setBusy(true);
    setDiffMsg("검증 중…");
    try {
      const res = await fetch(`${API_BASE}/v1/db-manager/apply-alter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: alterSql,
          include_caution: includeCaution,
          dry_run: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || "검증 실패");
      setDiffMsg(j.message || "검증 OK");
    } catch (e) {
      setDiffMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [alterSql, includeCaution]);

  useEffect(() => {
    if (dbStatus?.ok) loadRunEvents();
  }, [dbStatus?.ok, loadRunEvents]);

  useEffect(() => {
    if (!diffResult) return;
    setAlterSql(
      includeCaution
        ? [diffResult.safe_sql, diffResult.caution_sql]
            .filter(Boolean)
            .join("\n\n")
        : diffResult.safe_sql || ""
    );
  }, [includeCaution, diffResult]);

  const generate = useCallback(async () => {
    if (!file) {
      setMsg("테이블정의서 Excel을 선택하세요.");
      return;
    }
    setBusy(true);
    setMsg("DDL 생성 중…");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("design", file);
      fd.append("sheet", sheet || "테이블정의서");
      fd.append("format", "json");
      const res = await fetch(`${API_BASE}/v1/db-manager/generate`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = "생성 실패";
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const data = (await res.json()) as GenerateResult;
      setResult(data);
      setActiveScript(data.scripts[0]?.name || "");
      setMsg(
        `완료 — 테이블 ${data.tables.length}개, 스크립트 ${data.scripts.length}개`
      );
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [file, sheet]);

  const downloadZip = useCallback(async () => {
    if (!file) {
      setMsg("ZIP을 받으려면 설계서를 선택하세요.");
      return;
    }
    setBusy(true);
    setMsg("ZIP 생성 중…");
    try {
      const fd = new FormData();
      fd.append("design", file);
      fd.append("sheet", sheet || "테이블정의서");
      fd.append("format", "zip");
      const res = await fetch(`${API_BASE}/v1/db-manager/generate`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = "ZIP 다운로드 실패";
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      downloadBlob(blob, "dbmanager_ddl.zip");
      setMsg("완료 — DDL ZIP을 저장했습니다.");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [file, sheet]);

  const applyStep = useCallback(
    async (step: ApplyStep) => {
      const sql = applySql[step].trim();
      if (!sql) {
        setApplyMsg((m) => ({
          ...m,
          [step]: "SQL이 비어 있습니다. 먼저 DDL을 생성하세요.",
        }));
        return;
      }
      setBusy(true);
      setApplyMsg((m) => ({ ...m, [step]: "실행 중…" }));
      try {
        const res = await fetch(`${API_BASE}/v1/db-manager/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, sql }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(j.detail || j.message || "적용 실패");
        }
        setApplyMsg((m) => ({
          ...m,
          [step]: j.message || "완료",
        }));
        setMsg(`완료 — ${step} 적용됨`);
        loadRunEvents();
      } catch (e) {
        setApplyMsg((m) => ({
          ...m,
          [step]: String((e as Error).message || e),
        }));
      } finally {
        setBusy(false);
      }
    },
    [applySql, loadRunEvents]
  );

  const exportDesign = useCallback(async () => {
    if (!syncSchema) {
      setSyncMsg("스키마를 선택하세요.");
      return;
    }
    if (!syncSelected.length) {
      setSyncMsg("내보낼 테이블을 하나 이상 선택하세요.");
      return;
    }
    setBusy(true);
    setSyncMsg("설계서 생성 중…");
    try {
      const fd = new FormData();
      fd.append("schema", syncSchema);
      fd.append("tables", syncSelected.join(","));
      fd.append("db_name", syncDbName || "dbm");
      if (syncBaseFile) {
        fd.append("design", syncBaseFile);
      }
      const res = await fetch(`${API_BASE}/v1/db-manager/export-design`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = "설계서 생성 실패";
        try {
          const j = await res.json();
          detail = j.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const fname = m?.[1] || `design_${syncSchema}.xlsx`;
      downloadBlob(blob, fname);
      setSyncMsg(
        `완료 — ${syncSelected.length}개 테이블을 설계서로 저장했습니다.`
      );
      setMsg(`설계서 저장: ${fname}`);
    } catch (e) {
      setSyncMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [syncSchema, syncSelected, syncDbName, syncBaseFile]);

  function toggleSyncTable(name: string) {
    setSyncSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

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

  function downloadCurrentScript() {
    if (!result || !activeScript) return;
    const script = result.scripts.find((s) => s.name === activeScript);
    if (!script) return;
    downloadBlob(
      new Blob([script.content], { type: "text/plain;charset=utf-8" }),
      script.name
    );
    setMsg(`저장: ${script.name}`);
  }

  const currentContent =
    result?.scripts.find((s) => s.name === activeScript)?.content || "";

  const applySteps = useMemo(
    () =>
      [
        {
          id: "schema" as const,
          title: "1. 스키마 생성",
          hint: "01_schema.sql — CREATE DATABASE는 Supabase에서 생략",
        },
        {
          id: "table" as const,
          title: "2. 테이블 생성",
          hint: "테이블별 CREATE TABLE 스크립트",
        },
        {
          id: "sample" as const,
          title: "3. 샘플 데이터",
          hint: "99_sample_data.sql — PK는 1,2,… 자동증가(중복 방지)",
        },
      ] as const,
    []
  );

  return (
    <main>
      <Link className="back" href="/">
        ← MyPlatform
      </Link>
      <section className="hero">
        <h1>DBManager</h1>
        <p>
          테이블정의서 Excel을 PostgreSQL DDL로 변환하고, Supabase에
          스키마·테이블·샘플을 적용하거나, DB 구조·데이터를 조회하고
          설계서와 비교할 수 있습니다.
        </p>
      </section>

      <div className="page-tabs" role="tablist">
        {(
          [
            ["generate", "설계서 → 스크립트"],
            ["apply", "스크립트 → 적용"],
            ["reverse", "DB → 설계서"],
            ["data", "데이터 관리"],
            ["diff", "설계서 ↔ DB"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${uiTab === id ? "active" : ""}`}
            onClick={() => setUiTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {uiTab === "generate" ? (
      <>
      <section className="panel">
        <h3>샘플 데이터</h3>
        <p className="hint">샘플 설계서로 DDL 생성을 시험할 수 있습니다.</p>
        {samples.length === 0 ? (
          <p className="hint">등록된 샘플이 없거나 API에 연결되지 않았습니다.</p>
        ) : (
          <ul className="sample-list">
            {samples.map((s) => (
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
        <h3>DDL 생성</h3>
        <p className="hint">
          API: <code>{API_BASE}</code>
        </p>
        <div className="row">
          <label>
            시트명{" "}
            <input
              type="text"
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              placeholder="테이블정의서"
            />
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
            onClick={generate}
          >
            {busy ? "실행 중…" : "DDL 생성"}
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={busy || !file}
            onClick={downloadZip}
          >
            ZIP 다운로드
          </button>
        </div>
        <p
          className={`msg ${
            msg.includes("완료") || msg.includes("샘플 저장") || msg.includes("저장:")
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
          <h3>생성 결과</h3>
          <p className="hint">
            파일: {result.source_filename} · DB: {result.db_name} · 시트:{" "}
            {result.sheet}
          </p>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">tables</div>
              <div className="stat-value">{result.tables.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">scripts</div>
              <div className="stat-value">{result.scripts.length}</div>
            </div>
          </div>
          <h4 className="subhead">테이블</h4>
          <div className="table-wrap" style={{ maxHeight: 200 }}>
            <table className="result-table">
              <thead>
                <tr>
                  <th>영문명</th>
                  <th>한글명</th>
                  <th>스키마</th>
                  <th>컬럼수</th>
                </tr>
              </thead>
              <tbody>
                {result.tables.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td>{t.korean_name}</td>
                    <td>{t.schema}</td>
                    <td>{t.columns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4 className="subhead">스크립트</h4>
          <div className="tabs">
            {result.scripts.map((s) => (
              <button
                key={s.name}
                type="button"
                className={`tab ${activeScript === s.name ? "active" : ""}`}
                onClick={() => setActiveScript(s.name)}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={downloadCurrentScript}
              disabled={!activeScript}
            >
              현재 스크립트 저장
            </button>
          </div>
          <pre className="sql-preview">{currentContent}</pre>
        </section>
      ) : null}
      </>
      ) : null}

      {uiTab === "apply" ? (
      <section className="panel">
        <h3>Supabase에 적용</h3>
        <p className="hint">
          브라우저에 DB 비밀번호를 두지 않습니다. API 서버의{" "}
          <code>DATABASE_URL</code>로 Supabase Postgres에 접속합니다. CREATE
          DATABASE 단계는 생략하고, 기존 프로젝트 DB에 schema → table → sample
          순으로 적용하세요.
        </p>
        <div className="row">
          <span
            className={`msg ${
              dbStatus?.ok ? "ok" : dbStatus ? "err" : ""
            }`}
          >
            {dbStatus
              ? dbStatus.ok
                ? `연결 OK — ${dbStatus.target}`
                : `연결 불가 — ${dbStatus.message}`
              : "연결 상태 확인 중…"}
          </span>
          <button
            className="btn ghost"
            type="button"
            disabled={busy}
            onClick={refreshDbStatus}
          >
            상태 새로고침
          </button>
        </div>

        {applySteps.map((step) => (
          <div key={step.id} className="apply-step">
            <h4 className="subhead">{step.title}</h4>
            <p className="hint">{step.hint}</p>
            <textarea
              className="sql-input"
              rows={8}
              value={applySql[step.id]}
              onChange={(e) =>
                setApplySql((s) => ({ ...s, [step.id]: e.target.value }))
              }
              placeholder="DDL 생성 후 자동으로 채워집니다"
            />
            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={busy || !applySql[step.id].trim()}
                onClick={() => applyStep(step.id)}
              >
                실행
              </button>
              <span
                className={`msg ${
                  applyMsg[step.id].includes("success") ||
                  applyMsg[step.id].includes("완료") ||
                  applyMsg[step.id].includes("successfully")
                    ? "ok"
                    : applyMsg[step.id] && applyMsg[step.id] !== "실행 중…"
                      ? "err"
                      : ""
                }`}
              >
                {applyMsg[step.id]}
              </span>
            </div>
          </div>
        ))}
        {runEvents.length ? (
          <>
            <h4 className="subhead">최근 적용 이력</h4>
            <p className="hint">메타만 저장합니다. SQL/파일 내용은 보관하지 않습니다.</p>
            <ul className="sample-list">
              {runEvents.map((ev, i) => (
                <li key={`${ev.created_at}-${i}`}>
                  <div>
                    <strong>{ev.kind}</strong>
                    <span className="hint">
                      {" "}
                      {ev.ok ? "ok" : "fail"} · {ev.created_at || ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <button
              className="btn ghost"
              type="button"
              disabled={busy}
              onClick={loadRunEvents}
            >
              이력 새로고침
            </button>
          </>
        ) : null}
      </section>
      ) : null}

      {uiTab === "reverse" ? (
      <section className="panel">
        <h3>DB → 설계서 반영</h3>
        <p className="hint">
          Supabase에 있는 테이블 구조를 읽어 테이블정의서 Excel로 다운로드합니다.
          기준 설계서를 선택하면 기존 행에 병합(한글명 유지)하고, 없으면 DB
          내용만으로 새 양식을 만듭니다.
        </p>
        {!dbStatus?.ok ? (
          <p className="hint">
            DB 연결이 필요합니다. 위 「Supabase에 적용」에서 연결 상태를
            확인하세요.
          </p>
        ) : (
          <>
            <div className="row">
              <label>
                스키마{" "}
                <select
                  value={syncSchema}
                  onChange={(e) => setSyncSchema(e.target.value)}
                  disabled={busy || syncSchemas.length === 0}
                >
                  {syncSchemas.length === 0 ? (
                    <option value={syncSchema}>{syncSchema}</option>
                  ) : (
                    syncSchemas.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                DB명{" "}
                <input
                  type="text"
                  value={syncDbName}
                  onChange={(e) => setSyncDbName(e.target.value)}
                  disabled={busy}
                  style={{ width: "6rem" }}
                />
              </label>
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  loadSyncSchemas();
                  if (syncSchema) loadSyncTables(syncSchema);
                }}
              >
                목록 새로고침
              </button>
            </div>

            <div className="row" style={{ marginTop: "0.75rem" }}>
              <label>
                기준 설계서 (선택){" "}
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  disabled={busy}
                  onChange={(e) =>
                    setSyncBaseFile(e.target.files?.[0] || null)
                  }
                />
              </label>
            </div>

            <h4 className="subhead">테이블 선택</h4>
            {syncTables.length === 0 ? (
              <p className="hint">이 스키마에 테이블이 없습니다.</p>
            ) : (
              <>
                <div className="row">
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setSyncSelected(syncTables.map((t) => t.name))
                    }
                  >
                    전체 선택
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => setSyncSelected([])}
                  >
                    선택 해제
                  </button>
                  <span className="hint">
                    {syncSelected.length}/{syncTables.length} 선택
                  </span>
                </div>
                <ul className="sample-list">
                  {syncTables.map((t) => (
                    <li key={t.name}>
                      <label
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={syncSelected.includes(t.name)}
                          disabled={busy}
                          onChange={() => toggleSyncTable(t.name)}
                        />
                        <span>
                          <strong>{t.name}</strong>
                          <span className="hint">
                            {" "}
                            {t.korean_name} · 컬럼 {t.columns}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="row" style={{ marginTop: "0.75rem" }}>
              <button
                className="btn"
                type="button"
                disabled={busy || !syncSelected.length}
                onClick={exportDesign}
              >
                설계서 다운로드
              </button>
              {syncMsg ? (
                <span
                  className={`msg ${
                    syncMsg.includes("완료")
                      ? "ok"
                      : syncMsg.includes("생성 중") ||
                          syncMsg.includes("테이블")
                        ? ""
                        : "err"
                  }`}
                >
                  {syncMsg}
                </span>
              ) : null}
            </div>
          </>
        )}
      </section>
      ) : null}

      {uiTab === "data" ? (
      <section className="panel">
        <h3>데이터 관리</h3>
        <p className="hint">
          테이블 데이터를 조회하고 CSV/Excel로 넣을 수 있습니다. 임의 SQL은
          실행하지 않으며, 플랫폼 메타 테이블에는 쓰지 않습니다.
        </p>
        {!dbStatus?.ok ? (
          <p className="hint">DB 연결이 필요합니다.</p>
        ) : (
          <>
            <div className="row">
              <label>
                스키마{" "}
                <select
                  value={dataSchema}
                  onChange={(e) => {
                    setDataSchema(e.target.value);
                    setDataRows(null);
                    setDataPage(1);
                  }}
                  disabled={busy || syncSchemas.length === 0}
                >
                  {(syncSchemas.length ? syncSchemas : [dataSchema]).map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label>
                테이블{" "}
                <select
                  value={dataTable}
                  onChange={(e) => {
                    setDataTable(e.target.value);
                    setDataRows(null);
                    setDataPage(1);
                  }}
                  disabled={busy || dataTables.length === 0}
                >
                  {dataTables.length === 0 ? (
                    <option value="">테이블 없음</option>
                  ) : (
                    dataTables.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} ({t.columns})
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                검색{" "}
                <input
                  type="text"
                  value={dataQ}
                  onChange={(e) => setDataQ(e.target.value)}
                  placeholder="부분 일치"
                  disabled={busy}
                />
              </label>
              <button
                className="btn"
                type="button"
                disabled={busy || !dataTable}
                onClick={() => loadDataRows(1)}
              >
                조회
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={busy || !dataTable}
                onClick={() => exportData("csv")}
              >
                CSV
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={busy || !dataTable}
                onClick={() => exportData("xlsx")}
              >
                Excel
              </button>
            </div>

            {dataRows ? (
              <>
                <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
                  <table className="result-table">
                    <thead>
                      <tr>
                        {dataRows.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                        <th>동작</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.rows.length === 0 ? (
                        <tr>
                          <td colSpan={Math.max(2, dataRows.columns.length + 1)}>
                            표시할 행이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        dataRows.rows.map((row, i) => {
                          const editing =
                            !!editRow &&
                            (dataRows.pk_columns || []).length > 0 &&
                            dataRows.pk_columns!.every(
                              (c) =>
                                String(editRow[c] ?? "") ===
                                String(row[c] ?? "")
                            );
                          return (
                          <tr key={dataRows.offset + i}>
                            {dataRows.columns.map((c) => (
                              <td key={c}>
                                {editing ? (
                                  <input
                                    type="text"
                                    value={String(editRow?.[c] ?? "")}
                                    disabled={dataRows.pk_columns?.includes(c)}
                                    onChange={(e) =>
                                      setEditRow((prev) =>
                                        prev
                                          ? { ...prev, [c]: e.target.value }
                                          : prev
                                      )
                                    }
                                  />
                                ) : (
                                  String(row[c] ?? "")
                                )}
                              </td>
                            ))}
                            <td>
                              {editing ? (
                                <>
                                  <button
                                    className="btn"
                                    type="button"
                                    disabled={busy}
                                    onClick={saveEditRow}
                                  >
                                    저장
                                  </button>
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    onClick={() => setEditRow(null)}
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setEditRow({ ...row })}
                                  >
                                    수정
                                  </button>
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => deleteRow(row)}
                                  >
                                    삭제
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <span className="hint">
                    전체 {dataRows.total}건 ·{" "}
                    {dataRows.total === 0
                      ? "0"
                      : `${dataRows.offset + 1}–${
                          dataRows.offset + dataRows.rows.length
                        }`}{" "}
                    표시
                  </span>
                  {Math.ceil(dataRows.total / DATA_PAGE_SIZE) > 1 ? (
                    <div className="pager-controls">
                      <button
                        type="button"
                        className="pager-btn"
                        disabled={busy || dataPage <= 1}
                        onClick={() => loadDataRows(dataPage - 1)}
                      >
                        이전
                      </button>
                      {pageNumbers(
                        dataPage,
                        Math.max(1, Math.ceil(dataRows.total / DATA_PAGE_SIZE))
                      ).map((p, i) =>
                        p === "…" ? (
                          <span key={`e-${i}`} className="pager-ellipsis">
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className={`pager-btn ${
                              dataPage === p ? "active" : ""
                            }`}
                            disabled={busy}
                            onClick={() => loadDataRows(p)}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className="pager-btn"
                        disabled={
                          busy ||
                          dataPage >=
                            Math.ceil(dataRows.total / DATA_PAGE_SIZE)
                        }
                        onClick={() => loadDataRows(dataPage + 1)}
                      >
                        다음
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <h4 className="subhead">CSV / Excel 업로드</h4>
            <p className="hint">
              첫 행이 컬럼명이어야 합니다. PK 충돌:
              skip(건너뛰기), update(갱신), renumber(번호 +1), insert(오류).
            </p>
            <div className="row">
              <input
                type="file"
                accept=".csv,.xlsx,.xlsm"
                disabled={busy}
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              <label>
                충돌 처리{" "}
                <select
                  value={conflictMode}
                  onChange={(e) => setConflictMode(e.target.value)}
                  disabled={busy}
                >
                  <option value="skip">skip</option>
                  <option value="update">update</option>
                  <option value="renumber">renumber</option>
                  <option value="insert">insert</option>
                </select>
              </label>
              <button
                className="btn ghost"
                type="button"
                disabled={busy || !uploadFile || !dataTable}
                onClick={previewUpload}
              >
                미리보기
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || !uploadFile || !dataTable}
                onClick={uploadData}
              >
                업로드
              </button>
            </div>
            {uploadPreview ? (
              <p className="hint">
                미리보기 {uploadPreview.row_count}행 · 컬럼{" "}
                {uploadPreview.columns.join(", ")}
                {uploadPreview.skipped_headers.length
                  ? ` · 무시: ${uploadPreview.skipped_headers.join(", ")}`
                  : ""}
              </p>
            ) : null}
            {uploadErrors.length ? (
              <div className="row">
                <span className="msg err">
                  오류 {uploadErrors.length}건
                </span>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    downloadBlob(
                      new Blob(
                        [
                          "row,message\n" +
                            uploadErrors
                              .map((e) => `${e.row},"${String(e.message).replace(/"/g, '""')}"`)
                              .join("\n"),
                        ],
                        { type: "text/csv;charset=utf-8" }
                      ),
                      "upload_errors.csv"
                    )
                  }
                >
                  오류 CSV
                </button>
              </div>
            ) : null}
            {dataMsg ? (
              <p
                className={`msg ${
                  dataMsg.includes("완료")
                    ? "ok"
                    : dataMsg.includes("중…")
                      ? ""
                      : "err"
                }`}
              >
                {dataMsg}
              </p>
            ) : null}
          </>
        )}
      </section>
      ) : null}

      {uiTab === "diff" ? (
      <section className="panel">
        <h3>설계서 ↔ DB 비교</h3>
        <p className="hint">
          설계서와 현재 DB를 비교해 ALTER 초안을 만듭니다. DROP은 만들지
          않습니다. 컬럼 타입 변경·NOT NULL은 주의(caution)로 표시됩니다.
        </p>
        {!dbStatus?.ok ? (
          <p className="hint">DB 연결이 필요합니다.</p>
        ) : (
          <>
            <div className="row">
              <label>
                비교할 설계서 (비우면 위 DDL 생성 파일 사용){" "}
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  disabled={busy}
                  onChange={(e) => setDiffFile(e.target.files?.[0] || null)}
                />
              </label>
              <button
                className="btn"
                type="button"
                disabled={busy || (!diffFile && !file)}
                onClick={runDiff}
              >
                비교
              </button>
            </div>
            {diffResult ? (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">new tables</div>
                    <div className="stat-value">
                      {diffResult.summary.new_tables ?? 0}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">add columns</div>
                    <div className="stat-value">
                      {diffResult.summary.add_columns ?? 0}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">type changes</div>
                    <div className="stat-value">
                      {diffResult.summary.type_changes ?? 0}
                    </div>
                  </div>
                </div>
                {diffResult.changes.length ? (
                  <div className="table-wrap">
                    <table className="result-table">
                      <thead>
                        <tr>
                          <th>구분</th>
                          <th>심각도</th>
                          <th>테이블</th>
                          <th>컬럼</th>
                          <th>내용</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffResult.changes.map((c, i) => (
                          <tr key={`${c.kind}-${c.table}-${c.column}-${i}`}>
                            <td>{c.kind}</td>
                            <td>{c.severity}</td>
                            <td>
                              {c.schema}.{c.table}
                            </td>
                            <td>{c.column || "-"}</td>
                            <td>{c.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="hint">적용할 구조 차이가 없습니다.</p>
                )}
                <label className="row" style={{ marginTop: "0.75rem" }}>
                  <input
                    type="checkbox"
                    checked={includeCaution}
                    disabled={busy}
                    onChange={(e) => setIncludeCaution(e.target.checked)}
                  />
                  <span className="hint">
                    caution 변경(타입/NOT NULL)도 SQL에 포함
                  </span>
                </label>
                <textarea
                  className="sql-input"
                  rows={8}
                  value={alterSql}
                  onChange={(e) => setAlterSql(e.target.value)}
                  placeholder="비교 후 ALTER 초안이 채워집니다"
                />
                <div className="row">
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={busy || !alterSql.trim()}
                    onClick={dryRunAlter}
                  >
                    검증만 (실행 안 함)
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || !alterSql.trim()}
                    onClick={applyAlter}
                  >
                    ALTER 적용
                  </button>
                </div>
              </>
            ) : null}
            {diffMsg ? (
              <p
                className={`msg ${
                  diffMsg.includes("완료") ||
                  diffMsg.includes("successfully")
                    ? "ok"
                    : diffMsg.includes("중…")
                      ? ""
                      : "err"
                }`}
              >
                {diffMsg}
              </p>
            ) : null}
          </>
        )}
      </section>
      ) : null}
    </main>
  );
}
