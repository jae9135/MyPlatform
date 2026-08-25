"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  busy?: boolean;
  title: string;
  titleId: string;
  subtitle?: ReactNode;
  onClose: () => void;
  onCancel?: () => void;
  className?: string;
  width?: number;
  wqState?: string;
  children: ReactNode;
};

export function DraggableModal({
  open,
  busy,
  title,
  titleId,
  subtitle,
  onClose,
  onCancel,
  className = "",
  width = 420,
  wqState,
  children,
}: Props) {
  const [pos, setPos] = useState({ x: 24, y: 72 });
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    const w = Math.min(width, window.innerWidth - 24);
    setPos({
      x: Math.max(12, Math.round((window.innerWidth - w) / 2)),
      y: 72,
    });
  }, [open, width]);

  const onHeaderPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        sx: event.clientX,
        sy: event.clientY,
        px: pos.x,
        py: pos.y,
      };
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        setPos({
          x: Math.max(8, d.px + (ev.clientX - d.sx)),
          y: Math.max(8, d.py + (ev.clientY - d.sy)),
        });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pos.x, pos.y]
  );

  if (!open) return null;

  return (
    <div
      className="er-modal-backdrop er-modal-backdrop-draggable"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={`er-modal er-draggable-modal ${className}`.trim()}
        role="dialog"
        aria-labelledby={titleId}
        {...(wqState ? { "data-wq-state": wqState } : {})}
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          width: `min(${width}px, calc(100vw - 24px))`,
          margin: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="er-modal-head er-modal-drag-handle">
          <div className="er-modal-drag-title" onPointerDown={onHeaderPointerDown}>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <div className="hint">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            className="btn ghost er-btn-sm"
            onClick={() => {
              if (busy) onCancel?.();
              onClose();
            }}
          >
            {busy ? "취소" : "닫기"}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
