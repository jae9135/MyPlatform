"use client";

import { useEffect, useRef, useState } from "react";

import { CardinalityPicker, splitCardinalityDisplay } from "./CardinalityPicker";
import { formatColumnType, normalizeColumn, normalizeCardinality, parseDataType, type ErColumn, type ErRelation, type RelationCardinality } from "./types";

export type PopoverAnchor = { x: number; y: number };

function PopoverShell({
  title,
  titleId,
  anchor,
  onClose,
  error,
  className,
  children,
}: {
  title: string;
  titleId: string;
  anchor: PopoverAnchor | null;
  onClose: () => void;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverAnchor | null>(anchor);

  useEffect(() => {
    setPos(anchor);
  }, [anchor]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = pos?.x ?? 24;
  const top = pos?.y ?? 96;

  function startDrag(event: React.PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const originX = left;
    const originY = top;
    const onMove = (ev: PointerEvent) => {
      setPos({
        x: Math.max(8, originX + (ev.clientX - event.clientX)),
        y: Math.max(8, originY + (ev.clientY - event.clientY)),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={boxRef}
      className={`er-edit-popover${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-labelledby={titleId}
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h2 id={titleId} className="er-edit-popover-title" onPointerDown={startDrag}>
        {title}
      </h2>
      {children}
      {error ? <p className="er-save-error">{error}</p> : null}
    </div>
  );
}

export function TableEditDialog({
  open,
  tableId,
  tableName,
  anchor,
  onClose,
  onSave,
}: {
  open: boolean;
  tableId: string;
  tableName: string;
  anchor: PopoverAnchor | null;
  onClose: () => void;
  onSave: (tableId: string, tableName: string) => string | null;
}) {
  const [idValue, setIdValue] = useState(tableId);
  const [nameValue, setNameValue] = useState(tableName);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIdValue(tableId);
      setNameValue(tableName);
      setSaveError(null);
    }
  }, [open, tableId, tableName]);

  if (!open) return null;

  return (
    <PopoverShell
      title="테이블수정"
      titleId="er-table-edit-title"
      anchor={anchor}
      onClose={onClose}
      error={saveError}
    >
      <div className="er-meta-fields">
        <label>
          테이블ID
          <input
            autoFocus
            value={idValue}
            onChange={(e) => setIdValue(e.target.value)}
          />
        </label>
        <label>
          테이블명
          <input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
          />
        </label>
      </div>
      <div className="er-modal-foot">
        <button type="button" className="btn ghost er-btn-sm" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn er-btn-sm"
          onClick={() => {
            const nextId = idValue.trim();
            if (!nextId) {
              setSaveError("테이블ID를 입력하세요.");
              return;
            }
            const reason = onSave(nextId, nameValue.trim());
            if (reason) setSaveError(reason);
          }}
        >
          저장
        </button>
      </div>
    </PopoverShell>
  );
}

export function ColumnEditDialog({
  open,
  column,
  suggestedFkRef,
  anchor,
  onClose,
  onSave,
}: {
  open: boolean;
  column: ErColumn | null;
  suggestedFkRef?: string | null;
  anchor: PopoverAnchor | null;
  onClose: () => void;
  onSave: (column: ErColumn) => string | null;
}) {
  const [draft, setDraft] = useState<ErColumn | null>(column);
  const [typeText, setTypeText] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open && column) {
      const fkRef =
        column.isFk && !String(column.fkRef || "").trim()
          ? suggestedFkRef || null
          : column.fkRef;
      setDraft({ ...column, fkRef, notNull: column.isPk ? true : column.notNull });
      setTypeText(formatColumnType(column.dataType, column.length));
      setSaveError(null);
    }
  }, [open, column, suggestedFkRef]);

  if (!open || !draft) return null;

  function patch(part: Partial<ErColumn>) {
    setDraft((cur) => (cur ? { ...cur, ...part } : cur));
  }

  return (
    <PopoverShell
      title="속성명수정"
      titleId="er-col-edit-title"
      anchor={anchor}
      onClose={onClose}
      error={saveError}
    >
      <div className="er-meta-fields">
        <div className="er-check-row">
          <span>Key</span>
          <label className="er-check">
            <input
              type="checkbox"
              checked={draft.isPk}
              onChange={(e) => {
                const isPk = e.target.checked;
                patch({ isPk, notNull: isPk ? true : draft.notNull });
              }}
            />
            PK
          </label>
          <label className="er-check">
            <input
              type="checkbox"
              checked={draft.isFk}
              onChange={(e) =>
                patch({
                  isFk: e.target.checked,
                  fkRef: e.target.checked
                    ? draft.fkRef || suggestedFkRef || null
                    : null,
                })
              }
            />
            FK
          </label>
        </div>
        <label>
          컬럼ID
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label>
          컬럼명
          <input
            value={draft.koreanName}
            onChange={(e) => patch({ koreanName: e.target.value })}
          />
        </label>
        <label>
          Type
          <input
            value={typeText}
            onChange={(e) => {
              const raw = e.target.value.toUpperCase();
              setTypeText(raw);
              const parsed = parseDataType(raw);
              patch({ dataType: parsed.dataType, length: parsed.length });
            }}
          />
        </label>
        <div className="er-check-row">
          <span>Null</span>
          <label className="er-check">
            <input
              type="checkbox"
              checked={draft.notNull}
              disabled={draft.isPk}
              onChange={() => patch({ notNull: true })}
            />
            No
          </label>
          <label className="er-check">
            <input
              type="checkbox"
              checked={!draft.notNull}
              disabled={draft.isPk}
              onChange={() => {
                if (draft.isPk) return;
                patch({ notNull: false });
              }}
            />
            Yes
          </label>
        </div>
        <label>
          디폴트값
          <input
            value={draft.defaultValue || ""}
            onChange={(e) => patch({ defaultValue: e.target.value || null })}
          />
        </label>
        <label>
          비고
          <input
            value={draft.comment || ""}
            onChange={(e) => patch({ comment: e.target.value || null })}
          />
        </label>
        {draft.isFk ? (
          <label>
            FK 참조
            <input
              value={draft.fkRef || ""}
              placeholder="테이블명(컬럼ID)"
              onChange={(e) => patch({ fkRef: e.target.value || null })}
            />
          </label>
        ) : null}
      </div>
      <div className="er-modal-foot">
        <button type="button" className="btn ghost er-btn-sm" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn er-btn-sm"
          onClick={() => {
            const name = draft.name.trim();
            if (!name) {
              setSaveError("컬럼ID를 입력하세요.");
              return;
            }
            const reason = onSave(
              normalizeColumn({
                ...draft,
                name,
                dataType: typeText || draft.dataType,
                notNull: draft.isPk ? true : draft.notNull,
              })
            );
            if (reason) setSaveError(reason);
          }}
        >
          저장
        </button>
      </div>
    </PopoverShell>
  );
}

export type RelationSaveResult =
  | { kind: "block"; message: string }
  | { kind: "saved"; notice?: string };

export function RelationEditDialog({
  open,
  relation,
  anchor,
  initialNotice,
  onClose,
  onSave,
}: {
  open: boolean;
  relation: ErRelation | null;
  anchor: PopoverAnchor | null;
  initialNotice?: string | null;
  onClose: () => void;
  onSave: (rel: ErRelation) => RelationSaveResult;
}) {
  const [cardinality, setCardinality] = useState<RelationCardinality>(
    relation?.cardinality ? normalizeCardinality(relation.cardinality) : "1:1..N"
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open && relation) {
      setCardinality(normalizeCardinality(relation.cardinality));
      setSaveError(initialNotice || null);
    }
  }, [open, relation, initialNotice]);

  if (!open || !relation) return null;

  const [fromCard, toCard] = splitCardinalityDisplay(cardinality);

  return (
    <PopoverShell
      title={`관계 · ${cardinality}`}
      titleId="er-rel-edit-title"
      anchor={anchor}
      onClose={onClose}
      error={saveError}
      className="er-rel-edit-popover"
    >
      <p className="hint">
        {fromCard} {relation.fromTable} → {toCard} {relation.toTable}
      </p>
      <CardinalityPicker
        label="관계 유형"
        value={cardinality}
        onChange={setCardinality}
      />
      <div className="er-modal-foot">
        <button type="button" className="btn ghost er-btn-sm" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn er-btn-sm"
          onClick={() => {
            const result = onSave({ ...relation, cardinality });
            if (result.kind === "block") {
              setSaveError(result.message);
              return;
            }
            if (result.notice) {
              setSaveError(result.notice);
              return;
            }
            onClose();
          }}
        >
          저장
        </button>
      </div>
    </PopoverShell>
  );
}
