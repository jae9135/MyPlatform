"use client";

import { useEffect, useRef, useState } from "react";

import { DraggableModal } from "./DraggableModal";

type Tab = "excel" | "sql";

export type ImportMode = "replace" | "append";

export type ImportProgress = {
  pct: number;
  elapsedSec: number;
  etaSec: number | null;
  label: string;
};

/** 가져오기/내보내기 공통 진행 상태 */
export type RunProgress = ImportProgress;

type Props = {
  open: boolean;
  busy: boolean;
  progress?: string;
  importProgress?: ImportProgress | null;
  onClose: () => void;
  onCancel?: () => void;
  onImportExcel: (file: File, mode: ImportMode) => void;
  onImportSql: (sql: string, filename: string, mode: ImportMode) => void;
  hasExistingTables?: boolean;
};

export function ImportDialog({
  open,
  busy,
  progress,
  importProgress,
  onClose,
  onCancel,
  onImportExcel,
  onImportSql,
  hasExistingTables = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("excel");
  const [mode, setMode] = useState<ImportMode>("replace");
  const [sql, setSql] = useState("");
  const [sqlName, setSqlName] = useState("script.sql");
  const excelRef = useRef<HTMLInputElement>(null);
  const sqlFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode(hasExistingTables ? "append" : "replace");
    }
  }, [open, hasExistingTables]);

  return (
    <DraggableModal
      open={open}
      busy={busy}
      title="가져오기"
      titleId="er-import-title"
      subtitle={
        <>
          Excel 정의서 또는 CREATE TABLE 스크립트로 테이블과 연결선을
          그립니다.
        </>
      }
      onClose={onClose}
      onCancel={onCancel}
      className="er-import-modal"
      width={420}
    >
        {busy ? (
          importProgress ? (
            <div className="er-run-progress">
              <div
                className="er-progress-bar"
                role="progressbar"
                aria-valuenow={Math.round(importProgress.pct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="er-progress-fill"
                  style={{ width: `${importProgress.pct}%` }}
                />
              </div>
              <p className="hint">
                {importProgress.label} · {Math.round(importProgress.pct)}% · 경과{" "}
                {importProgress.elapsedSec}초
                {importProgress.etaSec != null && importProgress.etaSec > 0
                  ? ` · 약 ${importProgress.etaSec}초 남음`
                  : importProgress.pct >= 95
                    ? " · 거의 완료…"
                    : ""}
              </p>
            </div>
          ) : (
            <div className="er-progress-inline">
              <span className="er-progress-dot" />
              <span>{progress || "가져오는 중…"}</span>
            </div>
          )
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
    </DraggableModal>
  );
}
