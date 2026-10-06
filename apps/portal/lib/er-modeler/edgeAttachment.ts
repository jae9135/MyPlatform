import type { HandleSide } from "./types";

export const EDGE_ATTACH_PAD = 8;

export type Point = { x: number; y: number };

export type FlowNodeBox = {
  internals?: { positionAbsolute?: { x: number; y: number } };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

export type NodeBox = {
  top: number;
  left: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
};

export function getNodeBox(node: FlowNodeBox | undefined, nodeId?: string): NodeBox {
  const top = node?.internals?.positionAbsolute?.y ?? 0;
  const left = node?.internals?.positionAbsolute?.x ?? 0;
  let w = node?.measured?.width ?? node?.width ?? 240;
  let h = node?.measured?.height ?? node?.height ?? 80;

  if (typeof document !== "undefined" && nodeId) {
    const el = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"] .er-table-node`
    );
    if (el instanceof HTMLElement) {
      w = el.offsetWidth;
      h = el.offsetHeight;
    }
  }

  return { top, left, w, h, cx: left + w / 2, cy: top + h / 2 };
}

export function nearestSide(box: NodeBox, flowX: number, flowY: number): HandleSide {
  const dl = Math.abs(flowX - box.left);
  const dr = Math.abs(flowX - (box.left + box.w));
  const dt = Math.abs(flowY - box.top);
  const db = Math.abs(flowY - (box.top + box.h));
  const m = Math.min(dl, dr, dt, db);
  if (m === dt) return "T";
  if (m === db) return "B";
  if (m === dl) return "L";
  return "R";
}

export function nearestSideOrKeep(
  box: NodeBox,
  flowX: number,
  flowY: number,
  currentSide: HandleSide,
  lockThreshold: number
): HandleSide {
  const onCurrent =
    (currentSide === "L" && Math.abs(flowX - box.left) <= lockThreshold) ||
    (currentSide === "R" && Math.abs(flowX - (box.left + box.w)) <= lockThreshold) ||
    (currentSide === "T" && Math.abs(flowY - box.top) <= lockThreshold) ||
    (currentSide === "B" && Math.abs(flowY - (box.top + box.h)) <= lockThreshold);
  if (onCurrent) return currentSide;
  return nearestSide(box, flowX, flowY);
}

const ANCHOR_OUTSET = 1;

export function anchorOnSide(
  box: NodeBox,
  side: HandleSide | undefined,
  yOffset: number,
  xOffset: number
): Point {
  const pad = EDGE_ATTACH_PAD;
  const s = side || "R";
  if (s === "L") {
    return {
      x: box.left - ANCHOR_OUTSET,
      y: Math.max(box.top + pad, Math.min(box.top + box.h - pad, box.cy + yOffset)),
    };
  }
  if (s === "R") {
    return {
      x: box.left + box.w + ANCHOR_OUTSET,
      y: Math.max(box.top + pad, Math.min(box.top + box.h - pad, box.cy + yOffset)),
    };
  }
  if (s === "T") {
    return {
      x: Math.max(box.left + pad, Math.min(box.left + box.w - pad, box.cx + xOffset)),
      y: box.top - ANCHOR_OUTSET,
    };
  }
  return {
    x: Math.max(box.left + pad, Math.min(box.left + box.w - pad, box.cx + xOffset)),
    y: box.top + box.h + ANCHOR_OUTSET,
  };
}

/** 포인터 위치를 테이블 가장자리에 투영해 연결면·오프셋 반환 */
export function snapAttachment(
  box: NodeBox,
  flowX: number,
  flowY: number,
  currentSide?: HandleSide,
  lockThreshold = 20
): { side: HandleSide; yOffset: number; xOffset: number } {
  const side = currentSide
    ? nearestSideOrKeep(box, flowX, flowY, currentSide, lockThreshold)
    : nearestSide(box, flowX, flowY);
  const anchor = anchorOnSide(
    box,
    side,
    side === "L" || side === "R" ? flowY - box.cy : 0,
    side === "T" || side === "B" ? flowX - box.cx : 0
  );
  if (side === "L" || side === "R") {
    return { side, yOffset: anchor.y - box.cy, xOffset: 0 };
  }
  return { side, yOffset: 0, xOffset: anchor.x - box.cx };
}

export function slideRange(box: NodeBox, side: HandleSide): { a: Point; b: Point } {
  const pad = EDGE_ATTACH_PAD;
  switch (side) {
    case "T":
      return {
        a: { x: box.left + pad, y: box.top },
        b: { x: box.left + box.w - pad, y: box.top },
      };
    case "B":
      return {
        a: { x: box.left + pad, y: box.top + box.h },
        b: { x: box.left + box.w - pad, y: box.top + box.h },
      };
    case "L":
      return {
        a: { x: box.left, y: box.top + pad },
        b: { x: box.left, y: box.top + box.h - pad },
      };
    default:
      return {
        a: { x: box.left + box.w, y: box.top + pad },
        b: { x: box.left + box.w, y: box.top + box.h - pad },
      };
  }
}

export const ATTACH_SIDES: HandleSide[] = ["T", "R", "B", "L"];
