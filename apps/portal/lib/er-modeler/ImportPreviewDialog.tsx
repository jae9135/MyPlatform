"use client";

import { DraggableModal } from "./DraggableModal";
import type { ImportPreview } from "./importPreview";

type Props = {
  open: boolean;
  preview: ImportPreview | null;
  sourceLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ImportPreviewDialog({
  open,
  preview,
  sourceLabel,
  onConfirm,
  onCancel,
}: Props) {
  if (!preview) return null;

  const isReplace =
    preview.mode === "replace" ||
    (preview.mode === "append" && preview.currentTableCount === 0);

  return (
    <DraggableModal
      open={open}
      title="가져오기 미리보기"
      titleId="er-import-preview-title"
      subtitle={sourceLabel}
      onClose={onCancel}
      className="er-import-preview-modal"
      width={480}
    >
      <div className="er-import-preview-body">
        {isReplace ? (
          <>
            <p className="er-import-preview-summary">
              현재 ERD{" "}
              <strong>
                {preview.currentTableCount}개 테이블 · {preview.currentRelationCount}개
                관계
              </strong>
              를 파일 내용으로 <strong>교체</strong>합니다.
            </p>
            <ul className="er-import-preview-stats">
              <li>
                적용될 테이블: <strong>{preview.incomingTableCount}개</strong>
              </li>
              <li>
                적용될 관계: <strong>{preview.incomingRelationCount}개</strong>
              </li>
            </ul>
            {preview.toAdd.length > 0 ? (
              <div className="er-import-preview-section">
                <h4>테이블</h4>
                <p className="hint er-import-preview-tags">
                  {preview.toAdd.join(", ")}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="er-import-preview-summary">
              파일 <strong>{preview.incomingTableCount}개 테이블</strong>,{" "}
              <strong>{preview.incomingRelationCount}개 관계</strong>를 기존 ERD에
              더합니다.
            </p>
            <ul className="er-import-preview-stats">
              <li className="add">
                추가: 테이블 <strong>{preview.toAdd.length}개</strong>, 관계{" "}
                <strong>{preview.relationsToAdd}개</strong>
              </li>
              {preview.toSkip.length > 0 ? (
                <li className="skip">
                  건너뜀(동일 이름): 테이블{" "}
                  <strong>{preview.toSkip.length}개</strong>
                  {preview.relationsToSkip > 0
                    ? `, 관계 ${preview.relationsToSkip}개`
                    : ""}
                </li>
              ) : null}
            </ul>
            {preview.toAdd.length > 0 ? (
              <div className="er-import-preview-section">
                <h4>추가될 테이블</h4>
                <p className="hint er-import-preview-tags">{preview.toAdd.join(", ")}</p>
              </div>
            ) : null}
            {preview.toSkip.length > 0 ? (
              <div className="er-import-preview-section">
                <h4>건너뛸 테이블 (이름 중복)</h4>
                <p className="hint er-import-preview-tags skip">
                  {preview.toSkip.join(", ")}
                </p>
              </div>
            ) : null}
            {preview.toAdd.length === 0 ? (
              <p className="er-import-preview-warn">
                추가될 테이블이 없습니다. 「신규로 가져오기」를 선택하거나 Excel
                테이블명을 변경하세요.
              </p>
            ) : null}
          </>
        )}
      </div>
      <div className="er-modal-foot">
        <button type="button" className="btn ghost er-btn-sm" onClick={onCancel}>
          취소
        </button>
        <button
          type="button"
          className="btn er-btn-sm"
          onClick={onConfirm}
          disabled={!isReplace && preview.toAdd.length === 0 && preview.relationsToAdd === 0}
        >
          적용
        </button>
      </div>
    </DraggableModal>
  );
}
