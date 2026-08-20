import { getNodesBounds, type Node } from "@xyflow/react";
import { jsPDF } from "jspdf";

import { HEADER_HEIGHT, ROW_HEIGHT, tableNodeHeight, tableNodeWidth } from "./layout";
import {
  formatColumnType,
  formatTableTitle,
  type ErProject,
  type ErTable,
  type NameDisplayMode,
} from "./types";

const DEFAULT_BG = "#080c12";
const EXPORT_PADDING = 48;

let measureCanvas: HTMLCanvasElement | null = null;

function measureText(text: string, font: string): number {
  if (typeof document === "undefined") {
    return Math.ceil((text || "").length * 7);
  }
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return Math.ceil((text || "").length * 7);
  ctx.font = font;
  return ctx.measureText(text || "").width;
}

function sanitizeFilename(name: string): string {
  return (name || "erd")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .trim()
    .slice(0, 80);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tablePositions(
  project: ErProject,
  nodes: Node[]
): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n.position]));
  const positions = new Map<string, { x: number; y: number }>();
  for (const table of project.tables) {
    positions.set(
      table.id,
      byId.get(table.id) || byId.get(table.name) || table.position
    );
  }
  return positions;
}

function columnXs(
  table: ErTable,
  mode: NameDisplayMode,
  baseX: number
): { key: number; name: number; ko: number; type: number } {
  const key = baseX + 8;
  const name = baseX + 52;
  if (mode !== "both") {
    return { key, name, ko: name, type: baseX + tableNodeWidth(table, mode) - 8 };
  }
  let maxNameW = 0;
  for (const col of table.columns) {
    maxNameW = Math.max(
      maxNameW,
      measureText(col.name, "12px Consolas, ui-monospace, monospace")
    );
  }
  const ko = name + Math.max(72, Math.ceil(maxNameW) + 12);
  const type = baseX + tableNodeWidth(table, mode) - 8;
  return { key, name, ko, type };
}

function renderTableSvg(
  table: ErTable,
  mode: NameDisplayMode,
  x: number,
  y: number
): string {
  const width = tableNodeWidth(table, mode);
  const height = tableNodeHeight(table.columns.length);
  const title = formatTableTitle(table.name, table.koreanName, mode);
  const cols = columnXs(table, mode, x);
  const lines: string[] = [];

  lines.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#121a22" stroke="#3a4a5c" stroke-width="1"/>`
  );
  lines.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${HEADER_HEIGHT}" rx="8" fill="#1a2430" stroke="none"/>`
  );
  lines.push(
    `<rect x="${x}" y="${y + HEADER_HEIGHT - 8}" width="${width}" height="8" fill="#1a2430" stroke="none"/>`
  );
  lines.push(
    `<line x1="${x}" y1="${y + HEADER_HEIGHT}" x2="${x + width}" y2="${y + HEADER_HEIGHT}" stroke="#2a3544"/>`
  );
  lines.push(
    `<text x="${x + 12}" y="${y + 21}" fill="#d7e2ee" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(title)}</text>`
  );

  table.columns.forEach((col, idx) => {
    const rowTop = y + HEADER_HEIGHT + idx * ROW_HEIGHT;
    const textY = rowTop + ROW_HEIGHT * 0.72;
    const badges: string[] = [];
    if (col.isPk) badges.push("PK");
    if (col.isFk) badges.push("FK");
    const badgeText = badges.join(" ") || "";
    const nameText = mode === "ko" ? col.koreanName || col.name : col.name;
    const typeText = formatColumnType(col.dataType, col.length);

    if (col.isPk) {
      lines.push(
        `<rect x="${x + 1}" y="${rowTop + 1}" width="${width - 2}" height="${ROW_HEIGHT - 1}" fill="#172433" stroke="none"/>`
      );
    } else if (col.isFk) {
      lines.push(
        `<rect x="${x + 1}" y="${rowTop + 1}" width="${width - 2}" height="${ROW_HEIGHT - 1}" fill="#152018" stroke="none"/>`
      );
    }

    if (idx > 0) {
      lines.push(
        `<line x1="${x}" y1="${rowTop}" x2="${x + width}" y2="${rowTop}" stroke="#1e2834"/>`
      );
    }

    if (badgeText) {
      lines.push(
        `<text x="${cols.key}" y="${textY}" fill="#3d8bfd" font-size="10" font-weight="700" font-family="system-ui,sans-serif">${escapeXml(badgeText)}</text>`
      );
    }

    lines.push(
      `<text x="${cols.name}" y="${textY}" fill="#d7e2ee" font-size="12" font-family="Consolas,ui-monospace,monospace">${escapeXml(nameText)}</text>`
    );

    if (mode === "both") {
      lines.push(
        `<text x="${cols.ko}" y="${textY}" fill="#8b9cb0" font-size="11" font-family="system-ui,sans-serif">${escapeXml(col.koreanName || "")}</text>`
      );
    }

    lines.push(
      `<text x="${cols.type}" y="${textY}" fill="#9eb0c3" font-size="11" font-family="Consolas,ui-monospace,monospace" text-anchor="end">${escapeXml(typeText)}</text>`
    );
  });

  return lines.join("\n");
}

function extractEdgesSvg(flowRoot: HTMLElement): string {
  const edgeGroups = flowRoot.querySelectorAll(
    ".react-flow__edges g.react-flow__edge"
  );
  if (!edgeGroups.length) return "";

  const serializer = new XMLSerializer();
  const chunks: string[] = [];
  edgeGroups.forEach((group) => {
    group.childNodes.forEach((child) => {
      if (!(child instanceof Element)) return;
      if (child.classList.contains("er-edge-hit")) return;
      chunks.push(serializer.serializeToString(child));
    });
  });
  return chunks.join("\n");
}

export type DiagramExportInput = {
  flowRoot: HTMLElement;
  project: ErProject;
  nodes: Node[];
  nameDisplay: NameDisplayMode;
  projectName: string;
};

function buildDiagramSvg(input: DiagramExportInput): {
  svg: string;
  width: number;
  height: number;
} {
  const { flowRoot, project, nodes, nameDisplay } = input;
  const bounds = getNodesBounds(nodes);
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("내보낼 테이블이 없습니다.");
  }

  const viewX = bounds.x - EXPORT_PADDING;
  const viewY = bounds.y - EXPORT_PADDING;
  const viewW = bounds.width + EXPORT_PADDING * 2;
  const viewH = bounds.height + EXPORT_PADDING * 2;
  const positions = tablePositions(project, nodes);

  const tableSvgs = project.tables
    .map((table) => {
      const pos = positions.get(table.id) || table.position;
      return renderTableSvg(table, nameDisplay, pos.x, pos.y);
    })
    .join("\n");

  const edgeSvgs = extractEdgesSvg(flowRoot);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewW} ${viewH}" width="${Math.ceil(viewW)}" height="${Math.ceil(viewH)}">
  <rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" fill="${DEFAULT_BG}"/>
  ${edgeSvgs}
  ${tableSvgs}
</svg>`;

  return { svg, width: Math.ceil(viewW), height: Math.ceil(viewH) };
}

async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const scale = 2;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
    );
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.scale(scale, scale);
        ctx.fillStyle = DEFAULT_BG;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error("PNG 변환 실패"));
          },
          "image/png"
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG 렌더 실패"));
    };
    img.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportDiagramPng(input: DiagramExportInput): Promise<void> {
  const { svg, width, height } = buildDiagramSvg(input);
  const blob = await svgToPng(svg, width, height);
  downloadBlob(blob, `${sanitizeFilename(input.projectName)}.png`);
}

export async function exportDiagramSvg(input: DiagramExportInput): Promise<void> {
  const { svg } = buildDiagramSvg(input);
  downloadBlob(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    `${sanitizeFilename(input.projectName)}.svg`
  );
}

export async function exportDiagramPdf(input: DiagramExportInput): Promise<void> {
  const { svg, width, height } = buildDiagramSvg(input);
  const pngBlob = await svgToPng(svg, width, height);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(pngBlob);
  });

  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [width, height],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  pdf.save(`${sanitizeFilename(input.projectName)}.pdf`);
}
