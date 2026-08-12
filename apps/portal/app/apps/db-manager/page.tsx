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
      } catch (e) {
        setApplyMsg((m) => ({
          ...m,
          [step]: String((e as Error).message || e),
        }));
      } finally {
        setBusy(false);
      }
    },
    [applySql]
  );

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
          hint: "99_sample_data.sql",
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
          테이블정의서 Excel을 PostgreSQL DDL로 변환하고, API 서버에 설정된
          Supabase DB에 스키마·테이블·샘플을 적용할 수 있습니다.
        </p>
      </section>

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
      </section>
    </main>
  );
}
