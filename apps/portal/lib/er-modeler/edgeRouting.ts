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

/** Orthogonal route that always leaves the table outward so the line never enters the node. */
export function orthogonalPoints(
  fromSide: HandleSide | undefined,
  toSide: HandleSide | undefined,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  pathOffset = 0
): Point[] {
  const fs = fromSide || "R";
  const ts = toSide || "L";
  const fromLR = isLR(fs);
  const toLR = isLR(ts);
  const fromOutX = stubX(fs, fromX);
  const toOutX = stubX(ts, toX);
  const fromOutY = stubY(fs, fromY);
  const toOutY = stubY(ts, toY);

  if (fromLR && toLR) {
    let cx: number;
    if (fs === "R" && ts === "L" && fromOutX < toOutX) {
      const mid = (fromOutX + toOutX) / 2 + pathOffset;
      cx = Math.max(fromOutX, Math.min(toOutX, mid));
    } else if (fs === "L" && ts === "R" && toOutX < fromOutX) {
      const mid = (fromOutX + toOutX) / 2 + pathOffset;
      cx = Math.max(toOutX, Math.min(fromOutX, mid));
    } else if (fs === "L" && ts === "L") {
      cx = Math.min(fromOutX, toOutX) + pathOffset;
    } else {
      cx = Math.max(fromOutX, toOutX) + pathOffset;
    }
    return [
      { x: fromX, y: fromY },
      { x: cx, y: fromY },
      { x: cx, y: toY },
      { x: toX, y: toY },
    ];
  }

  if (!fromLR && !toLR) {
    let cy: number;
    if (fs === "B" && ts === "T" && fromOutY < toOutY) {
      const mid = (fromOutY + toOutY) / 2 + pathOffset;
      cy = Math.max(fromOutY, Math.min(toOutY, mid));
    } else if (fs === "T" && ts === "B" && toOutY < fromOutY) {
      const mid = (fromOutY + toOutY) / 2 + pathOffset;
      cy = Math.max(toOutY, Math.min(fromOutY, mid));
    } else if (fs === "T" && ts === "T") {
      cy = Math.min(fromOutY, toOutY) + pathOffset;
    } else {
      cy = Math.max(fromOutY, toOutY) + pathOffset;
    }
    return [
      { x: fromX, y: fromY },
      { x: fromX, y: cy },
      { x: toX, y: cy },
      { x: toX, y: toY },
    ];
  }

  if (fromLR && !toLR) {
    return [
      { x: fromX, y: fromY },
      { x: fromOutX, y: fromY },
      { x: fromOutX, y: toOutY },
      { x: toX, y: toOutY },
      { x: toX, y: toY },
    ];
  }

  return [
    { x: fromX, y: fromY },
    { x: fromX, y: fromOutY },
    { x: toOutX, y: fromOutY },
    { x: toOutX, y: toY },
    { x: toX, y: toY },
  ];
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

function pointInsideTable(p: Point, table: ErTable): boolean {
  const w = tableNodeWidth(table, "both");
  const h = tableNodeHeight(table.columns.length);
  return (
    p.x > table.position.x + 3 &&
    p.x < table.position.x + w - 3 &&
    p.y > table.position.y + 3 &&
    p.y < table.position.y + h - 3
  );
}

function routePenalty(
  points: Point[],
  fromTable: ErTable,
  toTable: ErTable
): number {
  let extra = 0;
  for (let i = 1; i < points.length - 1; i++) {
    if (pointInsideTable(points[i], fromTable) || pointInsideTable(points[i], toTable)) {
      extra += 20000;
    }
  }
  return extra;
}

export function pickOptimalSides(
  fromTable: ErTable,
  toTable: ErTable,
  fromColumn: string,
  toColumn: string
): { fromSide: HandleSide; toSide: HandleSide } {
  let best: { fromSide: HandleSide; toSide: HandleSide } = {
    fromSide: "R",
    toSide: "L",
  };
  let bestLen = Infinity;

  for (const fromSide of SIDES) {
    for (const toSide of SIDES) {
      const from = anchorPoint(fromTable, fromColumn, fromSide);
      const to = anchorPoint(toTable, toColumn, toSide);
      const pts = buildRoutePoints(fromSide, toSide, from.x, from.y, to.x, to.y);
      const len = pathLength(pts) + routePenalty(pts, fromTable, toTable);
      if (len < bestLen) {
        bestLen = len;
        best = { fromSide, toSide };
      }
    }
  }
  return best;
}

export function optimizeRelationSides(project: ErProject): ErProject {
  const tablesByName = Object.fromEntries(project.tables.map((t) => [t.name, t]));
  const relations = project.relations.map((rel) => optimizeRelation(project, rel, tablesByName));
  return { ...project, relations };
}

function optimizeRelation(
  project: ErProject,
  rel: ErRelation,
  tablesByName: Record<string, ErTable>
): ErRelation {
  const fromTable = tablesByName[rel.fromTable];
  const toTable = tablesByName[rel.toTable];
  if (!fromTable || !toTable) return rel;

  const { fromSide, toSide } = pickOptimalSides(
    fromTable,
    toTable,
    EDGE_COLUMN,
    EDGE_COLUMN
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
          fromYOffset: 0,
          toYOffset: 0,
          fromXOffset: 0,
          toXOffset: 0,
        }
      : {}),
  };
}
