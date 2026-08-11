"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

export default function DbManagerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState("테이블정의서");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [activeScript, setActiveScript] = useState<string>("");

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
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <main>
      <Link className="back" href="/">
        ← MyPlatform
      </Link>
      <section className="hero">
        <h1>DBManager</h1>
        <p>
          테이블정의서 Excel을 PostgreSQL DDL(SQL)로 변환합니다. 결과는 화면에서
          확인하고 ZIP으로 받을 수 있습니다. (DB 접속·실행은 추후 지원)
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
    </main>
  );
}
