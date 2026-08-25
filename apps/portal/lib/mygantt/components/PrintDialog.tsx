export type PrintMode = "table" | "chart";

interface Props {
  onPick: (mode: PrintMode) => void;
  onClose: () => void;
}

export function PrintDialog({ onPick, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal print-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="print-title"
        data-wq-state="print_dialog"
      >
        <div className="modal-header">
          <h2 id="print-title">인쇄</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="modal-hint">
          미리보기에서 <strong>세로/가로</strong>를 바꾸면 용지 너비에 맞춰 표가 늘어납니다.
          배경 그래픽도 켜 주세요.
        </p>
        <div className="print-choices">
          <button type="button" className="print-choice" onClick={() => onPick("table")}>
            <strong>표만</strong>
            <span>전체 컬럼을 용지 너비에 맞춥니다. 간트는 넣지 않습니다. 가로는 더 넓게, 세로는 한 장에 가깝게 나옵니다.</span>
          </button>
          <button type="button" className="print-choice" onClick={() => onPick("chart")}>
            <strong>표+간트</strong>
            <span>WBS, TASK, 계획실적과 막대를 한 행으로 묶습니다. 페이지가 넘어가도 그래프가 같이 따라갑니다.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
