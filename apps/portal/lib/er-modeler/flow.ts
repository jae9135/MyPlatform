import type { Connection, Edge, Node } from "@xyflow/react";

import {
  EDGE_COLUMN,
  columnHandleId,
  displayCardinality,
  inferRelationColumns,
  newId,
  normalizeCardinality,
  parseHandleId,
  syncRelationsMetadata,
  todayDate,
  type ErProject,
  type ErRelation,
  type ErTable,
  type HandleSide,
  type NameDisplayMode,
  type RelationCardinality,
} from "./types";
import { HEADER_HEIGHT, tableNodeHeight, tableNodeWidth } from "./layout";

export function projectToFlow(
  project: ErProject,
  nameDisplay: NameDisplayMode = "both"
): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = project.tables.map((table) =>
    tableToNode(table, nameDisplay)
  );
  const edges: Edge[] = project.relations.map(relationToEdge);
  return { nodes, edges };
}

export function tableToNode(
  table: ErTable,
  nameDisplay: NameDisplayMode = "both"
): Node {
  const width = tableNodeWidth(table, nameDisplay);
  return {
    id: table.id,
    type: "erTable",
    position: table.position,
    width,
    style: { width },
    data: {
      tableId: table.id,
      name: table.name,
      koreanName: table.koreanName,
      columns: table.columns,
      nameDisplay,
    },
  };
}

export function relationToEdge(rel: ErRelation): Edge {
  const fromSide = rel.fromSide || "R";
  const toSide = rel.toSide || "L";
  return {
    id: rel.id,
    source: rel.fromTable,
    target: rel.toTable,
    sourceHandle: columnHandleId(rel.fromTable, EDGE_COLUMN, fromSide),
    targetHandle: columnHandleId(rel.toTable, EDGE_COLUMN, toSide),
    type: "erRelation",
    animated: false,
    label: displayCardinality(rel.cardinality || "1:1..N"),
    data: {
      relationId: rel.id,
      cardinality: normalizeCardinality(rel.cardinality),
      isIdentifying: rel.isIdentifying ?? false,
      pathOffset: rel.pathOffset ?? 0,
      fromYOffset: rel.fromYOffset ?? 0,
      toYOffset: rel.toYOffset ?? 0,
      fromXOffset: rel.fromXOffset ?? 0,
      toXOffset: rel.toXOffset ?? 0,
      fromSide: rel.fromSide || "R",
      toSide: rel.toSide || "L",
    },
  };
}

export { optimizeRelationSides } from "./edgeRouting";

export function applyNodePositions(project: ErProject, nodes: Node[]): ErProject {
  const posById = Object.fromEntries(nodes.map((n) => [n.id, n.position]));
  return {
    ...project,
    tables: project.tables.map((t) => ({
      ...t,
      position: posById[t.id] || t.position,
    })),
  };
}

export function connectionToRelation(
  conn: Connection,
  cardinality: RelationCardinality = "1:1..N"
): ErRelation | null {
  if (!conn.source || !conn.target || conn.source === conn.target) {
    return null;
  }
  if (!conn.sourceHandle || !conn.targetHandle) return null;
  const from = parseHandleId(conn.sourceHandle);
  const to = parseHandleId(conn.targetHandle);
  if (!from || !to) return null;
  if (from.table === to.table) return null;

  const id = `${from.table}:${EDGE_COLUMN}->${to.table}:${EDGE_COLUMN}`;
  return {
    id,
    fromTable: from.table,
    fromColumn: EDGE_COLUMN,
    toTable: to.table,
    toColumn: EDGE_COLUMN,
    cardinality: normalizeCardinality(cardinality),
    fromSide: from.side,
    toSide: to.side,
  };
}

export function tableSideFromClientPoint(
  tableId: string,
  clientX: number,
  clientY: number
): HandleSide {
  const el = document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(tableId)}"]`
  );
  if (!(el instanceof HTMLElement)) return "R";
  return sideFromNodePoint(el, clientX, clientY);
}

export function computeEdgeOffsetForSide(
  table: ErTable,
  side: HandleSide,
  flowX: number,
  flowY: number
): { yOffset: number; xOffset: number } {
  const w = tableNodeWidth(table, "both");
  const h = tableNodeHeight(table.columns.length);
  const cx = table.position.x + w / 2;
  const cy = table.position.y + h / 2;
  if (side === "L" || side === "R") {
    return { yOffset: flowY - cy, xOffset: 0 };
  }
  return { yOffset: 0, xOffset: flowX - cx };
}

export { inferRelationColumns };

export function eventClientPoint(
  event: MouseEvent | TouchEvent
): { x: number; y: number } | null {
  if ("changedTouches" in event && event.changedTouches[0]) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function sideFromNodePoint(
  node: Element,
  clientX: number,
  clientY: number
): HandleSide {
  const box = node.getBoundingClientRect();
  const dl = Math.abs(clientX - box.left);
  const dr = Math.abs(box.right - clientX);
  const dt = Math.abs(clientY - box.top);
  const db = Math.abs(box.bottom - clientY);
  const m = Math.min(dl, dr, dt, db);
  if (m === dt) return "T";
  if (m === db) return "B";
  if (m === dl) return "L";
  return "R";
}

export function tableNodeScreenAnchor(
  tableId: string,
  clientX?: number,
  clientY?: number
): { x: number; y: number } | null {
  const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(tableId)}"]`);
  if (!(el instanceof HTMLElement)) return null;
  const box = el.getBoundingClientRect();
  const midX = box.left + box.width / 2;
  const midY = box.top + box.height / 2;
  if (clientX == null || clientY == null) {
    return { x: box.right, y: midY };
  }
  const side = sideFromNodePoint(el, clientX, clientY);
  if (side === "L") return { x: box.left, y: Math.min(Math.max(clientY, box.top + 8), box.bottom - 8) };
  if (side === "R") return { x: box.right, y: Math.min(Math.max(clientY, box.top + 8), box.bottom - 8) };
  if (side === "T") return { x: Math.min(Math.max(clientX, box.left + 8), box.right - 8), y: box.top };
  return { x: Math.min(Math.max(clientX, box.left + 8), box.right - 8), y: box.bottom };
}

export function findErColumnAtPoint(
  clientX: number,
  clientY: number
): { nodeId: string; tableName: string; columnName: string; side: HandleSide } | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  let nodeEl: HTMLElement | null = null;
  let rowHit: HTMLElement | null = null;
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    const row = el.closest("[data-er-col]");
    if (row instanceof HTMLElement && row.dataset.erCol && row.dataset.erTable) {
      rowHit = row;
      nodeEl = row.closest(".react-flow__node");
      break;
    }
    const node = el.closest(".react-flow__node");
    if (node instanceof HTMLElement && !nodeEl) nodeEl = node;
  }
  if (!nodeEl) return null;
  const nodeId = nodeEl.getAttribute("data-id");
  if (!nodeId) return null;
  const rows = Array.from(nodeEl.querySelectorAll<HTMLElement>("[data-er-col]"));
  if (!rows.length) return null;
  let best = rowHit || rows[0];
  if (!rowHit) {
    let bestDist = Infinity;
    for (const row of rows) {
      const box = row.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      const dist = Math.abs(mid - clientY);
      if (dist < bestDist) {
        bestDist = dist;
        best = row;
      }
    }
  }
  if (!best.dataset.erCol || !best.dataset.erTable) return null;
  return {
    nodeId,
    tableName: best.dataset.erTable,
    columnName: best.dataset.erCol,
    side: sideFromNodePoint(nodeEl, clientX, clientY),
  };
}

export function resolveEdgeColumn(
  project: ErProject,
  tableName: string,
  columnName: string,
  clientX?: number,
  clientY?: number
): string {
  if (columnName && columnName !== EDGE_COLUMN) return columnName;
  if (clientX != null && clientY != null) {
    const hit = findErColumnAtPoint(clientX, clientY);
    if (hit && hit.tableName === tableName) return hit.columnName;
  }
  const table = project.tables.find((t) => t.name === tableName || t.id === tableName);
  const pk = table?.columns.find((c) => c.isPk);
  return pk?.name || table?.columns[0]?.name || "id";
}

export function addRelation(project: ErProject, rel: ErRelation): ErProject {
  const filtered = project.relations.filter((r) => r.id !== rel.id);
  return {
    ...project,
    relations: [...filtered, rel],
  };
}

export function removeRelation(project: ErProject, relationId: string): ErProject {
  return {
    ...project,
    relations: project.relations.filter((r) => r.id !== relationId),
  };
}

export function importResponseToProject(
  data: {
    source_filename: string;
    meta: {
      sheet: string;
      designFormat: "flat" | "block" | "sql";
      dbName: string;
      schema: string;
      systemName?: string;
      createdDate?: string;
      author?: string;
    };
    tables: Omit<ErTable, "position">[];
    relations: ErRelation[];
  },
  templateBase64?: string
): ErProject {
  const baseName = (data.source_filename || "imported").replace(/\.[^.]+$/, "");
  return {
    id: newId(),
    name: baseName,
    updatedAt: new Date().toISOString(),
    dbName: data.meta.dbName,
    schema: data.meta.schema,
    sheet: data.meta.sheet,
    designFormat: data.meta.designFormat,
    sourceFilename: data.source_filename,
    systemName: data.meta.systemName || "",
    createdDate: data.meta.createdDate || todayDate(),
    author: data.meta.author || "",
    templateBase64,
    tables: data.tables.map((t, idx) => ({
      ...t,
      id: t.id || t.name,
      position: { x: (idx % 4) * 280, y: Math.floor(idx / 4) * 220 },
    })),
    relations: data.relations || [],
  };
}

export function sliceProject(
  project: ErProject,
  tableIds: string[]
): ErProject {
  const idSet = new Set(tableIds);
  const tables = project.tables.filter((t) => idSet.has(t.id));
  const names = new Set(tables.map((t) => t.name));
  return {
    ...project,
    tables,
    relations: project.relations.filter(
      (r) => names.has(r.fromTable) && names.has(r.toTable)
    ),
  };
}

export function mergeImportedProject(
  current: ErProject,
  incoming: ErProject
): { project: ErProject; added: number; skipped: number } {
  const existingNames = new Set(
    current.tables.map((t) => t.name.toLowerCase())
  );
  let maxX = 0;
  for (const t of current.tables) {
    maxX = Math.max(maxX, t.position.x);
  }
  const offsetX = current.tables.length ? maxX + 340 : 0;
  const addedTables: ErTable[] = [];
  let skipped = 0;
  for (const t of incoming.tables) {
    if (existingNames.has(t.name.toLowerCase())) {
      skipped += 1;
      continue;
    }
    addedTables.push({
      ...t,
      position: { x: t.position.x + offsetX, y: t.position.y },
    });
    existingNames.add(t.name.toLowerCase());
  }
  const names = new Set(
    [...current.tables, ...addedTables].map((t) => t.name)
  );
  const existingRel = new Set(current.relations.map((r) => r.id));
  const addedRel = incoming.relations.filter(
    (r) =>
      !existingRel.has(r.id) &&
      names.has(r.fromTable) &&
      names.has(r.toTable)
  );
  return {
    project: {
      ...current,
      sheet: incoming.sheet || current.sheet,
      designFormat: incoming.designFormat || current.designFormat,
      sourceFilename: incoming.sourceFilename || current.sourceFilename,
      templateBase64: incoming.templateBase64 || current.templateBase64,
      dbName: current.dbName || incoming.dbName,
      schema: current.schema || incoming.schema,
      systemName: current.systemName || incoming.systemName || "",
      createdDate: current.createdDate || incoming.createdDate || "",
      author: current.author || incoming.author || "",
      tables: [...current.tables, ...addedTables],
      relations: [...current.relations, ...addedRel],
    },
    added: addedTables.length,
    skipped,
  };
}

export function uniqueUntitledName(tables: { name: string }[]): string {
  const names = new Set(tables.map((t) => t.name.toLowerCase()));
  if (!names.has("untitled")) return "untitled";
  let i = 2;
  while (names.has(`untitled_${i}`)) i += 1;
  return `untitled_${i}`;
}

export function createTable(
  name: string,
  koreanName = "",
  position: { x: number; y: number } = { x: 80, y: 80 }
): ErTable {
  const tableName = name.trim().toLowerCase() || "untitled";
  return {
    id: tableName,
    name: tableName,
    koreanName: koreanName.trim(),
    position,
    columns: [
      {
        name: "id",
        koreanName: "식별자",
        dataType: "NUMBER",
        length: 10,
        notNull: true,
        isPk: true,
        isFk: false,
        fkRef: null,
      },
    ],
  };
}
