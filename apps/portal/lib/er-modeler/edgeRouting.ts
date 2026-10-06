import { HEADER_HEIGHT, ROW_HEIGHT, tableNodeHeight, tableNodeWidth } from "./layout";
import { EDGE_COLUMN, type ErProject, type ErRelation, type ErTable, type HandleSide } from "./types";

type Point = { x: number; y: number };

const SIDES: HandleSide[] = ["L", "R", "T", "B"];

function isLR(side?: HandleSide) {
  return side === "L" || side === "R" || !side;
}

function columnIndex(table: ErTable, columnName: string): number {
  const idx = table.columns.findIndex((c) => c.name === columnName);
  return idx >= 0 ? idx : 0;
}

function columnCenterY(table: ErTable, columnName: string): number {
  const h = tableNodeHeight(table.columns.length);
  if (columnName === EDGE_COLUMN) {
    return table.position.y + h / 2;
  }
  const idx = columnIndex(table, columnName);
  return table.position.y + HEADER_HEIGHT + idx * ROW_HEIGHT + ROW_HEIGHT / 2;
}

export function anchorPoint(
  table: ErTable,
  columnName: string,
  side: HandleSide
): Point {
  const w = tableNodeWidth(table, "both");
  const h = tableNodeHeight(table.columns.length);
  const cy = columnCenterY(table, columnName);
  const cx = table.position.x + w / 2;
  switch (side) {
    case "L":
      return { x: table.position.x, y: cy };
    case "R":
      return { x: table.position.x + w, y: cy };
    case "T":
      return { x: cx, y: table.position.y };
    case "B":
      return { x: cx, y: table.position.y + h };
    default:
      return { x: table.position.x + w, y: cy };
  }
}

const STUB = 28;

function stubX(side: HandleSide | undefined, x: number) {
  if (side === "L") return x - STUB;
  if (side === "R") return x + STUB;
  return x;
}

function stubY(side: HandleSide | undefined, y: number) {
  if (side === "T") return y - STUB;
  if (side === "B") return y + STUB;
  return y;
}

/** 연결선이 테이블 안쪽으로 꺾이지 않도록 바깥 방향으로 clamp */
function clampOutX(side: HandleSide, edgeX: number, value: number): number {
  if (side === "R") return Math.max(value, edgeX + STUB);
  if (side === "L") return Math.min(value, edgeX - STUB);
  return value;
}

function clampOutY(side: HandleSide, edgeY: number, value: number): number {
  if (side === "B") return Math.max(value, edgeY + STUB);
  if (side === "T") return Math.min(value, edgeY - STUB);
  return value;
}

/** 목표 테이블 접근 시 버스(corridor)가 테이블 바깥에 머물도록 clamp */
function clampApproachX(side: HandleSide, edgeX: number, value: number): number {
  if (side === "L") return Math.min(value, edgeX - STUB);
  if (side === "R") return Math.max(value, edgeX + STUB);
  return value;
}

function clampApproachY(side: HandleSide, edgeY: number, value: number): number {
  if (side === "T") return Math.min(value, edgeY - STUB);
  if (side === "B") return Math.max(value, edgeY + STUB);
  return value;
}

/** Orthogonal route that always leaves the table outward so the line never enters the node. */
export function orthogonalPoints(
  fromSide: HandleSide | undefined,
  toSide: HandleSide | undefined,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  pathOffset = 0,
  pathOffsetV = 0
): Point[] {
  const fs = fromSide || "R";
  const ts = toSide || "L";
  const fromLR = isLR(fs);
  const toLR = isLR(ts);

  // 같은 축에 정렬 + 오프셋 없으면 직선(최단)
  if (pathOffset === 0 && pathOffsetV === 0) {
    if (fromLR && toLR && Math.abs(fromY - toY) < 1) {
      return [
        { x: fromX, y: fromY },
        { x: toX, y: toY },
      ];
    }
    if (!fromLR && !toLR && Math.abs(fromX - toX) < 1) {
      return [
        { x: fromX, y: fromY },
        { x: toX, y: toY },
      ];
    }
    if (
      ((fs === "B" && ts === "T") || (fs === "T" && ts === "B")) &&
      Math.abs(fromX - toX) < 1
    ) {
      return [
        { x: fromX, y: fromY },
        { x: toX, y: toY },
      ];
    }
    if (
      ((fs === "R" && ts === "L") || (fs === "L" && ts === "R")) &&
      Math.abs(fromY - toY) < 1
    ) {
      return [
        { x: fromX, y: fromY },
        { x: toX, y: toY },
      ];
    }
  }

  let fromOutX = stubX(fs, fromX) + pathOffset;
  let toOutX = stubX(ts, toX) + pathOffset;
  let fromOutY = stubY(fs, fromY) + pathOffsetV;
  let toOutY = stubY(ts, toY) + pathOffsetV;

  if (fromLR) fromOutX = clampOutX(fs, fromX, fromOutX);
  if (toLR) toOutX = clampOutX(ts, toX, toOutX);
  if (!fromLR) fromOutY = clampOutY(fs, fromY, fromOutY);
  if (!toLR) toOutY = clampOutY(ts, toY, toOutY);

  if (fromLR && toLR) {
    let cx: number;
    const rawFromOutX = stubX(fs, fromX);
    const rawToOutX = stubX(ts, toX);
    if (fs === "R" && ts === "L" && rawFromOutX < rawToOutX) {
      const mid = (rawFromOutX + rawToOutX) / 2 + pathOffset;
      cx = Math.max(rawFromOutX, Math.min(rawToOutX, mid));
    } else if (fs === "L" && ts === "R" && rawToOutX < rawFromOutX) {
      const mid = (rawFromOutX + rawToOutX) / 2 + pathOffset;
      cx = Math.max(rawToOutX, Math.min(rawFromOutX, mid));
    } else if (fs === "L" && ts === "L") {
      cx = Math.min(rawFromOutX, rawToOutX) + pathOffset;
    } else if (fs === "R" && ts === "R") {
      cx = Math.max(rawFromOutX, rawToOutX) + pathOffset;
    } else {
      // L–R / R–L 역방향: 두 stub 사이 중간
      cx = (rawFromOutX + rawToOutX) / 2 + pathOffset;
    }
    cx = clampOutX(fs, fromX, cx);
    cx = clampApproachX(ts, toX, cx);
    const pts = [
      { x: fromX, y: fromY },
      { x: cx, y: fromY },
      { x: cx, y: toY },
      { x: toX, y: toY },
    ];
    return fixInwardFirstSegment(pts, fs, fromX, fromY);
  }

  if (!fromLR && !toLR) {
    let cy: number;
    const rawFromOutY = stubY(fs, fromY);
    const rawToOutY = stubY(ts, toY);
    if (fs === "B" && ts === "T" && rawFromOutY < rawToOutY) {
      const mid = (rawFromOutY + rawToOutY) / 2 + pathOffsetV;
      cy = Math.max(rawFromOutY, Math.min(rawToOutY, mid));
    } else if (fs === "T" && ts === "B" && rawToOutY < rawFromOutY) {
      const mid = (rawFromOutY + rawToOutY) / 2 + pathOffsetV;
      cy = Math.max(rawToOutY, Math.min(rawFromOutY, mid));
    } else if (fs === "T" && ts === "T") {
      cy = Math.min(rawFromOutY, rawToOutY) + pathOffsetV;
    } else {
      cy = Math.max(rawFromOutY, rawToOutY) + pathOffsetV;
    }
    cy = clampOutY(fs, fromY, cy);
    cy = clampApproachY(ts, toY, cy);
    const pts = [
      { x: fromX, y: fromY },
      { x: fromX, y: cy },
      { x: toX, y: cy },
      { x: toX, y: toY },
    ];
    return fixInwardFirstSegment(pts, fs, fromX, fromY);
  }

  if (fromLR && !toLR) {
    if (Math.abs(fromOutX - toX) < 2 && pathOffset === 0 && pathOffsetV === 0) {
      return fixInwardFirstSegment(
        [
          { x: fromX, y: fromY },
          { x: fromOutX, y: fromY },
          { x: toX, y: toY },
        ],
        fs,
        fromX,
        fromY
      );
    }
    const pts = [
      { x: fromX, y: fromY },
      { x: fromOutX, y: fromY },
      { x: fromOutX, y: toOutY },
      { x: toX, y: toOutY },
      { x: toX, y: toY },
    ];
    return fixInwardFirstSegment(pts, fs, fromX, fromY);
  }

  // T/B → L/R : 마지막 접근은 가로 — stub 끝 Y는 항상 앵커(toY)와 같아야 직교 유지
  if (Math.abs(toOutX - fromX) < 2 && pathOffset === 0 && pathOffsetV === 0) {
    return fixInwardFirstSegment(
      [
        { x: fromX, y: fromY },
        { x: fromX, y: fromOutY },
        { x: toX, y: toY },
      ],
      fs,
      fromX,
      fromY
    );
  }
  const pts = [
    { x: fromX, y: fromY },
    { x: fromX, y: fromOutY },
    { x: toOutX, y: fromOutY },
    { x: toOutX, y: toY },
    { x: toX, y: toY },
  ];
  return fixInwardFirstSegment(pts, fs, fromX, fromY);
}

/** 시작 세그먼트만 테이블 안쪽 침범 방지 (꺾임점·접근점은 건드리지 않음) */
function fixInwardFirstSegment(
  pts: Point[],
  fs: HandleSide,
  fromX: number,
  fromY: number
): Point[] {
  if (pts.length < 2) return pts;
  const out = pts.map((p) => ({ ...p }));
  const p1 = out[1];
  if (fs === "R" && p1.x < fromX) p1.x = fromX + STUB;
  if (fs === "L" && p1.x > fromX) p1.x = fromX - STUB;
  if (fs === "B" && p1.y < fromY) p1.y = fromY + STUB;
  if (fs === "T" && p1.y > fromY) p1.y = fromY - STUB;
  return out;
}

function buildRoutePoints(
  fromSide: HandleSide,
  toSide: HandleSide,
  sx: number,
  sy: number,
  tx: number,
  ty: number
): Point[] {
  return orthogonalPoints(fromSide, toSide, sx, sy, tx, ty, 0);
}

function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

function sameSidePenalty(fromSide: HandleSide, toSide: HandleSide): number {
  return fromSide === toSide ? 6000 : 0;
}

function segmentIntersectsTableInterior(
  a: Point,
  b: Point,
  table: ErTable
): boolean {
  const w = tableNodeWidth(table, "both");
  const h = tableNodeHeight(table.columns.length);
  const left = table.position.x + 3;
  const right = table.position.x + w - 3;
  const top = table.position.y + 3;
  const bottom = table.position.y + h - 3;

  if (Math.abs(a.x - b.x) < 1) {
    const x = a.x;
    if (x <= left || x >= right) return false;
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return y1 > top && y0 < bottom;
  }
  if (Math.abs(a.y - b.y) < 1) {
    const y = a.y;
    if (y <= top || y >= bottom) return false;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    return x1 > left && x0 < right;
  }
  return false;
}

function routePenalty(
  points: Point[],
  fromTable: ErTable,
  toTable: ErTable
): number {
  let extra = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (
      segmentIntersectsTableInterior(a, b, fromTable) ||
      segmentIntersectsTableInterior(a, b, toTable)
    ) {
      extra += 20000;
    }
  }
  return extra;
}

function tableCenter(table: ErTable) {
  const w = tableNodeWidth(table, "both");
  const h = tableNodeHeight(table.columns.length);
  return {
    x: table.position.x + w / 2,
    y: table.position.y + h / 2,
    w,
    h,
  };
}

/** 상대 위치 기반 연결면 추정 — 최단 경로에 가깝게 */
function sidesByGeometry(
  fromTable: ErTable,
  toTable: ErTable
): { fromSide: HandleSide; toSide: HandleSide } {
  const a = tableCenter(fromTable);
  const b = tableCenter(toTable);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: "R", toSide: "L" }
      : { fromSide: "L", toSide: "R" };
  }
  return dy >= 0
    ? { fromSide: "B", toSide: "T" }
    : { fromSide: "T", toSide: "B" };
}

export function pickOptimalSides(
  fromTable: ErTable,
  toTable: ErTable,
  fromColumn: string,
  toColumn: string
): { fromSide: HandleSide; toSide: HandleSide } {
  let best = sidesByGeometry(fromTable, toTable);
  let bestLen = Infinity;

  for (const fromSide of SIDES) {
    for (const toSide of SIDES) {
      const from = anchorPoint(fromTable, fromColumn, fromSide);
      const to = anchorPoint(toTable, toColumn, toSide);
      const pts = buildRoutePoints(fromSide, toSide, from.x, from.y, to.x, to.y);
      const len =
        pathLength(pts) +
        routePenalty(pts, fromTable, toTable) +
        sameSidePenalty(fromSide, toSide);
      if (len < bestLen) {
        bestLen = len;
        best = { fromSide, toSide };
      }
    }
  }
  return best;
}

export function optimizeRelationSides(project: ErProject): ErProject {
  const tablesByName = tableMapByName(project);
  const relations = project.relations.map((rel) =>
    recomputeRelationSides(rel, tablesByName)
  );
  return { ...project, relations };
}

function tableMapByName(project: ErProject): Record<string, ErTable> {
  const map: Record<string, ErTable> = {};
  for (const t of project.tables) {
    map[t.name] = t;
    map[t.id] = t;
  }
  return map;
}

function movedTableKeys(project: ErProject, tableIds: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const id of tableIds) {
    keys.add(id);
    const t = project.tables.find((x) => x.id === id);
    if (t) keys.add(t.name);
  }
  return keys;
}

function relationTouchesMoved(rel: ErRelation, moved: Set<string>): boolean {
  return moved.has(rel.fromTable) || moved.has(rel.toTable);
}

/** 테이블 이동 후 — 연결된 관계선의 L/R/T/B를 상대 위치 기준 최단 경로로 재계산 */
export function rerouteRelationsForTables(
  project: ErProject,
  tableIds: Iterable<string>
): ErProject {
  const moved = movedTableKeys(project, tableIds);
  if (!moved.size) return project;
  const tablesByName = tableMapByName(project);
  const relations = project.relations.map((rel) =>
    relationTouchesMoved(rel, moved)
      ? recomputeRelationSides(rel, tablesByName)
      : rel
  );
  return { ...project, relations };
}

function recomputeRelationSides(
  rel: ErRelation,
  tablesByName: Record<string, ErTable>
): ErRelation {
  const fromTable = tablesByName[rel.fromTable];
  const toTable = tablesByName[rel.toTable];
  if (!fromTable || !toTable) return rel;

  const fromCol = rel.fromColumn || EDGE_COLUMN;
  const toCol = rel.toColumn || EDGE_COLUMN;
  const { fromSide, toSide } = pickOptimalSides(
    fromTable,
    toTable,
    fromCol,
    toCol
  );
  const prevFrom = rel.fromSide || "R";
  const prevTo = rel.toSide || "L";
  const sidesChanged = fromSide !== prevFrom || toSide !== prevTo;

  return {
    ...rel,
    fromSide,
    toSide,
    ...(sidesChanged
      ? {
          pathOffset: 0,
          pathOffsetV: 0,
          fromYOffset: 0,
          toYOffset: 0,
          fromXOffset: 0,
          toXOffset: 0,
        }
      : {}),
  };
}
