import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

import {
  formatColumnType,
  formatTableTitle,
  type ErColumn,
  type ErTable,
  type NameDisplayMode,
} from "./types";

const NODE_WIDTH = 300;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 26;
const PADDING = 12;
const MIN_TABLE_WIDTH = 160;
let measureCanvas: HTMLCanvasElement | null = null;

export function tableNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT + PADDING;
}

function measureText(text: string, font: string): number {
  if (typeof document === "undefined") {
    return Math.ceil((text || "").length * 8);
  }
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return Math.ceil((text || "").length * 8);
  ctx.font = font;
  return ctx.measureText(text || "").width;
}

export function tableNodeWidth(
  table: Pick<ErTable, "name" | "koreanName" | "columns">,
  mode: NameDisplayMode = "both"
): number {
  const title = formatTableTitle(table.name, table.koreanName, mode);
  let width = measureText(title, "600 13.2px system-ui, sans-serif") + 28;
  for (const col of table.columns) {
    const idW = measureText(col.name, "12.5px ui-monospace, Consolas, monospace");
    const koW =
      mode === "en"
        ? 0
        : measureText(col.koreanName || "", "12.5px system-ui, sans-serif");
    const typeW = measureText(
      formatColumnType(col.dataType, col.length),
      "11.5px ui-monospace, Consolas, monospace"
    );
    const nameW = mode === "ko" ? koW : idW;
    const extraKo = mode === "both" ? koW + 10 : 0;
    const row = 8 + 52 + 8 + nameW + extraKo + typeW + 4;
    width = Math.max(width, row);
  }
  return Math.ceil(Math.max(MIN_TABLE_WIDTH, width));
}

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR"
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

  const widths = new Map<string, number>();
  for (const node of nodes) {
    const data = node.data as {
      columns?: ErColumn[];
      name?: string;
      koreanName?: string;
      nameDisplay?: NameDisplayMode;
    };
    const colCount = data.columns?.length ?? 0;
    const width = tableNodeWidth(
      {
        name: data.name || node.id,
        koreanName: data.koreanName || "",
        columns: data.columns || [],
      },
      data.nameDisplay || "both"
    );
    widths.set(node.id, width);
    g.setNode(node.id, { width, height: tableNodeHeight(colCount) });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const colCount =
      (node.data as { columns?: unknown[] })?.columns?.length ?? 0;
    const width = widths.get(node.id) ?? NODE_WIDTH;
    const height = tableNodeHeight(colCount);
    return {
      ...node,
      style: { ...node.style, width },
      width,
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2,
      },
    };
  });
}

export { NODE_WIDTH, HEADER_HEIGHT, ROW_HEIGHT, MIN_TABLE_WIDTH };
