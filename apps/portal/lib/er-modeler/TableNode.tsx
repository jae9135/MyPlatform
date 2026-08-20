"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import {
  EDGE_COLUMN,
  columnHandleId,
  formatColumnLabel,
  formatColumnType,
  formatTableTitle,
  type ErColumn,
  type NameDisplayMode,
} from "./types";
import { ROW_HEIGHT, tableNodeWidth } from "./layout";

export type ErTableNodeData = {
  tableId: string;
  name: string;
  koreanName: string;
  columns: ErColumn[];
  nameDisplay?: NameDisplayMode;
  selected?: boolean;
  appSelected?: boolean;
  selectedColumnName?: string | null;
  connectMode?: boolean;
  connectSource?: boolean;
  onSelect?: (
    tableId: string,
    additive?: boolean,
    columnName?: string,
    point?: { x: number; y: number }
  ) => void;
  onSelectColumn?: (tableId: string, columnName: string) => void;
  onRevealActions?: (tableId: string, columnName: string | null) => void;
  showActions?: boolean;
  onEditTable?: (tableId: string) => void;
  onEditColumn?: (tableId: string, columnName: string) => void;
  onDeleteColumn?: (tableId: string, columnName: string) => void;
  onMoveColumn?: (tableId: string, columnName: string, dir: -1 | 1) => void;
  onAddColumn?: (tableId: string) => void;
};

function IconInfo() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
      <path
        d="M3.5 4.5h9M6 4.5V3.2h4v1.3M5.2 4.5l.6 8.2h4.4l.6-8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUp() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
      <path d="M8 12V4M4.5 7.5 8 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDown() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
      <path d="M8 4v8M4.5 8.5 8 12l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TableNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as ErTableNodeData;
  const mode = d.nameDisplay || "both";
  const title = formatTableTitle(d.name, d.koreanName, mode);
  const handleTable = d.name;
  const topId = columnHandleId(handleTable, EDGE_COLUMN, "T");
  const bottomId = columnHandleId(handleTable, EDGE_COLUMN, "B");
  const leftEdgeId = columnHandleId(handleTable, EDGE_COLUMN, "L");
  const rightEdgeId = columnHandleId(handleTable, EDGE_COLUMN, "R");
  const selectedCol = d.selectedColumnName || null;
  const tableSelected = Boolean(selected || d.appSelected);
  const showActions = Boolean(d.showActions);
  const tid = d.tableId || id;
  const tableWidth = tableNodeWidth(
    { name: d.name, koreanName: d.koreanName, columns: d.columns },
    mode
  );

  return (
    <div
      className={`er-table-node${tableSelected ? " selected" : ""}${d.connectSource ? " connect-source" : ""}`}
      style={{ width: tableWidth }}
      onClick={(e) => {
        if (d.connectMode) {
          e.stopPropagation();
          d.onSelect?.(tid, false, undefined, { x: e.clientX, y: e.clientY });
          return;
        }
        if (e.shiftKey) {
          d.onSelect?.(tid, true);
          return;
        }
        if (!tableSelected) d.onSelect?.(tid);
      }}
    >
      <Handle
        type="source"
        position={Position.Top}
        id={topId}
        className="er-handle er-handle-top"
      />
      <Handle
        type="target"
        position={Position.Top}
        id={topId}
        className="er-handle er-handle-top"
      />
      <Handle
        type="source"
        position={Position.Left}
        id={leftEdgeId}
        className="er-handle er-handle-left er-handle-edge"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={leftEdgeId}
        className="er-handle er-handle-left er-handle-edge"
      />
      <Handle
        type="source"
        position={Position.Right}
        id={rightEdgeId}
        className="er-handle er-handle-right er-handle-edge"
      />
      <Handle
        type="target"
        position={Position.Right}
        id={rightEdgeId}
        className="er-handle er-handle-right er-handle-edge"
      />
      <div
        className="er-table-node-header"
        onClick={(e) => {
          e.stopPropagation();
          if (d.connectMode) {
            d.onSelect?.(tid, false, undefined, { x: e.clientX, y: e.clientY });
            return;
          }
          if (e.shiftKey) {
            d.onSelect?.(tid, true);
            return;
          }
          if (tableSelected) d.onRevealActions?.(tid, null);
          else d.onSelect?.(tid);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          d.onEditTable?.(tid);
        }}
      >
        {title}
        {showActions && !selectedCol ? (
          <div
            className="er-row-actions er-header-actions nodrag nopan"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="er-row-action"
              title="테이블 수정"
              onClick={() => d.onEditTable?.(tid)}
            >
              <IconInfo />
            </button>
          </div>
        ) : null}
      </div>
      <div className={`er-table-node-body${mode === "both" ? " er-cols-both" : ""}`}>
        {d.columns.map((col, idx) => {
          const badges: string[] = [];
          if (col.isPk) badges.push("PK");
          if (col.isFk) badges.push("FK");
          const label = formatColumnLabel(col.name, col.koreanName, mode);
          const typeLabel = formatColumnType(col.dataType, col.length);
          const nameText =
            mode === "ko" ? col.koreanName || col.name : col.name;
          const active = selectedCol === col.name;
          return (
            <div
              key={col.name}
              data-er-table={handleTable}
              data-er-col={col.name}
              className={`er-table-node-row${col.isPk ? " pk" : ""}${col.isFk ? " fk" : ""}${active ? " active" : ""}`}
              style={{ height: ROW_HEIGHT }}
              onClick={(e) => {
                e.stopPropagation();
                if (d.connectMode) {
                  d.onSelect?.(tid, false, col.name, { x: e.clientX, y: e.clientY });
                  return;
                }
                if (e.shiftKey) {
                  d.onSelect?.(tid, true);
                  return;
                }
                if (!tableSelected) {
                  d.onSelect?.(tid);
                  return;
                }
                d.onRevealActions?.(tid, col.name);
                d.onSelectColumn?.(tid, col.name);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                d.onEditColumn?.(tid, col.name);
              }}
            >
              <span className="er-col-key">{badges.join(" ") || "\u00a0"}</span>
              <span className="er-col-name" title={label}>
                {nameText}
              </span>
              {mode === "both" ? (
                <span className="er-col-ko" title={col.koreanName}>
                  {col.koreanName || "\u00a0"}
                </span>
              ) : null}
              <span className="er-col-type" title={typeLabel}>
                {typeLabel || "\u00a0"}
              </span>
              {showActions && active ? (
                <div
                  className="er-row-actions nodrag nopan"
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="er-row-action"
                    title="속성 수정"
                    onClick={() => d.onEditColumn?.(d.tableId || id, col.name)}
                  >
                    <IconInfo />
                  </button>
                  <button
                    type="button"
                    className="er-row-action"
                    title="컬럼 삭제"
                    onClick={() => d.onDeleteColumn?.(d.tableId || id, col.name)}
                  >
                    <IconTrash />
                  </button>
                  <button
                    type="button"
                    className="er-row-action"
                    title="위로"
                    disabled={idx === 0}
                    onClick={() => d.onMoveColumn?.(d.tableId || id, col.name, -1)}
                  >
                    <IconUp />
                  </button>
                  <button
                    type="button"
                    className="er-row-action"
                    title="아래로"
                    disabled={idx === d.columns.length - 1}
                    onClick={() => d.onMoveColumn?.(d.tableId || id, col.name, 1)}
                  >
                    <IconDown />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {tableSelected ? (
          <button
            type="button"
            className="er-table-add-col nodrag nopan"
            style={{ height: ROW_HEIGHT }}
            onClick={(e) => {
              e.stopPropagation();
              d.onAddColumn?.(d.tableId || id);
            }}
          >
            + 컬럼
          </button>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id={bottomId}
        className="er-handle er-handle-bottom"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id={bottomId}
        className="er-handle er-handle-bottom"
      />
    </div>
  );
}

export const ErTableNode = memo(TableNodeComponent);
