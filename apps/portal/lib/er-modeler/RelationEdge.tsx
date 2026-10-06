"use client";

import { useCallback, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useReactFlow,
  useUpdateNodeInternals,
  type EdgeProps,
} from "@xyflow/react";

import { orthogonalPoints } from "./edgeRouting";
import {
  ATTACH_SIDES,
  anchorOnSide,
  getNodeBox,
  nearestSideOrKeep,
  slideRange,
  snapAttachment,
  type FlowNodeBox,
} from "./edgeAttachment";
import {
  EDGE_COLUMN,
  columnHandleId,
  type EdgePathLayout,
  type HandleSide,
  displayCardinality,
  normalizeCardinality,
  type RelationCardinality,
} from "./types";

export type ErRelationEdgeData = {
  relationId?: string;
  cardinality?: RelationCardinality | string;
  pathOffset?: number;
  pathOffsetV?: number;
  fromYOffset?: number;
  toYOffset?: number;
  fromXOffset?: number;
  toXOffset?: number;
  fromSide?: HandleSide;
  toSide?: HandleSide;
  showLabel?: boolean;
  isIdentifying?: boolean;
  onPathChange?: (relationId: string, layout: EdgePathLayout) => void;
  onSelect?: (relationId: string) => void;
  onOpenEdit?: (relationId: string, anchor: { x: number; y: number }) => void;
};

type Point = { x: number; y: number };

let lastEdgePointer = { id: "", t: 0, x: 0, y: 0 };

function suppressPanePan() {
  const stop = (event: Event) => {
    event.stopImmediatePropagation();
  };
  window.addEventListener("mousedown", stop, true);
  window.addEventListener("mousemove", stop, true);
  window.addEventListener("mouseup", stop, true);
  return () => {
    window.removeEventListener("mousedown", stop, true);
    window.removeEventListener("mousemove", stop, true);
    window.removeEventListener("mouseup", stop, true);
  };
}

function distToSeg(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function isHoriz(a: Point, b: Point) {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
}

function pathFromPoints(pts: Point[], radius = 6): string {
  if (pts.length < 2) return "";
  if (pts.length === 2 || Math.abs(pts[0].y - pts[1].y) < 1 && pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  }
  const parts = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const inDx = cur.x - prev.x;
    const inDy = cur.y - prev.y;
    const outDx = next.x - cur.x;
    const outDy = next.y - cur.y;
    const inLen = Math.hypot(inDx, inDy) || 1;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ix = cur.x - (inDx / inLen) * r;
    const iy = cur.y - (inDy / inLen) * r;
    const ox = cur.x + (outDx / outLen) * r;
    const oy = cur.y + (outDy / outLen) * r;
    parts.push(`L ${ix} ${iy}`);
    parts.push(`Q ${cur.x} ${cur.y} ${ox} ${oy}`);
  }
  const last = pts[pts.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}

function isLR(side?: HandleSide) {
  return side === "L" || side === "R" || !side;
}

/** 그립 드래그: 연결점만 가장자리를 따라 슬라이드 (경로 오프셋은 중간 세그먼트 드래그 전용) */
function slideEndpointOnSide(
  side: HandleSide,
  origin: EdgePathLayout,
  dx: number,
  dy: number,
  role: "from" | "to"
): Partial<EdgePathLayout> {
  if (side === "L" || side === "R") {
    if (role === "from") {
      return { fromYOffset: origin.fromYOffset + dy };
    }
    return { toYOffset: origin.toYOffset + dy };
  }
  if (role === "from") {
    return { fromXOffset: origin.fromXOffset + dx };
  }
  return { toXOffset: origin.toXOffset + dx };
}

/** T/B–T/B 구형 데이터는 pathOffset 하나만 쓰던 경우 → pathOffsetV로 이전 (렌더 시 변환 금지) */
function resolvePathOffsets(
  layout: EdgePathLayout
): { pathOffset: number; pathOffsetV: number } {
  return { pathOffset: layout.pathOffset, pathOffsetV: layout.pathOffsetV };
}

/** 경로 몸통 드래그 — 연결 유형·세그먼트에 맞는 축만 조정 */
function applyBodySegmentDrag(
  next: EdgePathLayout,
  origin: EdgePathLayout,
  fromSide: HandleSide,
  toSide: HandleSide,
  seg: number,
  segCount: number,
  horiz: boolean,
  dx: number,
  dy: number
): void {
  const fromLR = isLR(fromSide);
  const toLR = isLR(toSide);
  const bothTB = !fromLR && !toLR;
  const bothLR = fromLR && toLR;
  const lastSeg = segCount - 1;

  if (bothTB) {
    if (horiz) {
      next.pathOffsetV = origin.pathOffsetV + dy;
    } else if (seg === 0) {
      next.fromXOffset = origin.fromXOffset + dx;
    } else {
      next.toXOffset = origin.toXOffset + dx;
    }
    return;
  }

  if (bothLR) {
    if (!horiz) {
      next.pathOffset = origin.pathOffset + dx;
    } else if (seg === 0) {
      next.fromYOffset = origin.fromYOffset + dy;
    } else if (seg === lastSeg - 1) {
      next.toYOffset = origin.toYOffset + dy;
    } else {
      next.pathOffset = origin.pathOffset + dx;
    }
    return;
  }

  if (fromLR && !toLR) {
    if (!horiz) {
      next.pathOffset = origin.pathOffset + dx;
    } else if (seg === 0) {
      next.fromYOffset = origin.fromYOffset + dy;
    } else if (seg >= lastSeg - 1) {
      next.toXOffset = origin.toXOffset + dx;
      next.pathOffsetV = origin.pathOffsetV + dy;
    } else {
      next.pathOffsetV = origin.pathOffsetV + dy;
    }
    return;
  }

  if (!fromLR && toLR) {
    if (horiz) {
      if (seg >= lastSeg - 1) {
        next.toYOffset = origin.toYOffset + dy;
      } else {
        next.pathOffsetV = origin.pathOffsetV + dy;
      }
    } else if (seg === 0) {
      next.fromXOffset = origin.fromXOffset + dx;
      next.pathOffsetV = origin.pathOffsetV + dy;
    } else if (seg >= lastSeg - 1) {
      next.toYOffset = origin.toYOffset + dy;
      next.pathOffset = origin.pathOffset + dx;
    } else {
      next.pathOffset = origin.pathOffset + dx;
    }
    return;
  }

  if (horiz) {
    next.pathOffsetV = origin.pathOffsetV + dy;
  } else {
    next.pathOffset = origin.pathOffset + dx;
  }
}

function segmentDragCursor(
  fromSide: HandleSide,
  toSide: HandleSide,
  horiz: boolean
): string {
  const fromLR = isLR(fromSide);
  const toLR = isLR(toSide);
  const bothTB = !fromLR && !toLR;
  const bothLR = fromLR && toLR;
  if (bothTB) return horiz ? "ns-resize" : "ew-resize";
  if (bothLR) return horiz ? "ns-resize" : "ew-resize";
  return horiz ? "ns-resize" : "ew-resize";
}

function TableAttachmentGuides({
  node,
  nodeId,
  activeSide,
  accent,
}: {
  node: FlowNodeBox | undefined;
  nodeId?: string;
  activeSide?: HandleSide;
  accent: string;
}) {
  const box = getNodeBox(node, nodeId);
  if (!box.w || !box.h) return null;
  return (
    <g className="er-edge-attach-guides">
      {ATTACH_SIDES.map((side) => {
        const { a, b } = slideRange(box, side);
        const active = side === activeSide;
        return (
          <g key={side} className={active ? "is-active" : ""}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={accent}
              strokeWidth={active ? 3 : 1.5}
              strokeLinecap="round"
              strokeDasharray={active ? undefined : "4 4"}
              opacity={active ? 0.95 : 0.45}
            />
            <circle cx={a.x} cy={a.y} r={4} fill="#0f1419" stroke={accent} strokeWidth={1.5} opacity={active ? 1 : 0.6} />
            <circle cx={b.x} cy={b.y} r={4} fill="#0f1419" stroke={accent} strokeWidth={1.5} opacity={active ? 1 : 0.6} />
            {active ? (
              <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={5} fill={accent} opacity={0.35} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function EndpointGrip({
  cx,
  cy,
  color,
  onPointerDown,
}: {
  cx: number;
  cy: number;
  color: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <g
      className="er-edge-endpoint-grip nopan nodrag"
      style={{ cursor: "grab", touchAction: "none" }}
      onPointerDown={onPointerDown}
    >
      <circle cx={cx} cy={cy} r={14} fill="transparent" />
      <circle cx={cx} cy={cy} r={7} fill="#0f1419" stroke={color} strokeWidth={2.2} />
      <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={cx} y1={cy - 3} x2={cx} y2={cy + 3} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

function buildPoints(
  fromSide: HandleSide | undefined,
  toSide: HandleSide | undefined,
  layout: EdgePathLayout,
  sourceNode: FlowNodeBox | undefined,
  targetNode: FlowNodeBox | undefined,
  sourceId?: string,
  targetId?: string
): Point[] {
  const fs = layout.fromSide ?? fromSide ?? "R";
  const ts = layout.toSide ?? toSide ?? "L";
  const fromBox = getNodeBox(sourceNode, sourceId);
  const toBox = getNodeBox(targetNode, targetId);
  const from = anchorOnSide(fromBox, fs, layout.fromYOffset, layout.fromXOffset);
  const to = anchorOnSide(toBox, ts, layout.toYOffset, layout.toXOffset);
  const { pathOffset, pathOffsetV } = resolvePathOffsets(layout);
  return orthogonalPoints(fs, ts, from.x, from.y, to.x, to.y, pathOffset, pathOffsetV);
}

type MarkKind = "one" | "many" | "opt" | "optMany";

function tokenToMark(token: string): MarkKind {
  const t = token.trim().toUpperCase();
  if (t === "0..N" || t === "0..*" || t === "*") return "optMany";
  if (t === "0..1") return "opt";
  if (t === "N" || t === "1..N") return "many";
  return "one";
}

/** 관계명 왼쪽은 from(시작) 테이블, 오른쪽은 to(끝) 테이블 */
function endsForCard(card: string): { from: MarkKind; to: MarkKind } {
  const raw = displayCardinality(card);
  const idx = raw.indexOf(":");
  const left = idx >= 0 ? raw.slice(0, idx) : "1";
  const right = idx >= 0 ? raw.slice(idx + 1) : "1..N";
  return { from: tokenToMark(left), to: tokenToMark(right) };
}

function splitCardDisplay(card: string): [string, string] {
  const raw = displayCardinality(card);
  const idx = raw.indexOf(":");
  const left = idx >= 0 ? raw.slice(0, idx) : "1";
  const right = idx >= 0 ? raw.slice(idx + 1) : "1..N";
  return [left, right];
}

function endpointLabelAnchor(
  end: Point,
  towardPath: Point,
  inland = 20,
  perp = -14
): Point {
  const dx = towardPath.x - end.x;
  const dy = towardPath.y - end.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const px = -ty;
  const py = tx;
  return {
    x: end.x + tx * inland + px * perp,
    y: end.y + ty * inland + py * perp,
  };
}

function CardinalityMark({
  end,
  prev,
  kind,
  color,
}: {
  end: Point;
  prev: Point;
  kind: MarkKind;
  color: string;
}) {
  const stroke = 1.8;
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const px = -ty;
  const py = tx;
  const inland = (dist: number): Point => ({
    x: end.x - tx * dist,
    y: end.y - ty * dist,
  });
  const barHalf = 6;
  const barAt = (p: Point) => (
    <line
      x1={p.x + px * barHalf}
      y1={p.y + py * barHalf}
      x2={p.x - px * barHalf}
      y2={p.y - py * barHalf}
    />
  );
  const tipPad = 3;
  const r = 5;
  const foot = 10;
  const tip = inland(tipPad);
  if (kind === "one") {
    return (
      <g stroke={color} strokeWidth={stroke} strokeLinecap="round">
        {barAt(inland(tipPad + foot))}
      </g>
    );
  }
  if (kind === "many") {
    const spread = 7;
    const heel = inland(tipPad + foot);
    return (
      <g stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round">
        <line
          x1={heel.x}
          y1={heel.y}
          x2={tip.x + px * spread}
          y2={tip.y + py * spread}
        />
        <line x1={heel.x} y1={heel.y} x2={tip.x} y2={tip.y} />
        <line
          x1={heel.x}
          y1={heel.y}
          x2={tip.x - px * spread}
          y2={tip.y - py * spread}
        />
        {barAt(heel)}
      </g>
    );
  }
  if (kind === "optMany") {
    const spread = 7;
    const heel = inland(tipPad + foot);
    const circle = inland(tipPad + foot + 2 * r);
    return (
      <g stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round">
        <circle cx={circle.x} cy={circle.y} r={r} fill="#0f1419" />
        <line
          x1={heel.x}
          y1={heel.y}
          x2={tip.x + px * spread}
          y2={tip.y + py * spread}
        />
        <line x1={heel.x} y1={heel.y} x2={tip.x} y2={tip.y} />
        <line
          x1={heel.x}
          y1={heel.y}
          x2={tip.x - px * spread}
          y2={tip.y - py * spread}
        />
      </g>
    );
  }
  const circle = inland(2 * r);
  return (
    <g stroke={color} strokeWidth={stroke} strokeLinecap="round">
      {barAt(tip)}
      <circle cx={circle.x} cy={circle.y} r={r} fill="#0f1419" />
    </g>
  );
}

export function ErRelationEdge({
  id,
  source,
  target,
  data,
  selected,
  style,
}: EdgeProps) {
  const d = (data || {}) as ErRelationEdgeData;
  const layout: EdgePathLayout = {
    pathOffset: d.pathOffset ?? 0,
    pathOffsetV: d.pathOffsetV ?? 0,
    fromYOffset: d.fromYOffset ?? 0,
    toYOffset: d.toYOffset ?? 0,
    fromXOffset: d.fromXOffset ?? 0,
    toXOffset: d.toXOffset ?? 0,
    fromSide: d.fromSide,
    toSide: d.toSide,
  };
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const pts = buildPoints(
    d.fromSide,
    d.toSide,
    layout,
    sourceNode,
    targetNode,
    source,
    target
  );
  const path = pathFromPoints(pts);
  const color = selected ? "#c5dcff" : "#6b9bd1";
  const card = displayCardinality(d.cardinality || "1:1..N");
  const dashed = !d.isIdentifying;
  const marks = endsForCard(card);
  const [fromLabel, toLabel] = splitCardDisplay(card);
  const showLabel = d.showLabel !== false;
  const fromLabelPos =
    pts.length >= 2 ? endpointLabelAnchor(pts[0], pts[1]) : null;
  const toLabelPos =
    pts.length >= 2
      ? endpointLabelAnchor(pts[pts.length - 1], pts[pts.length - 2])
      : null;
  const [cursor, setCursor] = useState("move");

  const { setEdges, getZoom, screenToFlowPosition, getViewport, setViewport } =
    useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const commitLayout = useCallback(
    (next: EdgePathLayout, persist: boolean) => {
      const fromSide = next.fromSide ?? d.fromSide ?? "R";
      const toSide = next.toSide ?? d.toSide ?? "L";
      const merged: EdgePathLayout = { ...next, fromSide, toSide };
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id
            ? {
                ...e,
                selected: true,
                sourceHandle: columnHandleId(String(e.source), EDGE_COLUMN, fromSide),
                targetHandle: columnHandleId(String(e.target), EDGE_COLUMN, toSide),
                data: { ...(e.data as object), ...merged, fromSide, toSide },
              }
            : { ...e, selected: false }
        )
      );
      updateNodeInternals([source, target]);
      if (persist) d.onPathChange?.(id, merged);
    },
    [d, id, setEdges, source, target, updateNodeInternals]
  );

  const pickSeg = useCallback(
    (p: Point) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const dist = distToSeg(p.x, p.y, pts[i], pts[i + 1]);
        if (dist < bestD) {
          bestD = dist;
          best = i;
        }
      }
      return best;
    },
    [pts]
  );

  const openEdit = useCallback(
    (clientX: number, clientY: number) => {
      d.onOpenEdit?.(id, { x: clientX + 10, y: clientY + 8 });
    },
    [d, id]
  );

  const startDrag = useCallback(
    (event: React.PointerEvent, forcedSeg?: number, endpoint?: "from" | "to") => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const releasePan = suppressPanePan();
      const frozenViewport = getViewport();
      try {
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
      } catch {
        /* SVG capture is optional */
      }

      const alreadySelected = Boolean(selected);
      const now = Date.now();
      const prev = lastEdgePointer;
      const secondClick =
        prev.id === id &&
        now - prev.t < 500 &&
        Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < 16;
      lastEdgePointer = { id, t: now, x: event.clientX, y: event.clientY };

      if (alreadySelected && (event.detail >= 2 || secondClick)) {
        lastEdgePointer = { id: "", t: 0, x: 0, y: 0 };
        releasePan();
        openEdit(event.clientX, event.clientY);
        return;
      }

      d.onSelect?.(id);
      setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === id })));
      const start = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const seg = forcedSeg ?? pickSeg(start);
      const a = pts[seg];
      const b = pts[seg + 1] || pts[seg];
      const horiz = isHoriz(a, b);
      const origin = { ...layout };
      let dragging = false;

      const applyDelta = (ev: PointerEvent, persist: boolean) => {
        const zoom = getZoom() || 1;
        const dx = (ev.clientX - event.clientX) / zoom;
        const dy = (ev.clientY - event.clientY) / zoom;
        const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        const next: EdgePathLayout = { ...origin };
        const edgeLock = 24 / zoom;

        const fromSide0 = origin.fromSide ?? d.fromSide ?? "R";
        const toSide0 = origin.toSide ?? d.toSide ?? "L";
        const fromBox = getNodeBox(sourceNode, source);
        const toBox = getNodeBox(targetNode, target);

        if (endpoint === "from") {
          const newSide = nearestSideOrKeep(
            fromBox,
            flowPos.x,
            flowPos.y,
            fromSide0,
            edgeLock
          );
          next.fromSide = newSide;
          if (newSide === fromSide0) {
            Object.assign(next, slideEndpointOnSide(fromSide0, origin, dx, dy, "from"));
          } else {
            const snap = snapAttachment(fromBox, flowPos.x, flowPos.y, newSide, edgeLock);
            next.fromYOffset = snap.yOffset;
            next.fromXOffset = snap.xOffset;
            next.pathOffset = 0;
            next.pathOffsetV = 0;
          }
        } else if (endpoint === "to") {
          const newSide = nearestSideOrKeep(
            toBox,
            flowPos.x,
            flowPos.y,
            toSide0,
            edgeLock
          );
          next.toSide = newSide;
          if (newSide === toSide0) {
            Object.assign(next, slideEndpointOnSide(toSide0, origin, dx, dy, "to"));
          } else {
            const snap = snapAttachment(toBox, flowPos.x, flowPos.y, newSide, edgeLock);
            next.toYOffset = snap.yOffset;
            next.toXOffset = snap.xOffset;
            next.pathOffset = 0;
            next.pathOffsetV = 0;
          }
        } else {
          applyBodySegmentDrag(
            next,
            origin,
            fromSide0,
            toSide0,
            seg,
            pts.length - 1,
            horiz,
            dx,
            dy
          );
        }
        commitLayout(next, persist);
      };

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const view = getViewport();
        if (
          view.x !== frozenViewport.x ||
          view.y !== frozenViewport.y ||
          view.zoom !== frozenViewport.zoom
        ) {
          setViewport(frozenViewport, { duration: 0 });
        }
        if (
          !dragging &&
          Math.hypot(ev.clientX - event.clientX, ev.clientY - event.clientY) < 6
        ) {
          return;
        }
        dragging = true;
        applyDelta(ev, false);
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        releasePan();
        try {
          (event.currentTarget as Element).releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        if (dragging) applyDelta(ev, true);
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
    },
    [
      commitLayout,
      d,
      getZoom,
      getViewport,
      setViewport,
      id,
      layout,
      openEdit,
      pickSeg,
      pts,
      screenToFlowPosition,
      selected,
      setEdges,
      source,
      target,
      sourceNode,
      targetNode,
    ]
  );

  const onHitMove = (event: React.PointerEvent) => {
    if (event.buttons) return;
    const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const seg = pickSeg(p);
    const a = pts[seg];
    const b = pts[seg + 1] || pts[seg];
    const fs = layout.fromSide ?? d.fromSide ?? "R";
    const ts = layout.toSide ?? d.toSide ?? "L";
    setCursor(segmentDragCursor(fs, ts, isHoriz(a, b)));
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={1}
        style={{
          stroke: color,
          strokeWidth: selected ? 3.4 : 1.5,
          strokeDasharray: dashed ? "7 5" : undefined,
          filter: selected ? "drop-shadow(0 0 3px rgba(165, 200, 255, 0.85))" : undefined,
          ...style,
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={36}
        className={selected ? "er-edge-hit nopan nodrag is-active" : "er-edge-hit nopan nodrag"}
        style={{ cursor, touchAction: "none" }}
        onPointerDown={(e) => startDrag(e)}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
        }}
        onPointerMove={onHitMove}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          openEdit(e.clientX, e.clientY);
        }}
      />
      {pts.length >= 2 ? (
        <>
          <CardinalityMark end={pts[0]} prev={pts[1]} kind={marks.from} color={color} />
          <CardinalityMark
            end={pts[pts.length - 1]}
            prev={pts[pts.length - 2]}
            kind={marks.to}
            color={color}
          />
        </>
      ) : null}
      {selected ? (
        <>
          <TableAttachmentGuides
            node={sourceNode}
            nodeId={source}
            activeSide={layout.fromSide ?? d.fromSide ?? "R"}
            accent="#7eb6ff"
          />
          <TableAttachmentGuides
            node={targetNode}
            nodeId={target}
            activeSide={layout.toSide ?? d.toSide ?? "L"}
            accent="#ffb86b"
          />
          <EndpointGrip
            cx={pts[0]?.x ?? 0}
            cy={pts[0]?.y ?? 0}
            color="#7eb6ff"
            onPointerDown={(e) => startDrag(e, 0, "from")}
          />
          <EndpointGrip
            cx={pts[pts.length - 1]?.x ?? 0}
            cy={pts[pts.length - 1]?.y ?? 0}
            color="#ffb86b"
            onPointerDown={(e) => startDrag(e, pts.length - 2, "to")}
          />
        </>
      ) : null}
      {showLabel && fromLabelPos && toLabelPos ? (
        <EdgeLabelRenderer>
          <div
            className={`er-edge-end-label nodrag nopan${selected ? " is-active" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${fromLabelPos.x}px, ${fromLabelPos.y}px)`,
            }}
          >
            {fromLabel}
          </div>
          <div
            className={`er-edge-end-label nodrag nopan${selected ? " is-active" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${toLabelPos.x}px, ${toLabelPos.y}px)`,
            }}
          >
            {toLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
