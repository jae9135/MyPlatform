"use client";

import { DraggableModal } from "./DraggableModal";
import type { ErValidationItem } from "./validation";

type Props = {
  open: boolean;
  items: ErValidationItem[];
  onClose: () => void;
  onJump?: (item: ErValidationItem) => void;
};

export function ValidationDialog({ open, items, onClose, onJump }: Props) {
  const errorCount = items.filter((x) => x.severity === "error").length;

  return (
    <DraggableModal
      open={open}
      title="ER 검증 결과"
      titleId="er-validation-title"
      subtitle={
        <>
          {items.length}개 항목 · {errorCount}개 오류
          {onJump ? " · 항목 클릭 시 해당 위치로 이동" : ""}
        </>
      }
      onClose={onClose}
      className="er-validation-panel"
      width={460}
    >
      <div className="er-validation-body">
        {items.length === 0 ? (
          <div className="hint">문제가 없습니다.</div>
        ) : (
          <div className="er-validation-list">
            {items.map((it) => (
              <div
                key={it.id}
                className={`er-validation-item${onJump ? " clickable" : ""}`}
                role={onJump ? "button" : undefined}
                tabIndex={onJump ? 0 : undefined}
                onClick={onJump ? () => onJump(it) : undefined}
                onKeyDown={
                  onJump
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onJump(it);
                        }
                      }
                    : undefined
                }
              >
                <div
                  className={`er-validation-item-title${it.severity === "error" ? " error" : ""}`}
                >
                  {it.title}
                </div>
                {it.detail ? <div className="hint">{it.detail}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </DraggableModal>
  );
}
