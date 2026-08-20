"use client";

import { useRef, useState } from "react";

type Tab = "excel" | "sql";

export type ImportMode = "replace" | "append";

type Props = {
  open: boolean;
  busy: boolean;
  progress?: string;
  onClose: () => void;
  onImportExcel: (file: File, mode: ImportMode) => void;
  onImportSql: (sql: string, filename: string, mode: ImportMode) => void;
};

export function ImportDialog({
  open,
  busy,
  progress,
  onClose,
  onImportExcel,
  onImportSql,
}: Props) {
  const [tab, setTab] = useState<Tab>("excel");
  const [mode, setMode] = useState<ImportMode>("replace");
  const [sql, setSql] = useState("");
  const [sqlName, setSqlName] = useState("script.sql");
  const excelRef = useRef<HTMLInputElement>(null);
  const sqlFileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div className="er-modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div
        className="er-modal er-import-modal"
        role="dialog"
        aria-labelledby="er-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="er-modal-head">
          <div>
            <h2 id="er-import-title">가져오기</h2>
            <p className="hint">
              Excel 정의서 또는 CREATE TABLE 스크립트로 테이블과 연결선을
              그립니다.
            </p>
          </div>
          <button
            type="button"
            className="btn ghost er-btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            닫기
          </button>
        </div>
        {busy ? (
          <div className="er-progress-inline">
            <span className="er-progress-dot" />
            <span>{progress || "가져오는 중…"}</span>
          </div>
        ) : null}

        <div className="er-choice-group">
          <span>가져오기 방식</span>
          <label>
            <input
              type="radio"
              name="er-import-mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            신규로 가져오기
          </label>
          <label>
            <input
              type="radio"
              name="er-import-mode"
              checked={mode === "append"}
              onChange={() => setMode("append")}
            />
            기존 작업에 더하기
          </label>
        </div>

        <div className="er-modal-tabs">
          <button
            type="button"
            className={`er-modal-tab${tab === "excel" ? " active" : ""}`}
            onClick={() => setTab("excel")}
          >
            Excel
          </button>
          <button
            type="button"
            className={`er-modal-tab${tab === "sql" ? " active" : ""}`}
            onClick={() => setTab("sql")}
          >
            SQL 스크립트
          </button>
        </div>

        {tab === "excel" ? (
          <div className="er-import-excel">
            <p className="hint">
              테이블 정의서(.xlsx)를 선택하면 테이블·컬럼·FK 관계가 ERD에
              반영됩니다.
            </p>
            <input
              ref={excelRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportExcel(f, mode);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => excelRef.current?.click()}
            >
              Excel 파일 선택
            </button>
          </div>
        ) : (
          <div className="er-import-sql">
            <p className="hint">
              CREATE TABLE, ALTER TABLE … FOREIGN KEY, COMMENT ON, CREATE
              INDEX 문을 붙여 넣으세요.
            </p>
            <div className="er-import-sql-actions">
              <input
                ref={sqlFileRef}
                type="file"
                accept=".sql,.txt,text/plain"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setSqlName(f.name);
                  void f.text().then(setSql);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="btn ghost er-btn-sm"
                disabled={busy}
                onClick={() => sqlFileRef.current?.click()}
              >
                .sql 파일 열기
              </button>
            </div>
            <textarea
              className="er-script-area"
              value={sql}
              spellCheck={false}
              placeholder={`CREATE TABLE customer (\n  customer_id INTEGER NOT NULL,\n  customer_nm VARCHAR(100) NOT NULL,\n  CONSTRAINT pk_customer PRIMARY KEY (customer_id)\n);`}
              onChange={(e) => setSql(e.target.value)}
            />
            <div className="er-modal-foot">
              <span className="hint">{sqlName}</span>
              <button
                type="button"
                className="btn"
                disabled={busy || !sql.trim()}
                onClick={() => onImportSql(sql, sqlName, mode)}
              >
                스크립트로 ERD 그리기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
