"use client";

import { useEffect, useRef, useState } from "react";

export type ExportKind = "excel" | "script";
export type ExportScope = "all" | "selected";

export type GeneratedScript = { name: string; content: string };
export type ScriptExportResult = {
  schema?: string;
  scripts: GeneratedScript[];
};

type Props = {
  open: boolean;
  busy: boolean;
  progress?: string;
  tableCount: number;
  selectedCount: number;
  templateName: string;
  scriptResult: ScriptExportResult | null;
  onClose: () => void;
  onExportExcel: (scope: ExportScope, templateFile?: File) => void;
  onGenerateScript: (scope: ExportScope) => void;
  onClearScript: () => void;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: GeneratedScript[]) {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const data = enc.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, part) => n + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Blob(
    [...locals, ...centrals, eocd] as BlobPart[],
    { type: "application/zip" }
  );
}

export function ExportDialog({
  open,
  busy,
  progress,
  tableCount,
  selectedCount,
  templateName,
  scriptResult,
  onClose,
  onExportExcel,
  onGenerateScript,
  onClearScript,
}: Props) {
  const [kind, setKind] = useState<ExportKind>("excel");
  const [scope, setScope] = useState<ExportScope>("all");
  const [picked, setPicked] = useState<File | null>(null);
  const [activeScript, setActiveScript] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPicked(null);
      setScope("all");
      setActiveScript("");
      onClearScript();
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const first = scriptResult?.scripts[0]?.name || "";
    setActiveScript((cur) =>
      scriptResult?.scripts.some((s) => s.name === cur) ? cur : first
    );
  }, [scriptResult]);

  if (!open) return null;

  const templateLabel = picked?.name || templateName || "없음";
  const excelReady = Boolean(picked || templateName);
  const hasSelection = selectedCount > 0;
  const canRun =
    !busy &&
    tableCount > 0 &&
    (scope === "all" || hasSelection) &&
    (kind === "script" || excelReady);
  const scripts = scriptResult?.scripts || [];
  const current = scripts.find((s) => s.name === activeScript) || scripts[0];
  const schema = scriptResult?.schema || "db1";
  const showPreview = kind === "script" && scripts.length > 0;

  function saveCurrent() {
    if (!current) return;
    downloadBlob(
      new Blob([current.content], { type: "text/sql;charset=utf-8" }),
      current.name
    );
  }

  function saveAll() {
    if (!scripts.length) return;
    downloadBlob(zipStore(scripts), `er_modeler_${schema}_ddl.zip`);
  }

  return (
    <div className="er-modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div
        className={`er-modal er-import-modal${showPreview ? " er-export-wide" : ""}`}
        role="dialog"
        aria-labelledby="er-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="er-modal-head">
          <div>
            <h2 id="er-export-title">내보내기</h2>
            <p className="hint">
              {kind === "script"
                ? "범위를 고른 뒤 생성하고, 확인 후 저장합니다."
                : "형식과 범위를 고른 뒤 내보냅니다."}
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
            <span>{progress || "처리 중…"}</span>
          </div>
        ) : null}

        <div className="er-choice-group">
          <span>형식</span>
          <label>
            <input
              type="radio"
              name="er-export-kind"
              checked={kind === "excel"}
              onChange={() => {
                setKind("excel");
                onClearScript();
              }}
            />
            Excel
          </label>
          <label>
            <input
              type="radio"
              name="er-export-kind"
              checked={kind === "script"}
              onChange={() => setKind("script")}
            />
            스크립트
          </label>
        </div>

        <div className="er-choice-group">
          <span>범위</span>
          <label>
            <input
              type="radio"
              name="er-export-scope"
              checked={scope === "all"}
              onChange={() => {
                setScope("all");
                onClearScript();
              }}
            />
            전체 테이블 ({tableCount})
          </label>
          <label>
            <input
              type="radio"
              name="er-export-scope"
              checked={scope === "selected"}
              onChange={() => {
                setScope("selected");
                onClearScript();
              }}
              disabled={!hasSelection}
            />
            선택한 테이블만 ({selectedCount})
          </label>
        </div>
        {scope === "selected" && !hasSelection ? (
          <p className="hint">Shift+클릭으로 테이블을 여러 개 고르세요.</p>
        ) : null}

        {kind === "excel" ? (
          <div className="er-import-excel">
            <p className="hint">
              테이블정의서 양식(.xlsx)을 지정한 뒤 내보냅니다.
            </p>
            <p className="hint">현재 양식: {templateLabel}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPicked(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              양식 파일 선택
            </button>
          </div>
        ) : showPreview ? (
          <div className="er-script-preview-wrap">
            <p className="hint">생성된 DDL입니다. 확인한 뒤 저장하세요.</p>
            <div className="er-script-tabs">
              {scripts.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`er-modal-tab${s.name === current?.name ? " active" : ""}`}
                  onClick={() => setActiveScript(s.name)}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <pre className="er-script-preview">{current?.content || ""}</pre>
          </div>
        ) : (
          <p className="hint">
            생성하면 CREATE TABLE 등 DDL이 화면에 표시됩니다. 확인 후 저장할 수
            있습니다.
          </p>
        )}

        <div className="er-modal-foot">
          <span className="hint">
            {scope === "selected"
              ? `${selectedCount}개 테이블`
              : `${tableCount}개 테이블`}
          </span>
          {kind === "excel" ? (
            <button
              type="button"
              className="btn"
              disabled={!canRun}
              onClick={() => onExportExcel(scope, picked || undefined)}
            >
              내보내기
            </button>
          ) : showPreview ? (
            <div className="er-export-save-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={!current}
                onClick={saveCurrent}
              >
                현재 스크립트 저장
              </button>
              <button type="button" className="btn" onClick={saveAll}>
                저장
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={!canRun}
              onClick={() => onGenerateScript(scope)}
            >
              생성
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
