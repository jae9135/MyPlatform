"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  Controls,
  ConnectionMode,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useConnection,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type FinalConnectionState,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { API_BASE } from "@/lib/apiBase";

import {
  addRelation,
  applyNodePositions,
  computeEdgeOffsetForSide,
  connectionToRelation,
  createTable,
  eventClientPoint,
  findErColumnAtPoint,
  importResponseToProject,
  mergeImportedProject,
  optimizeRelationSides,
  projectToFlow,
  removeRelation,
  tableSideFromClientPoint,
  sliceProject,
  tableNodeScreenAnchor,
  uniqueUntitledName,
} from "./flow";
import { layoutGraph, HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from "./layout";
import { ExportDialog, type ExportScope, type ScriptExportResult } from "./ExportDialog";
import { ImportDialog, type ImportMode, type ImportProgress } from "./ImportDialog";
import { CardinalityPicker } from "./CardinalityPicker";
import { ValidationDialog } from "./ValidationDialog";
import {
  ColumnEditDialog,
  RelationEditDialog,
  type RelationSaveResult,
  TableEditDialog,
  type PopoverAnchor,
} from "./EditDialogs";
import {
  addProject,
  base64ToBlob,
  fileToBase64,
  getActive,
  loadLibrary,
  removeActive,
  switchActive,
  upsertActive,
  type LibraryState,
} from "./storage";
import { ErTableNode } from "./TableNode";
import { ErRelationEdge } from "./RelationEdge";
import {
  columnHandleId,
  createEmptyProject,
  EDGE_COLUMN,
  applyMatchingFkRefs,
  matchingFkRefForColumn,
  syncColumnsToRelations,
  syncRelationsMetadata,
  normalizeColumn,
  normalizeRelation,
  rewriteFkRefsForRenamedTable,
  type EdgePathLayout,
  type ErColumn,
  type ErProject,
  type ErRelation,
  type ErTable,
  type HandleSide,
  type ImportResponse,
  type NameDisplayMode,
  type RelationCardinality,
} from "./types";
import { errorsForColumnSave, errorsTouching, formatErrorReasons, formatValidationReasons, validateErProject, validationForRelation, type ErValidationItem } from "./validation";

const nodeTypes = { erTable: ErTableNode };
const edgeTypes = { erRelation: ErRelationEdge };

type CanvasTool = "select" | "table" | "connect";

const NAME_DISPLAY_CYCLE: NameDisplayMode[] = ["both", "ko", "en"];
const NAME_DISPLAY_LABEL: Record<NameDisplayMode, string> = {
  both: "한+영",
  ko: "한글",
  en: "영문",
};

const POPOVER_WIDTH = 240;

function estimateImportMs(file: File): number {
  const mb = file.size / (1024 * 1024);
  return Math.min(90000, Math.max(2500, 2500 + mb * 1200));
}

function estimateSqlImportMs(sql: string): number {
  const kb = new TextEncoder().encode(sql).length / 1024;
  return Math.min(60000, Math.max(2000, 2000 + kb * 40));
}

function cloneProject(project: ErProject): ErProject {
  return JSON.parse(JSON.stringify(project)) as ErProject;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function useEditAnchor(
  tableId: string | null,
  columnName: string | null,
  tables: ErTable[]
): PopoverAnchor | null {
  const { flowToScreenPosition, getNode } = useReactFlow();
  useViewport();
  if (!tableId) return null;
  const node = getNode(tableId);
  const table = tables.find((t) => t.id === tableId);
  if (!node || !table) return null;
  const rowIndex =
    columnName == null
      ? -1
      : table.columns.findIndex((c) => c.name === columnName);
  const yOff = rowIndex < 0 ? 0 : HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
  const width = node.measured?.width ?? NODE_WIDTH;
  const right = flowToScreenPosition({
    x: node.position.x + width,
    y: node.position.y + yOff,
  });
  const left = flowToScreenPosition({
    x: node.position.x,
    y: node.position.y + yOff,
  });
  const popH = columnName ? 460 : 230;
  let x = right.x + 8;
  let y = right.y;
  if (x + POPOVER_WIDTH > window.innerWidth - 8) {
    x = left.x - POPOVER_WIDTH - 8;
  }
  if (x < 8) x = 8;
  if (y + popH > window.innerHeight - 8) {
    y = Math.max(8, window.innerHeight - popH - 8);
  }
  if (y < 8) y = 8;
  return { x, y };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ErModelerInner() {
  const [library, setLibrary] = useState<LibraryState>(() => loadLibrary());
  const [project, setProject] = useState<ErProject>(
    () => getActive(loadLibrary()).project
  );
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [selectedColumnName, setSelectedColumnName] = useState<string | null>(
    null
  );
  const [showActions, setShowActions] = useState(false);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(
    null
  );
  const [nameDisplay, setNameDisplay] = useState<NameDisplayMode>("both");
  const [showRelLabels, setShowRelLabels] = useState(true);
  const [nodesInteractive, setNodesInteractive] = useState(true);
  const [leftW, setLeftW] = useState(168);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null
  );
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationItems, setValidationItems] = useState<ErValidationItem[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [scriptExport, setScriptExport] = useState<ScriptExportResult | null>(
    null
  );
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [connectCardinality, setConnectCardinality] =
    useState<RelationCardinality>("1:1..N");
  const [tableEditId, setTableEditId] = useState<string | null>(null);
  const [columnEdit, setColumnEdit] = useState<{
    tableId: string;
    columnName: string;
  } | null>(null);
  const [relationAnchor, setRelationAnchor] = useState<PopoverAnchor | null>(
    null
  );
  const [relationEditNotice, setRelationEditNotice] = useState<string | null>(
    null
  );

  const { screenToFlowPosition } = useReactFlow();
  const tableEditAnchor = useEditAnchor(tableEditId, null, project.tables);
  const columnEditAnchor = useEditAnchor(
    columnEdit?.tableId ?? null,
    columnEdit?.columnName ?? null,
    project.tables
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const selectedRelationIdRef = useRef(selectedRelationId);
  selectedRelationIdRef.current = selectedRelationId;
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const connectStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [connectDraft, setConnectDraft] = useState<{
    tableId: string;
    columnName: string | null;
    from: { x: number; y: number };
    fromSide?: HandleSide;
  } | null>(null);
  const [connectCursor, setConnectCursor] = useState<{ x: number; y: number } | null>(
    null
  );
  const pathLayoutRef = useRef<
    (relationId: string, layout: EdgePathLayout) => void
  >(() => {});
  const undoStackRef = useRef<ErProject[]>([]);
  const nodeActionsRef = useRef({
    onSelect: (_tableId: string, _additive?: boolean, _columnName?: string, _point?: { x: number; y: number }) => {},
    onSelectColumn: (_tableId: string, _columnName: string) => {},
    onRevealActions: (_tableId: string, _columnName: string | null) => {},
    onEditTable: (_tableId: string) => {},
    onEditColumn: (_tableId: string, _columnName: string) => {},
    onDeleteColumn: (_tableId: string, _columnName: string) => {},
    onMoveColumn: (_tableId: string, _columnName: string, _dir: -1 | 1) => {},
    onAddColumn: (_tableId: string) => {},
  });

  const initialFlow = useMemo(
    () => projectToFlow(project, nameDisplay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const connecting = useConnection((c) => c.inProgress);

  const enrichEdges = useCallback(
    (edges: ReturnType<typeof projectToFlow>["edges"]) =>
      edges.map((edge) => ({
        ...edge,
        className: "nopan nodrag",
        data: {
          ...edge.data,
          showLabel: showRelLabels,
          onPathChange: (relationId: string, layout: EdgePathLayout) => {
            pathLayoutRef.current(relationId, layout);
          },
          onSelect: (relationId: string) => {
            setSelectedRelationId(relationId);
            setSelectedTableId(null);
            setSelectedTableIds([]);
            setSelectedColumnName(null);
            setShowActions(false);
            setTableEditId(null);
            setColumnEdit(null);
            setRelationAnchor(null);
          },
          onOpenEdit: (relationId: string, anchor: PopoverAnchor) => {
            setSelectedRelationId(relationId);
            setSelectedTableId(null);
            setSelectedTableIds([]);
            setSelectedColumnName(null);
            setShowActions(false);
            setTableEditId(null);
            setColumnEdit(null);
            setRelationEditNotice(null);
            setRelationAnchor(anchor);
          },
        },
      })),
    [showRelLabels]
  );

  const refreshFlow = useCallback(
    (
      next: ErProject,
      doLayout = false,
      display: NameDisplayMode = nameDisplay,
      labels = showRelLabels
    ) => {
      let { nodes: n, edges: e } = projectToFlow(next, display);
      if (doLayout && n.length) {
        n = layoutGraph(n, e);
        next = applyNodePositions(next, n);
        next = optimizeRelationSides(next);
        ({ nodes: n, edges: e } = projectToFlow(next, display));
      }
      n = n.map((node) => ({
        ...node,
        selected: selectedTableIds.includes(node.id),
        data: {
          ...node.data,
          nameDisplay: display,
          appSelected: selectedTableIds.includes(node.id),
          selectedColumnName:
            node.id === selectedTableId ? selectedColumnName : null,
          showActions: node.id === selectedTableId && showActions,
          connectMode: canvasTool === "connect",
          connectSource: connectDraft?.tableId === node.id,
          onSelect: (
            tableId: string,
            additive?: boolean,
            columnName?: string,
            point?: { x: number; y: number }
          ) => nodeActionsRef.current.onSelect(tableId, additive, columnName, point),
          onSelectColumn: (tableId: string, columnName: string) =>
            nodeActionsRef.current.onSelectColumn(tableId, columnName),
          onRevealActions: (tableId: string, columnName: string | null) =>
            nodeActionsRef.current.onRevealActions(tableId, columnName),
          onEditTable: (tableId: string) =>
            nodeActionsRef.current.onEditTable(tableId),
          onEditColumn: (tableId: string, columnName: string) =>
            nodeActionsRef.current.onEditColumn(tableId, columnName),
          onDeleteColumn: (tableId: string, columnName: string) =>
            nodeActionsRef.current.onDeleteColumn(tableId, columnName),
          onMoveColumn: (tableId: string, columnName: string, dir: -1 | 1) =>
            nodeActionsRef.current.onMoveColumn(tableId, columnName, dir),
          onAddColumn: (tableId: string) =>
            nodeActionsRef.current.onAddColumn(tableId),
        },
      }));
      e = enrichEdges(e).map((edge) => ({
        ...edge,
        selected: edge.id === selectedRelationIdRef.current,
      }));
      setNodes(n);
      setEdges(e);
      return next;
    },
    [canvasTool, connectDraft, enrichEdges, nameDisplay, selectedColumnName, selectedTableId, selectedTableIds, setEdges, setNodes, showActions, showRelLabels]
  );

  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        selected: edge.id === selectedRelationId,
      }))
    );
  }, [selectedRelationId, setEdges]);

  useEffect(() => {
    refreshFlow(projectRef.current, false, nameDisplay, showRelLabels);
  }, [nameDisplay, refreshFlow, showRelLabels]);

  const scheduleSave = useCallback(
    (next: ErProject) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const state = upsertActive(library, next);
        setLibrary(state);
      }, 500);
    },
    [library]
  );

  pathLayoutRef.current = (relationId: string, layout: EdgePathLayout) => {
    const cur = projectRef.current;
    const next = {
      ...cur,
      relations: cur.relations.map((r) =>
        r.id === relationId ? { ...r, ...layout } : r
      ),
    };
    projectRef.current = next;
    setProject(next);
    scheduleSave(next);
  };

  const commitProject = useCallback(
    (next: ErProject, options?: { layout?: boolean; skipFlow?: boolean }) => {
      const synced = syncColumnsToRelations(next);
      setProject(synced);
      if (!options?.skipFlow) {
        const positioned = refreshFlow(synced, options?.layout ?? false);
        scheduleSave(positioned);
      } else {
        scheduleSave(synced);
      }
    },
    [refreshFlow, scheduleSave]
  );

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(cloneProject(projectRef.current));
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
  }, []);

  const commitWithUndo = useCallback(
    (next: ErProject, options?: { layout?: boolean; skipFlow?: boolean }) => {
      pushUndo();
      commitProject(next, options);
    },
    [commitProject, pushUndo]
  );

  const undoLast = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) {
      setMsg("되돌릴 작업이 없습니다.");
      return;
    }
    commitProject(prev);
    setSelectedRelationId(null);
    setRelationAnchor(null);
    setTableEditId(null);
    setColumnEdit(null);
    setMsg("삭제를 취소했습니다.");
  }, [commitProject]);

  const onNodesChangeWrapped: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      const posChanges = changes.filter((c) => c.type === "position");
      if (!posChanges.length) return;

      setNodes((current) => {
        const nextNodes = posChanges.reduce(
          (acc, ch) => {
            if (ch.type !== "position" || !ch.position) return acc;
            return acc.map((n) =>
              n.id === ch.id ? { ...n, position: ch.position! } : n
            );
          },
          current
        );

        let nextProject = applyNodePositions(projectRef.current, nextNodes);
        nextProject = optimizeRelationSides(nextProject);
        projectRef.current = nextProject;

        const { edges: routedEdges } = projectToFlow(nextProject, nameDisplay);
        const sel = selectedRelationIdRef.current;
        setEdges(
          enrichEdges(routedEdges).map((edge) => ({
            ...edge,
            selected: edge.id === sel,
          }))
        );

        const finished = posChanges.some((c) => c.type === "position" && !c.dragging);
        if (finished) {
          setProject(nextProject);
          scheduleSave(nextProject);
        }

        return nextNodes;
      });
    },
    [enrichEdges, nameDisplay, onNodesChange, scheduleSave, setEdges, setNodes]
  );

  const onEdgesChangeWrapped: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      const removed = changes.filter((c) => c.type === "remove");
      if (!removed.length) return;
      let next = projectRef.current;
      const beforeCount = next.relations.length;
      for (const ch of removed) {
        if ("id" in ch && ch.id) {
          next = removeRelation(next, ch.id);
        }
      }
      if (next.relations.length === beforeCount) return;
      commitWithUndo(next, { skipFlow: false });
    },
    [commitWithUndo, onEdgesChange]
  );

  const applyConnection = useCallback(
    (
      conn: Connection,
      startPt?: { x: number; y: number } | null,
      endPt?: { x: number; y: number } | null
    ) => {
      const base = connectionToRelation(conn, connectCardinality);
      if (!base) return false;
      const fromTable = project.tables.find(
        (t) => t.id === conn.source || t.name === conn.source
      );
      const toTable = project.tables.find(
        (t) => t.id === conn.target || t.name === conn.target
      );
      if (!fromTable || !toTable) return false;

      const fromSide =
        base.fromSide ||
        (startPt
          ? tableSideFromClientPoint(fromTable.id, startPt.x, startPt.y)
          : "R");
      const toSide =
        base.toSide ||
        (endPt ? tableSideFromClientPoint(toTable.id, endPt.x, endPt.y) : "L");

      const startFlow = startPt ? screenToFlowPosition(startPt) : null;
      const endFlow = endPt ? screenToFlowPosition(endPt) : null;
      const fromOff = startFlow
        ? computeEdgeOffsetForSide(fromTable, fromSide, startFlow.x, startFlow.y)
        : { yOffset: 0, xOffset: 0 };
      const toOff = endFlow
        ? computeEdgeOffsetForSide(toTable, toSide, endFlow.x, endFlow.y)
        : { yOffset: 0, xOffset: 0 };

      let rel = normalizeRelation({
        ...base,
        fromTable: fromTable.name,
        toTable: toTable.name,
        fromColumn: EDGE_COLUMN,
        toColumn: EDGE_COLUMN,
        fromSide,
        toSide,
        fromYOffset: fromOff.yOffset,
        toYOffset: toOff.yOffset,
        fromXOffset: fromOff.xOffset,
        toXOffset: toOff.xOffset,
        id: `${fromTable.name}:${EDGE_COLUMN}->${toTable.name}:${EDGE_COLUMN}`,
        cardinality: connectCardinality,
      });

      let next = applyMatchingFkRefs(addRelation(project, rel), rel.fromTable, rel.toTable);
      next = syncRelationsMetadata(next);
      rel = next.relations.find(
        (r) => r.fromTable === fromTable.name && r.toTable === toTable.name
      ) || rel;

      commitProject(next, { layout: false });
      setSelectedRelationId(rel.id);
      setSelectedTableId(null);
      setSelectedTableIds([]);
      setSelectedColumnName(null);
      setShowActions(false);
      setConnectDraft(null);
      setConnectCursor(null);
      setCanvasTool("select");
      const items = validationForRelation(next, rel);
      setRelationEditNotice(items.length ? formatValidationReasons(items) : null);
      if (endPt) {
        setRelationAnchor({ x: endPt.x + 10, y: endPt.y + 8 });
      }
      setMsg(
        `관계 추가 [${rel.cardinality}] ${rel.fromTable} → ${rel.toTable}`
      );
      return true;
    },
    [commitProject, connectCardinality, project, screenToFlowPosition]
  );

  const onConnectStart = useCallback((event: MouseEvent | TouchEvent) => {
    connectStartRef.current = eventClientPoint(event);
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const fromHandle = "fromHandle" in state ? state.fromHandle : null;
      const fromNode = "fromNode" in state ? state.fromNode : null;
      if (!fromHandle?.id || !fromNode) return;
      const endPt = eventClientPoint(event);
      if (!endPt) return;
      const toNode = "toNode" in state ? state.toNode : null;
      const hit = findErColumnAtPoint(endPt.x, endPt.y);
      const targetId = toNode?.id || hit?.nodeId;
      if (!targetId || targetId === fromNode.id) return;
      const toTable = project.tables.find((t) => t.id === targetId);
      const toSide = tableSideFromClientPoint(targetId, endPt.x, endPt.y);
      const targetHandle = columnHandleId(
        toTable?.name || targetId,
        EDGE_COLUMN,
        toSide
      );
      const fromTable = project.tables.find((t) => t.id === fromNode.id);
      const fromSide = connectStartRef.current
        ? tableSideFromClientPoint(
            fromNode.id,
            connectStartRef.current.x,
            connectStartRef.current.y
          )
        : "R";
      applyConnection(
        {
          source: fromNode.id,
          target: targetId,
          sourceHandle: columnHandleId(
            fromTable?.name || fromNode.id,
            EDGE_COLUMN,
            fromSide
          ),
          targetHandle,
        },
        connectStartRef.current,
        endPt
      );
    },
    [applyConnection, project]
  );

  const exitConnectTool = useCallback(() => {
    setConnectDraft(null);
    setConnectCursor(null);
    setCanvasTool("select");
  }, []);

  const pickConnectTable = useCallback(
    (tableId: string, columnName?: string, point?: { x: number; y: number }) => {
      if (point) pointerRef.current = point;
      const pt = pointerRef.current;
      if (!connectDraft || connectDraft.tableId === tableId) {
        if (connectDraft?.tableId === tableId) return;
        const fromSide = tableSideFromClientPoint(tableId, pt.x, pt.y);
        const from = tableNodeScreenAnchor(tableId, pt.x, pt.y) || pt;
        setConnectDraft({
          tableId,
          columnName: null,
          from,
          fromSide,
        });
        setConnectCursor(pt);
        setSelectedTableIds([tableId]);
        setSelectedTableId(tableId);
        setSelectedColumnName(columnName || null);
        setShowActions(false);
        setSelectedRelationId(null);
        setMsg("다른 테이블을 클릭하면 연결이 끝납니다.");
        return;
      }

      const fromTable = project.tables.find(
        (t) => t.id === connectDraft.tableId || t.name === connectDraft.tableId
      );
      const toTable = project.tables.find((t) => t.id === tableId || t.name === tableId);
      if (!fromTable || !toTable) return;
      const fromSide =
        connectDraft.fromSide ||
        tableSideFromClientPoint(fromTable.id, connectDraft.from.x, connectDraft.from.y);
      const toSide = tableSideFromClientPoint(toTable.id, pt.x, pt.y);
      applyConnection(
        {
          source: fromTable.id,
          target: toTable.id,
          sourceHandle: columnHandleId(fromTable.name, EDGE_COLUMN, fromSide),
          targetHandle: columnHandleId(toTable.name, EDGE_COLUMN, toSide),
        },
        connectDraft.from,
        pt
      );
    },
    [applyConnection, connectDraft, project]
  );

  useEffect(() => {
    if (canvasTool !== "connect") {
      setConnectDraft(null);
      setConnectCursor(null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      setConnectCursor((cur) => (cur ? { x: e.clientX, y: e.clientY } : cur));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [canvasTool]);

  const isValidConnection = useCallback((conn: Connection | { source: string | null; target: string | null }) => {
    return Boolean(conn.source && conn.target && conn.source !== conn.target);
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: { id: string }) => {
    if (event.detail > 1) return;
    setSelectedRelationId(edge.id);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setSelectedColumnName(null);
    setShowActions(false);
    setTableEditId(null);
    setColumnEdit(null);
    setRelationAnchor(null);
    setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
  }, [setEdges]);

  const onEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: { id: string }) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedRelationId(edge.id);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setSelectedColumnName(null);
    setShowActions(false);
    setTableEditId(null);
    setColumnEdit(null);
    setRelationAnchor({ x: event.clientX + 10, y: event.clientY + 8 });
    setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
  }, [setEdges]);

  function commitImported(
    imported: ErProject,
    mode: ImportMode,
    summary: string
  ) {
    const current = projectRef.current;
    let next = imported;
    let extra = "";
    if (mode === "append" && current.tables.length) {
      const merged = mergeImportedProject(
        {
          ...current,
          templateBase64: imported.templateBase64 || current.templateBase64,
          sourceFilename: imported.sourceFilename || current.sourceFilename,
        },
        imported
      );
      next = merged.project;
      extra = ` · 추가 ${merged.added}개`;
      if (merged.skipped) extra += ` · 중복 ${merged.skipped}개 건너뜀`;
    } else {
      next = {
        ...imported,
        id: current.id,
        name: imported.name,
        systemName: imported.systemName || "",
        createdDate: imported.createdDate || current.createdDate || "",
        author: imported.author || current.author || "",
      };
    }
    const shouldLayout = !(mode === "append" && current.tables.length);
    next = refreshFlow(next, false);
    const state = upsertActive(library, next);
    setLibrary(state);
    setProject(next);
    scheduleSave(next);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setImportOpen(false);
    setMsg(summary + extra);
    if (shouldLayout) {
      requestAnimationFrame(() => {
        const laid = refreshFlow(projectRef.current, true);
        setProject(laid);
        scheduleSave(laid);
      });
    }
  }

  async function handleImport(file: File, mode: ImportMode = "replace") {
    setBusy(true);
    setImportProgress(null);
    setProgress("서버에 파일 전송 중…");
    setMsg("설계서 불러오는 중…");
    const started = Date.now();
    const estimateMs = estimateImportMs(file);
    let progressLabel = "파일 업로드 중";
    const progressTimer = window.setInterval(() => {
      const elapsedMs = Date.now() - started;
      const pct = Math.min(88, (elapsedMs / estimateMs) * 88);
      const elapsedSec = Math.round(elapsedMs / 1000);
      const remainingMs = estimateMs - elapsedMs;
      const etaSec =
        pct >= 88 || remainingMs <= 0
          ? 0
          : Math.max(1, Math.round(remainingMs / 1000));
      setImportProgress({ pct, elapsedSec, etaSec, label: progressLabel });
    }, 250);
    try {
      const fd = new FormData();
      fd.append("design", file);
      if (project.sheet) fd.append("sheet", project.sheet);
      progressLabel = "서버에서 정의서 분석 중";
      setProgress("서버에서 정의서 분석 중…");
      const res = await fetch(`${API_BASE}/v1/er-modeler/import`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as ImportResponse & {
        detail?: string;
      };
      if (!res.ok) throw new Error(j.detail || "import failed");

      progressLabel = "ERD에 테이블·관계 반영 중";
      setProgress("ERD에 테이블·관계 반영 중…");
      setImportProgress({
        pct: 92,
        elapsedSec: Math.round((Date.now() - started) / 1000),
        etaSec: 1,
        label: progressLabel,
      });
      const imported = importResponseToProject(
        {
          source_filename: j.source_filename,
          meta: j.meta,
          tables: j.tables,
          relations: j.relations,
        },
        undefined
      );
      commitImported(
        imported,
        mode,
        `가져오기 완료 — 테이블 ${j.meta.tables}개 · 관계 ${j.meta.relations}개`
      );
      setImportProgress({
        pct: 100,
        elapsedSec: Math.round((Date.now() - started) / 1000),
        etaSec: 0,
        label: "완료",
      });
      void fileToBase64(file).then((templateBase64) => {
        commitProject(
          {
            ...projectRef.current,
            templateBase64,
            sourceFilename: file.name,
          },
          { skipFlow: true }
        );
      });
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      window.clearInterval(progressTimer);
      setBusy(false);
      setProgress("");
      window.setTimeout(() => setImportProgress(null), 500);
    }
  }

  async function handleImportSql(
    sql: string,
    filename: string,
    mode: ImportMode = "replace"
  ) {
    setBusy(true);
    setImportProgress(null);
    setProgress("SQL 스크립트 분석 중…");
    setMsg("SQL 스크립트 분석 중…");
    const started = Date.now();
    const estimateMs = estimateSqlImportMs(sql);
    let progressLabel = "SQL 분석 중";
    const progressTimer = window.setInterval(() => {
      const elapsedMs = Date.now() - started;
      const pct = Math.min(88, (elapsedMs / estimateMs) * 88);
      const elapsedSec = Math.round(elapsedMs / 1000);
      const remainingMs = estimateMs - elapsedMs;
      const etaSec =
        pct >= 88 || remainingMs <= 0
          ? 0
          : Math.max(1, Math.round(remainingMs / 1000));
      setImportProgress({ pct, elapsedSec, etaSec, label: progressLabel });
    }, 250);
    try {
      progressLabel = "서버에서 SQL 분석 중";
      setProgress("서버에서 SQL 분석 중…");
      const res = await fetch(`${API_BASE}/v1/er-modeler/import-sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql,
          filename,
          db_name: project.dbName,
          schema: project.schema,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as ImportResponse & {
        detail?: string;
      };
      if (!res.ok) throw new Error(j.detail || "import-sql failed");

      progressLabel = "ERD에 테이블·관계 반영 중";
      setProgress("ERD에 테이블·관계 반영 중…");
      setImportProgress({
        pct: 92,
        elapsedSec: Math.round((Date.now() - started) / 1000),
        etaSec: 1,
        label: progressLabel,
      });
      const imported = importResponseToProject(
        {
          source_filename: j.source_filename,
          meta: j.meta,
          tables: j.tables,
          relations: j.relations,
        },
        project.templateBase64
      );
      commitImported(
        imported,
        mode,
        `스크립트 가져오기 완료 — 테이블 ${j.meta.tables}개 · 관계 ${j.meta.relations}개`
      );
      setImportProgress({
        pct: 100,
        elapsedSec: Math.round((Date.now() - started) / 1000),
        etaSec: 0,
        label: "완료",
      });
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      window.clearInterval(progressTimer);
      setBusy(false);
      setProgress("");
      window.setTimeout(() => setImportProgress(null), 500);
    }
  }

  function projectForExport(scope: ExportScope): ErProject | null {
    const cur = projectRef.current;
    if (scope === "selected") {
      if (!selectedTableIds.length) {
        setMsg(
          "내보낼 테이블을 먼저 선택하세요. Shift+클릭으로 여러 개를 고를 수 있습니다."
        );
        return null;
      }
      const sliced = sliceProject(cur, selectedTableIds);
      if (!sliced.tables.length) {
        setMsg("선택한 테이블이 없습니다.");
        return null;
      }
      return sliced;
    }
    if (!cur.tables.length) {
      setMsg("내보낼 테이블이 없습니다.");
      return null;
    }
    return cur;
  }

  async function handleExportExcel(scope: ExportScope, templateFile?: File) {
    const target = projectForExport(scope);
    if (!target) return;
    let templateBase64 = projectRef.current.templateBase64;
    let sourceFilename = projectRef.current.sourceFilename;
    if (templateFile) {
      templateBase64 = await fileToBase64(templateFile);
      sourceFilename = templateFile.name;
      commitProject(
        { ...projectRef.current, templateBase64, sourceFilename },
        { skipFlow: true }
      );
    }
    if (!templateBase64) {
      setMsg("Excel로 내보내려면 양식 파일을 선택하세요.");
      return;
    }
    setBusy(true);
    setProgress("양식 준비 중…");
    setMsg("설계서 생성 중…");
    try {
      setProgress("Excel 파일 생성 중…");
      const blob = base64ToBlob(
        templateBase64,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      const fd = new FormData();
      fd.append("model", JSON.stringify(target));
      fd.append("design", blob, sourceFilename || "template.xlsx");
      if (target.sheet) fd.append("sheet", target.sheet);
      setProgress("서버에서 정의서 작성 중…");
      const res = await fetch(`${API_BASE}/v1/er-modeler/export`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || "export failed");
      }
      setProgress("파일 내려받는 중…");
      const outBlob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const match = disp.match(/filename="?([^";]+)"?/);
      const fname = match?.[1] || `design_${target.schema}.xlsx`;
      downloadBlob(outBlob, fname);
      setExportOpen(false);
      setMsg(`내보내기 완료 — ${target.tables.length}개 테이블`);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function handleExportScript(scope: ExportScope) {
    const target = projectForExport(scope);
    if (!target) return;
    setBusy(true);
    setProgress("스크립트 생성 중…");
    setMsg("DDL 스크립트 생성 중…");
    try {
      const fd = new FormData();
      fd.append("model", JSON.stringify(target));
      fd.append("format", "json");
      setProgress("서버에서 DDL 생성 중…");
      const res = await fetch(`${API_BASE}/v1/er-modeler/generate`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          j.detail || j.error || `스크립트 생성 실패 (HTTP ${res.status})`
        );
      }
      const scripts = Array.isArray(j.scripts) ? j.scripts : [];
      if (!scripts.length) {
        throw new Error("생성된 스크립트가 없습니다.");
      }
      setScriptExport({
        schema: j.schema || target.schema || "db1",
        scripts,
      });
      setMsg(
        `스크립트 생성 완료 — ${target.tables.length}개 테이블 (Index Key constraint 포함)`
      );
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  function saveRelationEdit(next: ErRelation): RelationSaveResult {
    const cur = projectRef.current;
    let projected = {
      ...cur,
      relations: cur.relations.map((r) =>
        r.id === next.id ||
        (r.fromTable === next.fromTable && r.toTable === next.toTable)
          ? next
          : r
      ),
    };
    if (!projected.relations.some((r) => r.id === next.id)) {
      projected = { ...projected, relations: [...projected.relations, next] };
    }
    projected = syncRelationsMetadata(projected);
    const saved =
      projected.relations.find(
        (r) => r.fromTable === next.fromTable && r.toTable === next.toTable
      ) ?? next;
    const blocking = errorsTouching(projected, [
      saved.id,
      `${saved.fromTable} → ${saved.toTable}`,
    ]);
    if (blocking.length) {
      return { kind: "block", message: formatErrorReasons(blocking) };
    }
    commitProject(projected);
    setSelectedRelationId(saved.id);
    const items = validationForRelation(projected, saved);
    const notice = items.length ? formatValidationReasons(items) : undefined;
    setRelationEditNotice(notice || null);
    return { kind: "saved", notice };
  }

  function handleValidateEr() {
    const items = validateErProject(project);
    setValidationItems(items);
    setValidationOpen(true);
    const errCount = items.filter((x) => x.severity === "error").length;
    setMsg(
      `검증 완료 — ${items.length}개 항목 (${errCount}개 오류)`
    );
  }

  function handleSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const state = upsertActive(library, projectRef.current);
    setLibrary(state);
    setMsg("저장했습니다.");
  }

  function handleNewProject() {
    const item = createEmptyProject();
    const state = addProject(library, item);
    setLibrary(state);
    setProject(item);
    refreshFlow(item, false);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setShowActions(false);
    undoStackRef.current = [];
    setMsg("새 프로젝트를 만들었습니다.");
  }

  function handleAddTable() {
    setCanvasTool((cur) => {
      const next = cur === "table" ? "select" : "table";
      setMsg(
        next === "table"
          ? "캔버스를 클릭하면 untitled 테이블이 만들어집니다. Esc로 취소."
          : ""
      );
      return next;
    });
    setSelectedRelationId(null);
  }

  function handleCreateTable(table: ErTable) {
    const cur = projectRef.current;
    if (cur.tables.some((t) => t.name === table.name)) {
      setMsg("같은 이름의 테이블이 이미 있습니다.");
      return;
    }
    const next = { ...cur, tables: [...cur.tables, table] };
    commitProject(next, { layout: false });
    setSelectedTableId(table.id);
    setSelectedTableIds([table.id]);
    setSelectedColumnName(null);
    setShowActions(false);
    setMsg(`테이블 추가: ${table.name}`);
  }

  function handleRenameTable(tableId: string, nextIdRaw: string, koreanName: string): string | null {
    const cur = projectRef.current;
    const table = cur.tables.find((t) => t.id === tableId);
    if (!table) return "테이블을 찾을 수 없습니다.";
    const nextId = nextIdRaw.trim().toLowerCase();
    if (!nextId) return "테이블ID를 입력하세요.";
    if (nextId !== table.name && cur.tables.some((t) => t.name === nextId)) {
      return "같은 테이블ID가 이미 있습니다.";
    }
    const oldName = table.name;
    let tables = cur.tables.map((t) =>
      t.id === tableId ? { ...t, id: nextId, name: nextId, koreanName } : t
    );
    if (oldName !== nextId) {
      tables = rewriteFkRefsForRenamedTable(tables, oldName, nextId);
    }
    const relations = cur.relations.map((r) => {
      const fromTable = r.fromTable === oldName ? nextId : r.fromTable;
      const toTable = r.toTable === oldName ? nextId : r.toTable;
      if (fromTable === r.fromTable && toTable === r.toTable) {
        return { ...r, fromTable, toTable };
      }
      return {
        ...r,
        fromTable,
        toTable,
        id: `${fromTable}:${r.fromColumn}->${toTable}:${r.toColumn}`,
      };
    });
    const next = { ...cur, tables, relations };
    const blocking = errorsTouching(next, [oldName, nextId, tableId]);
    if (blocking.length) return formatErrorReasons(blocking);
    commitProject(next);
    setSelectedTableId(nextId);
    setSelectedTableIds((prev) =>
      prev.map((id) => (id === tableId ? nextId : id))
    );
    setTableEditId(null);
    setMsg(`테이블 수정: ${nextId}`);
    return null;
  }

  function addColumnToTable(tableId: string) {
    const cur = projectRef.current;
    const table = cur.tables.find((t) => t.id === tableId);
    if (!table) return;
    const colName = `col_${table.columns.length + 1}`;
    const nextCol = normalizeColumn({
      name: colName,
      koreanName: "",
      dataType: "VARCHAR2",
      length: 255,
      notNull: false,
      isPk: false,
      isFk: false,
      fkRef: null,
    });
    commitProject({
      ...cur,
      tables: cur.tables.map((t) =>
        t.id === tableId ? { ...t, columns: [...t.columns, nextCol] } : t
      ),
    });
    setSelectedTableId(tableId);
    setSelectedColumnName(colName);
    setColumnEdit({ tableId, columnName: colName });
  }

  function deleteColumnFromTable(tableId: string, columnName: string) {
    const cur = projectRef.current;
    const table = cur.tables.find((t) => t.id === tableId);
    if (!table) return;
    if (!confirm(`컬럼 '${columnName}'을(를) 삭제할까요?`)) return;
    const relations = cur.relations.filter(
      (r) =>
        !(
          (r.fromTable === table.name && r.fromColumn === columnName) ||
          (r.toTable === table.name && r.toColumn === columnName)
        )
    );
    commitWithUndo({
      ...cur,
      relations,
      tables: cur.tables.map((t) =>
        t.id === tableId
          ? { ...t, columns: t.columns.filter((c) => c.name !== columnName) }
          : t
      ),
    });
    setSelectedColumnName(null);
  }

  function moveColumnInTable(tableId: string, columnName: string, dir: -1 | 1) {
    const cur = projectRef.current;
    const table = cur.tables.find((t) => t.id === tableId);
    if (!table) return;
    const idx = table.columns.findIndex((c) => c.name === columnName);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= table.columns.length) return;
    const columns = [...table.columns];
    const [moved] = columns.splice(idx, 1);
    columns.splice(nextIdx, 0, moved);
    commitProject({
      ...cur,
      tables: cur.tables.map((t) => (t.id === tableId ? { ...t, columns } : t)),
    });
  }

  function saveColumnEdit(tableId: string, oldName: string, nextCol: ErColumn): string | null {
    const cur = projectRef.current;
    const table = cur.tables.find((t) => t.id === tableId);
    if (!table) return "테이블을 찾을 수 없습니다.";
    const nextName = nextCol.name;
    if (
      nextName !== oldName &&
      table.columns.some((c) => c.name === nextName)
    ) {
      return "같은 컬럼ID가 이미 있습니다.";
    }
    let relations = cur.relations;
    if (oldName !== nextName) {
      relations = relations.map((r) => {
        if (r.fromTable === table.name && r.fromColumn === oldName) {
          return {
            ...r,
            fromColumn: nextName,
            id: `${table.name}:${nextName}->${r.toTable}:${r.toColumn}`,
          };
        }
        if (r.toTable === table.name && r.toColumn === oldName) {
          return {
            ...r,
            toColumn: nextName,
            id: `${r.fromTable}:${r.fromColumn}->${table.name}:${nextName}`,
          };
        }
        return r;
      });
    }
    let colToSave = nextCol;
    if (colToSave.isFk && !String(colToSave.fkRef || "").trim()) {
      const suggested = matchingFkRefForColumn(
        { ...cur, relations },
        table.name,
        nextName
      );
      if (suggested) colToSave = { ...colToSave, fkRef: suggested };
    }
    const next = {
      ...cur,
      relations,
      tables: cur.tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              columns: t.columns.map((c) => (c.name === oldName ? colToSave : c)),
            }
          : t
      ),
    };
    const blocking = errorsForColumnSave(next, table.name, [oldName, nextName]);
    if (blocking.length) return formatErrorReasons(blocking);
    commitProject(next);
    setSelectedTableId(tableId);
    setSelectedColumnName(nextName);
    setColumnEdit(null);
    return null;
  }

  nodeActionsRef.current = {
    onSelect: (tableId, additive, columnName, point) => {
      if (canvasTool === "table") return;
      if (canvasTool === "connect") {
        pickConnectTable(tableId, columnName, point);
        return;
      }
      if (additive) {
        setSelectedTableIds((prev) =>
          prev.includes(tableId) ? prev : [...prev, tableId]
        );
      } else {
        setSelectedTableIds([tableId]);
      }
      setSelectedTableId(tableId);
      setSelectedColumnName(null);
      setShowActions(false);
      setSelectedRelationId(null);
      setRelationAnchor(null);
      setColumnEdit(null);
      setTableEditId(null);
    },
    onSelectColumn: (tableId, columnName) => {
      if (canvasTool === "connect" || canvasTool === "table") return;
      setSelectedTableId(tableId);
      setSelectedColumnName(columnName);
      setSelectedRelationId(null);
    },
    onRevealActions: (tableId, columnName) => {
      if (canvasTool === "connect" || canvasTool === "table") return;
      setSelectedTableId(tableId);
      setSelectedTableIds((prev) =>
        prev.includes(tableId) ? prev : [...prev, tableId]
      );
      setShowActions(true);
      setSelectedColumnName(columnName);
      setSelectedRelationId(null);
      setRelationAnchor(null);
    },
    onEditTable: (tableId) => {
      if (canvasTool === "connect") return;
      setSelectedTableId(tableId);
      setColumnEdit(null);
      setTableEditId(tableId);
    },
    onEditColumn: (tableId, columnName) => {
      setSelectedTableId(tableId);
      setSelectedColumnName(columnName);
      setTableEditId(null);
      setColumnEdit({ tableId, columnName });
    },
    onDeleteColumn: (tableId, columnName) => {
      deleteColumnFromTable(tableId, columnName);
    },
    onMoveColumn: (tableId, columnName, dir) => {
      moveColumnInTable(tableId, columnName, dir);
    },
    onAddColumn: (tableId) => {
      addColumnToTable(tableId);
    },
  };

  function handleSwitchProject(id: string) {
    const state = switchActive(library, id);
    const active = getActive(state).project;
    setLibrary(state);
    setProject(active);
    refreshFlow(active, false);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setShowActions(false);
    undoStackRef.current = [];
    setMsg("");
  }

  function handleDeleteProject() {
    if (!confirm("현재 프로젝트를 삭제할까요?")) return;
    const state = removeActive(library);
    const active = getActive(state).project;
    setLibrary(state);
    setProject(active);
    refreshFlow(active, false);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setShowActions(false);
    undoStackRef.current = [];
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (canvasTool !== "select") {
          setCanvasTool("select");
          setMsg("");
        }
        return;
      }
      if (isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        undoLast();
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!nodesInteractive) return;
      const cur = projectRef.current;
      const edgeId =
        selectedRelationId || edges.find((edge) => edge.selected)?.id || null;
      if (edgeId) {
        e.preventDefault();
        commitWithUndo(removeRelation(cur, edgeId));
        setSelectedRelationId(null);
        setRelationAnchor(null);
        return;
      }
      const ids = selectedTableIds.length
        ? selectedTableIds
        : selectedTableId
          ? [selectedTableId]
          : [];
      if (!ids.length) return;
      const tables = cur.tables.filter((t) => ids.includes(t.id));
      if (!tables.length) return;
      const label =
        tables.length === 1
          ? `테이블 '${tables[0].name}'을(를) 삭제할까요?`
          : `선택한 테이블 ${tables.length}개를 삭제할까요?`;
      if (!confirm(label)) return;
      e.preventDefault();
      const names = new Set(tables.map((t) => t.name));
      commitWithUndo({
        ...cur,
        tables: cur.tables.filter((t) => !ids.includes(t.id)),
        relations: cur.relations.filter(
          (r) => !names.has(r.fromTable) && !names.has(r.toTable)
        ),
      });
      setSelectedTableId(null);
      setSelectedTableIds([]);
      setShowActions(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canvasTool, commitWithUndo, edges, nodesInteractive, selectedRelationId, selectedTableId, selectedTableIds, undoLast]);

  function startSplit(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const start = leftW;
    const onMove = (ev: PointerEvent) => {
      setLeftW(Math.max(120, Math.min(420, start + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="er-modeler">
      <header className="er-topbar">
        <h1>ER Modeler</h1>
        <div className="er-topbar-actions">
          <button
            type="button"
            className="btn er-btn-sm"
            disabled={busy}
            onClick={() => setImportOpen(true)}
          >
            가져오기
          </button>
          <button
            type="button"
            className="btn er-btn-sm"
            disabled={busy}
            onClick={() => setExportOpen(true)}
          >
            내보내기
          </button>
          <button
            type="button"
            className="btn ghost er-btn-sm"
            disabled={busy}
            onClick={handleSave}
          >
            저장
          </button>
          <button
            type="button"
            className="btn ghost er-btn-sm"
            disabled={busy || !project.tables.length}
            onClick={handleValidateEr}
          >
            검증
          </button>
        </div>
        <span className="hint er-toolbar-meta">
          {project.tables.length} tables · {project.relations.length} rel
        </span>
        {msg ? (
          <p
            className={`msg er-msg ${
              msg.includes("완료") ? "ok" : msg && !msg.includes("…") ? "err" : ""
            }`}
          >
            {msg}
          </p>
        ) : null}
      </header>

      <ImportDialog
        open={importOpen}
        busy={busy}
        progress={progress}
        importProgress={importProgress}
        onClose={() => setImportOpen(false)}
        onImportExcel={(file, mode) => void handleImport(file, mode)}
        onImportSql={(sql, filename, mode) =>
          void handleImportSql(sql, filename, mode)
        }
      />

      <ExportDialog
        open={exportOpen}
        busy={busy}
        progress={progress}
        tableCount={project.tables.length}
        selectedCount={selectedTableIds.length}
        templateName={project.sourceFilename || ""}
        scriptResult={scriptExport}
        onClose={() => {
          setExportOpen(false);
          setScriptExport(null);
        }}
        onExportExcel={(scope, file) => void handleExportExcel(scope, file)}
        onGenerateScript={(scope) => void handleExportScript(scope)}
        onClearScript={() => setScriptExport(null)}
      />

      <TableEditDialog
        open={Boolean(tableEditId)}
        tableId={
          project.tables.find((t) => t.id === tableEditId)?.name ||
          tableEditId ||
          ""
        }
        tableName={
          project.tables.find((t) => t.id === tableEditId)?.koreanName || ""
        }
        anchor={tableEditAnchor}
        onClose={() => setTableEditId(null)}
        onSave={(nextId, nextName) => {
          if (!tableEditId) return "테이블을 찾을 수 없습니다.";
          return handleRenameTable(tableEditId, nextId, nextName);
        }}
      />

      <ColumnEditDialog
        open={Boolean(columnEdit)}
        column={
          columnEdit
            ? project.tables
                .find((t) => t.id === columnEdit.tableId)
                ?.columns.find((c) => c.name === columnEdit.columnName) || null
            : null
        }
        suggestedFkRef={
          columnEdit
            ? matchingFkRefForColumn(
                project,
                project.tables.find((t) => t.id === columnEdit.tableId)?.name ||
                  columnEdit.tableId,
                columnEdit.columnName
              )
            : null
        }
        anchor={columnEditAnchor}
        onClose={() => setColumnEdit(null)}
        onSave={(col) => {
          if (!columnEdit) return "컬럼을 찾을 수 없습니다.";
          return saveColumnEdit(columnEdit.tableId, columnEdit.columnName, col);
        }}
      />

      <RelationEditDialog
        open={Boolean(selectedRelationId && relationAnchor)}
        relation={
          project.relations.find((r) => r.id === selectedRelationId) ?? null
        }
        anchor={relationAnchor}
        onClose={() => {
          setRelationAnchor(null);
          setRelationEditNotice(null);
          setSelectedRelationId(null);
        }}
        initialNotice={relationEditNotice}
        onSave={saveRelationEdit}
      />

      {validationOpen ? (
        <ValidationDialog
          open={validationOpen}
          items={validationItems}
          onClose={() => setValidationOpen(false)}
        />
      ) : null}

      <div
        className="er-workspace"
        style={{
          gridTemplateColumns: `${leftW}px 6px minmax(0, 1fr)`,
        }}
      >
        <aside className="er-sidebar">
          <h3>프로젝트</h3>
          <div className="er-sidebar-actions">
            <button type="button" className="btn ghost er-btn-sm" onClick={handleNewProject}>
              새 프로젝트
            </button>
            <button
              type="button"
              className="btn ghost er-btn-sm"
              onClick={handleDeleteProject}
            >
              삭제
            </button>
          </div>
          <ul className="er-project-list">
            {library.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    item.id === library.activeId ? "er-project active" : "er-project"
                  }
                  onClick={() => handleSwitchProject(item.id)}
                >
                  <strong>{item.project.name || "제목 없음"}</strong>
                  <span className="hint">
                    {item.project.tables.length} tables ·{" "}
                    {item.project.relations.length} rel
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="er-meta-fields er-sidebar-meta">
            <label>
              시스템명
              <input
                value={project.systemName || ""}
                onChange={(e) =>
                  commitProject(
                    { ...project, systemName: e.target.value },
                    { skipFlow: true }
                  )
                }
              />
            </label>
            <label>
              작성일
              <input
                type="date"
                value={project.createdDate || ""}
                onChange={(e) =>
                  commitProject(
                    { ...project, createdDate: e.target.value },
                    { skipFlow: true }
                  )
                }
              />
            </label>
            <label>
              작성자
              <input
                value={project.author || ""}
                onChange={(e) =>
                  commitProject(
                    { ...project, author: e.target.value },
                    { skipFlow: true }
                  )
                }
              />
            </label>
            <label>
              DB명
              <input
                value={project.dbName}
                onChange={(e) =>
                  commitProject(
                    { ...project, dbName: e.target.value },
                    { skipFlow: true }
                  )
                }
              />
            </label>
            <label>
              스키마
              <input
                value={project.schema}
                onChange={(e) =>
                  commitProject(
                    { ...project, schema: e.target.value },
                    { skipFlow: true }
                  )
                }
              />
            </label>
          </div>
          <details className="er-help">
            <summary>도움말</summary>
            <ul>
              <li>
                <strong>가져오기</strong> — Excel 정의서 또는 CREATE TABLE
                스크립트에서 그립니다. 신규로 가져오거나 기존 작업에 더할 수
                있습니다.
              </li>
              <li>
                <strong>내보내기</strong> — Excel(양식 지정) 또는 스크립트로
                내보냅니다. 전체 또는 선택한 테이블만 내보낼 수 있습니다.
              </li>
              <li>
                <strong>선택</strong> — Shift+클릭으로 테이블을 여러 개 고릅니다.
              </li>
              <li>
                <strong>새 테이블</strong> — 줌 옆 아이콘을 누른 뒤 캔버스를
                클릭합니다. 테이블을 선택한 뒤 테이블 이름을 클릭하면 수정
                아이콘이 나타납니다. 이름을 더블클릭해도 수정 창이 열립니다.
              </li>
              <li>
                <strong>Ctrl+Z</strong> — 직전에 지운 테이블·연결선·컬럼을
                되돌립니다.
              </li>
              <li>
                <strong>관계 연결</strong> — 아래 연결선 아이콘을 누른 뒤 테이블을
                클릭하면 선이 마우스를 따라갑니다. 다른 테이블을 클릭하면
                연결이 끝나고 손바닥 모드로 돌아갑니다.
              </li>
              <li>
                <strong>관계 선</strong> — 세로선은 좌우, 가로선은 상하로
                드래그합니다. 더블클릭하면 관계 창이 열립니다.
              </li>
              <li>
                <strong>저장</strong> — 현재 화면의 테이블·관계를 브라우저에
                보관합니다. 편집 중에도 잠시 후 자동 저장됩니다.
              </li>
              <li>
                <strong>FK</strong> — 관계를 연결하면 자식 컬럼에 FK가
                반영됩니다. 컬럼 속성에서 수정할 수도 있습니다.
              </li>
              <li>
                <strong>자물쇠</strong> — 켜면 테이블 이동·연결이 잠깁니다.
              </li>
            </ul>
          </details>
        </aside>

        <div
          className="er-splitter"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startSplit}
        />

        <div className="er-canvas-wrap" ref={canvasWrapRef}>
          {project.tables.length === 0 ? (
            <div className="er-empty">
              <p>줌 옆 「새 테이블」아이콘을 누른 뒤 캔버스를 클릭하세요.</p>
              <p className="hint">
                Excel/SQL 가져오기, 또는 빈 테이블부터 시작할 수 있습니다.
              </p>
            </div>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChangeWrapped}
            onEdgesChange={onEdgesChangeWrapped}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onPaneClick={(event) => {
              if (canvasTool === "table") {
                const pos = screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                });
                const name = uniqueUntitledName(projectRef.current.tables);
                handleCreateTable(createTable(name, "", pos));
                setCanvasTool("select");
                return;
              }
              if (canvasTool === "connect") {
                exitConnectTool();
                setMsg("");
                return;
              }
              setSelectedTableId(null);
              setSelectedTableIds([]);
              setSelectedColumnName(null);
              setShowActions(false);
              setSelectedRelationId(null);
              setRelationAnchor(null);
              setTableEditId(null);
              setColumnEdit(null);
            }}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={canvasTool === "connect" ? 48 : 28}
            onEdgeClick={onEdgeClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={nodesInteractive && canvasTool === "select"}
            nodesConnectable={false}
            elementsSelectable={nodesInteractive && canvasTool !== "table"}
            edgesReconnectable={false}
            multiSelectionKeyCode={null}
            elevateEdgesOnSelect
            zoomOnDoubleClick={false}
            noPanClassName="nopan"
            defaultEdgeOptions={{ className: "nopan nodrag" }}
            panOnDrag
            fitView
            deleteKeyCode={null}
            className={`er-flow${connecting || connectDraft ? " er-connecting" : ""}${
              canvasTool === "table" ? " er-tool-table" : ""
            }${canvasTool === "connect" ? " er-tool-connect" : ""}`}
          >
            <Background gap={16} color="#2a3544" />
            <Controls
              showInteractive
              onInteractiveChange={(active) => setNodesInteractive(active)}
            />
            <Panel position="bottom-left" className="er-canvas-extra-tools">
              <button
                type="button"
                className={`er-canvas-tool${canvasTool === "table" ? " active" : ""}`}
                title="새 테이블 — 캔버스 클릭 위치에 untitled 생성"
                onClick={handleAddTable}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
                  <rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M2 6.5h12M8 6.5V13" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </button>
              <button
                type="button"
                className="er-canvas-tool er-canvas-tool-wide"
                title="이름 표시"
                onClick={() => {
                  const idx = NAME_DISPLAY_CYCLE.indexOf(nameDisplay);
                  setNameDisplay(
                    NAME_DISPLAY_CYCLE[(idx + 1) % NAME_DISPLAY_CYCLE.length]
                  );
                }}
              >
                {NAME_DISPLAY_LABEL[nameDisplay]}
              </button>
              <button
                type="button"
                className={`er-canvas-tool${canvasTool === "connect" ? " active" : ""}`}
                title="연결선 — 가장자리에서 드래그 (한 번 그리면 종료)"
                onClick={() => {
                  setCanvasTool((cur) => {
                    const next = cur === "connect" ? "select" : "connect";
                    if (next !== "connect") {
                      setConnectDraft(null);
                      setConnectCursor(null);
                    }
                    setMsg(
                      next === "connect"
                        ? "연결선: 관계 유형을 고른 뒤 테이블을 연결하세요."
                        : ""
                    );
                    return next;
                  });
                }}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
                  <circle
                    cx="3.2"
                    cy="8"
                    r="2.1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <circle
                    cx="12.8"
                    cy="8"
                    r="2.1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <path
                    d="M5.3 8h5.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={`er-canvas-tool er-canvas-tool-wide${showRelLabels ? " active" : ""}`}
                title="관계명(1:N) 표시"
                onClick={() => setShowRelLabels((v) => !v)}
              >
                관계명
              </button>
            </Panel>
            {canvasTool === "connect" ? (
              <Panel position="bottom-left" className="er-connect-card-panel">
                <CardinalityPicker
                  compact
                  value={connectCardinality}
                  onChange={setConnectCardinality}
                />
              </Panel>
            ) : null}
            <MiniMap
              nodeColor="#3d8bfd"
              maskColor="rgba(8, 12, 18, 0.75)"
            />
          </ReactFlow>
          {connectDraft && connectCursor ? (
            <svg className="er-connect-preview" aria-hidden>
              {(() => {
                const box = canvasWrapRef.current?.getBoundingClientRect();
                const ox = box?.left ?? 0;
                const oy = box?.top ?? 0;
                const x1 = connectDraft.from.x - ox;
                const y1 = connectDraft.from.y - oy;
                const x2 = connectCursor.x - ox;
                const y2 = connectCursor.y - oy;
                return (
                  <>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <circle cx={x1} cy={y1} r="3.5" />
                    <circle cx={x2} cy={y2} r="3.5" />
                  </>
                );
              })()}
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ErModelerApp() {
  return (
    <ReactFlowProvider>
      <ErModelerInner />
    </ReactFlowProvider>
  );
}
