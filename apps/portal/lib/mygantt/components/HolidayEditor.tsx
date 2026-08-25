import type { Holiday } from '../types';

interface Props {
  holidays: Holiday[];
  onChange: (holidays: Holiday[]) => void;
  onClose: () => void;
  onFillKorean?: () => void;
  readOnly?: boolean;
}

export function HolidayEditor({
  holidays,
  onChange,
  onClose,
  onFillKorean,
  readOnly,
}: Props) {
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  function update(i: number, patch: Partial<Holiday>) {
    const next = holidays.map((h, idx) => (idx === i ? { ...h, ...patch } : h));
    onChange(next);
  }

  function remove(i: number) {
    onChange(holidays.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...holidays, { date: '', name: '' }]);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="holiday-title"
        data-wq-state="holiday_dialog"
      >
        <div className="modal-header">
          <h2 id="holiday-title">휴일목록</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="modal-hint">
          프로젝트 기간 공휴일을 입력하면 WORK DAYS·% PLAN 계산에서 제외됩니다.
        </p>
        <table className="holiday-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>공휴일</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {holidays.map((h, i) => (
              <tr key={`${h.date}-${i}`}>
                <td>
                  <input
                    type="date"
                    value={h.date}
                    disabled={readOnly}
                    onChange={(e) => update(i, { date: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={h.name}
                    disabled={readOnly}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="예: 광복절"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={readOnly}
                    onClick={() => remove(i)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <p className="empty-hint">등록된 휴일이 없습니다.</p>}
        <div className="modal-footer">
          {onFillKorean && (
            <button
              type="button"
              className="btn"
              disabled={readOnly}
              onClick={onFillKorean}
            >
              한국 공휴일 넣기
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={readOnly}
            onClick={add}
          >
            휴일 추가
          </button>
        </div>
      </div>
    </div>
  );
}
