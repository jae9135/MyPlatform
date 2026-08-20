"use client";

import { useCallback, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";

import { orthogonalPoints } from "./edgeRouting";
import {
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

function snapToNodeBorder(
  node:
    | {
        internals?: { positionAbsolute?: { x: number; y: number } };
        measured?: { width?: number; height?: number };
        width?: number;
        height?: number;
      }
    | undefined,
  side: HandleSide | undefined,
  x: number,
  y: number
): Point {
  if (!node) return { x, y };
  const top = node.internals?.positionAbsolute?.y ?? 0;
  const left = node.internals?.positionAbsolute?.x ?? 0;
  const w = node.width ?? node.measured?.width ?? 240;
  const h = node.height ?? node.measured?.height ?? 80;
  const pad = 8;
  const s = side || "R";
  if (s === "L" || s === "R") {
    return {
      x,
      y: Math.max(top + pad, Math.min(top + h - pad, y)),
    };
  }
  if (s === "T") {
    return { x: Math.max(left + pad, Math.min(left + w - pad, x)), y };
  }
  return { x: Math.max(left + pad, Math.min(left + w - pad, x)), y };
}

function buildPoints(
  fromSide: HandleSide | undefined,
  toSide: HandleSide | undefined,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  layout: EdgePathLayout,
  sourceNode: ReturnType<typeof useInternalNode>,
  targetNode: ReturnType<typeof useInternalNode>
): Point[] {
  const fromLR = isLR(fromSide);
  const toLR = isLR(toSide);
  const from = snapToNodeBorder(
    sourceNode,
    fromSide,
    sx + (fromLR ? 0 : layout.fromXOffset),
    sy + (fromLR ? layout.fromYOffset : 0)
  );
  const to = snapToNodeBorder(
    targetNode,
    toSide,
    tx + (toLR ? 0 : layout.toXOffset),
    ty + (toLR ? layout.toYOffset : 0)
  );
  return orthogonalPoints(
    fromSide,
    toSide,
    from.x,
    from.y,
    to.x,
    to.y,
    layout.pathOffset
  );
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
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  style,
}: EdgeProps) {
  const d = (data || {}) as ErRelationEdgeData;
  const layout: EdgePathLayout = {
    pathOffset: d.pathOffset ?? 0,
    fromYOffset: d.fromYOffset ?? 0,
    toYOffset: d.toYOffset ?? 0,
    fromXOffset: d.fromXOffset ?? 0,
    toXOffset: d.toXOffset ?? 0,
  };
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const pts = buildPoints(
    d.fromSide,
    d.toSide,
    sourceX,
    sourceY,
    targetX,
    targetY,
    layout,
    sourceNode,
    targetNode
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

  const commitLayout = useCallback(
    (next: EdgePathLayout, persist: boolean) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id
            ? { ...e, selected: true, data: { ...(e.data as object), ...next } }
            : { ...e, selected: false }
        )
      );
      if (persist) d.onPathChange?.(id, next);
    },
    [d, id, setEdges]
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
    (event: React.PointerEvent, forcedSeg?: number) => {
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
        const next = { ...origin };
        const last = pts.length - 2;
        if (horiz) {
          if (seg === 0) next.fromYOffset = origin.fromYOffset + dy;
          else if (seg === last) next.toYOffset = origin.toYOffset + dy;
          else next.pathOffset = origin.pathOffset + dy;
        } else if (seg === 0) {
          next.fromXOffset = origin.fromXOffset + dx;
          if (isLR(d.fromSide)) next.pathOffset = origin.pathOffset + dx;
        } else if (seg === last) {
          next.toXOffset = origin.toXOffset + dx;
          if (isLR(d.toSide) && isLR(d.fromSide)) next.pathOffset = origin.pathOffset + dx;
        } else {
          next.pathOffset = origin.pathOffset + dx;
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
    ]
  );

  const onHitMove = (event: React.PointerEvent) => {
    if (event.buttons) return;
    const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const seg = pickSeg(p);
    const a = pts[seg];
    const b = pts[seg + 1] || pts[seg];
    setCursor(isHoriz(a, b) ? "ns-resize" : "ew-resize");
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
