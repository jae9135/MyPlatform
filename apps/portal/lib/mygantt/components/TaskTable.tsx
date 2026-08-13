import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { ComputedTask, ProjectTotals, Task } from '../types';

interface Props {
  tasks: Task[];
  computed: ComputedTask[];
  totals: ProjectTotals;
  projectStartDate: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onAdd: () => void;
  onAddChild: () => void;
  onDelete: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  scrollRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  readOnly?: boolean;
}

const HEADERS = [
  'WBS',
  'TASK',
  'LEAD',
  '계획START',
  '계획END',
  '실제START',
  '실제END',
  'DAYS',
  'WORK',
  'M/D',
  '총일수',
  '계획공정율',
  '실제공정율',
  '비중',
  '계획실적',
  '실행실적',
  '공정율',
  '산출물',
] as const;

const COL_WIDTH_KEY = 'mygantt.colWidths.v2';
const DEFAULT_WIDTHS = [
  70, 200, 90, 120, 120, 120, 120, 52, 52, 48, 56, 72, 72, 56, 64, 64, 56, 130,
];
const MIN_WIDTHS = [
  48, 100, 60, 90, 90, 90, 90, 40, 40, 36, 44, 56, 56, 44, 48, 48, 44, 80,
];

function loadColWidths(): number[] {
  try {
    const raw = localStorage.getItem(COL_WIDTH_KEY);
    if (!raw) return [...DEFAULT_WIDTHS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_WIDTHS.length) {
      return [...DEFAULT_WIDTHS];
    }
    return parsed.map((w, i) => {
      const n = Number(w);
      if (!Number.isFinite(n)) return DEFAULT_WIDTHS[i];
      return Math.max(MIN_WIDTHS[i], Math.round(n));
    });
  } catch {
    return [...DEFAULT_WIDTHS];
  }
}

function fmtPct01(v: number | null): string {
  if (v == null) return '';
  return `${(v * 100).toFixed(2)}%`;
}

function fmtNum(v: number | null | undefined, d = 2): string {
  if (v == null || Number.isNaN(v)) return '';
  return v.toFixed(d);
}

const PRINT_KEEP = new Set([0, 1, 14]);

function printColClass(index: number): string {
  return PRINT_KEEP.has(index) ? "pc-keep" : "";
}

function moveFocusDown(from: HTMLInputElement, col: string) {
  const row = from.closest(".tg-row");
  const body = row?.parentElement;
  if (!row || !body) return;
  const rows = Array.from(body.querySelectorAll(":scope > .tg-row"));
  const idx = rows.indexOf(row);
  for (let i = idx + 1; i < rows.length; i++) {
    const next = rows[i].querySelector(`[data-nav="${col}"]`);
    if (next instanceof HTMLInputElement && !next.disabled) {
      next.focus();
      if (next.type !== "date") {
        next.select();
      }
      return;
    }
  }
}

function onGridEnter(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  const col = t.getAttribute("data-nav");
  if (!col) return;
  e.preventDefault();
  t.blur();
  requestAnimationFrame(() => moveFocusDown(t, col));
}

function Cell({
  children,
  className = '',
  align = 'left',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <div className={`tg-cell tg-${align} ${className}`.trim()}>{children}</div>
  );
}

function DateCell({
  isParent,
  value,
  min,
  onChange,
  readOnly,
  nav,
}: {
  isParent: boolean;
  value: string | null;
  min?: string;
  onChange: (v: string | null) => void;
  readOnly?: boolean;
  nav?: string;
}) {
  if (isParent || readOnly) {
    return <span className="ro">{value ?? ''}</span>;
  }
  return (
    <input
      type="date"
      data-nav={nav}
      min={min}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

interface TaskRowProps {
  task: Task;
  computed: ComputedTask;
  selected: boolean;
  gridTemplate: string;
  projectStartDate: string;
  onSelect: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  readOnly?: boolean;
}

/** Text fields stay local until blur — avoids full project recompute per keystroke. */
const TaskRow = memo(function TaskRow({
  task,
  computed: c,
  selected,
  gridTemplate,
  projectStartDate,
  onSelect,
  onUpdateTask,
  readOnly,
}: TaskRowProps) {
  const [name, setName] = useState(task.name);
  const [lead, setLead] = useState(task.lead);
  const [deliverable, setDeliverable] = useState(task.deliverable);

  useEffect(() => setName(task.name), [task.name]);
  useEffect(() => setLead(task.lead), [task.lead]);
  useEffect(() => setDeliverable(task.deliverable), [task.deliverable]);

  const commitText = useCallback(
    (patch: Partial<Task>) => {
      onUpdateTask(task.id, patch);
    },
    [onUpdateTask, task.id],
  );

  const levelClass = `tg-level-${Math.min(Math.max(0, c.level), 5)}`;

  return (
    <div
      className={[
        'tg-row',
        selected ? 'selected' : '',
        c.isParent ? 'parent-row' : 'leaf-row',
        levelClass,
      ].join(' ')}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={() => onSelect(task.id)}
    >
      <Cell align="left" className="tg-wbs pc-keep">
        {c.wbs}
      </Cell>
      <Cell align="left" className="tg-task pc-keep">
        <input
          data-nav="name"
          style={{ paddingLeft: `${8 + c.level * 16}px` }}
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== task.name) commitText({ name });
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </Cell>
      <Cell align="center">
        <input
          data-nav="lead"
          value={lead}
          disabled={c.isParent || readOnly}
          onChange={(e) => setLead(e.target.value)}
          onBlur={() => {
            if (lead !== task.lead) commitText({ lead });
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </Cell>
      <Cell align="center">
        <DateCell
          isParent={c.isParent}
          value={c.isParent ? c.planStart : task.planStart}
          min={projectStartDate}
          readOnly={readOnly}
          nav="planStart"
          onChange={(v) => onUpdateTask(task.id, { planStart: v })}
        />
      </Cell>
      <Cell align="center">
        <DateCell
          isParent={c.isParent}
          value={c.isParent ? c.planEnd : task.planEnd}
          min={task.planStart ?? projectStartDate}
          readOnly={readOnly}
          nav="planEnd"
          onChange={(v) => onUpdateTask(task.id, { planEnd: v })}
        />
      </Cell>
      <Cell align="center">
        <DateCell
          isParent={c.isParent}
          value={c.isParent ? c.actualStart : task.actualStart}
          min={projectStartDate}
          readOnly={readOnly}
          nav="actualStart"
          onChange={(v) => onUpdateTask(task.id, { actualStart: v })}
        />
      </Cell>
      <Cell align="center">
        <DateCell
          isParent={c.isParent}
          value={c.isParent ? c.actualEnd : task.actualEnd}
          min={task.actualStart ?? projectStartDate}
          readOnly={readOnly}
          nav="actualEnd"
          onChange={(v) => onUpdateTask(task.id, { actualEnd: v })}
        />
      </Cell>
      <Cell align="right" className="ro">
        {c.days ?? ''}
      </Cell>
      <Cell align="right" className="ro">
        {c.workDays ?? ''}
      </Cell>
      <Cell align="right" className="ro">
        {c.isParent ? (
          fmtNum(c.manDay, 1)
        ) : (
          <input
            className="tg-num-input"
            data-nav="manDay"
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            disabled={readOnly}
            value={task.manDay}
            onChange={(e) => {
              const n = e.target.value === '' ? 0 : Number(e.target.value);
              onUpdateTask(task.id, { manDay: Number.isNaN(n) ? 0 : n });
            }}
            onBlur={() => {
              onUpdateTask(task.id, {
                manDay: Math.round((task.manDay || 0) * 10) / 10,
              });
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </Cell>
      <Cell align="right" className="ro">
        {fmtNum(c.totalDays, 1)}
      </Cell>
      <Cell align="right" className="ro">
        {fmtPct01(c.planPct)}
      </Cell>
      <Cell align="right" className="ro">
        {c.isParent ? (
          ''
        ) : (
          <span className="tg-pct-edit">
            <input
              className="tg-num-input"
              data-nav="actualPct"
              type="number"
              inputMode="decimal"
              step={0.01}
              min={0}
              max={100}
              disabled={readOnly}
              value={Number(((task.actualPct || 0) * 100).toFixed(2))}
              onChange={(e) => {
                const n = e.target.value === '' ? 0 : Number(e.target.value);
                if (Number.isNaN(n)) return;
                onUpdateTask(task.id, {
                  actualPct: Math.min(1, Math.max(0, n / 100)),
                });
              }}
              onBlur={() => {
                onUpdateTask(task.id, {
                  actualPct: Math.min(
                    1,
                    Math.max(0, Math.round((task.actualPct || 0) * 10000) / 10000),
                  ),
                });
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="tg-pct-suffix">%</span>
          </span>
        )}
      </Cell>
      <Cell align="right" className="ro">
        {fmtNum(c.weight, 2)}
      </Cell>
      <Cell align="right" className="ro pc-keep">
        {fmtNum(c.planActual, 2)}
      </Cell>
      <Cell align="right" className="ro">
        {fmtNum(c.execActual, 2)}
      </Cell>
      <Cell align="right" className="ro">
        {fmtNum(c.progressRate, 2)}
      </Cell>
      <Cell align="center">
        <input
          data-nav="deliverable"
          value={deliverable}
          disabled={readOnly}
          onChange={(e) => setDeliverable(e.target.value)}
          onBlur={() => {
            if (deliverable !== task.deliverable) {
              commitText({ deliverable });
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </Cell>
    </div>
  );
});

export function TaskTable({
  tasks,
  computed,
  totals,
  projectStartDate,
  selectedId,
  onSelect,
  onUpdateTask,
  onAdd,
  onAddChild,
  onDelete,
  onIndent,
  onOutdent,
  onMoveUp,
  onMoveDown,
  scrollRef,
  onScroll,
  readOnly,
}: Props) {
  const [colWidths, setColWidths] = useState(loadColWidths);
  const dragRef = useRef<{ index: number; startX: number; startW: number } | null>(
    null,
  );

  const gridTemplate = useMemo(
    () => colWidths.map((w) => `${w}px`).join(' '),
    [colWidths],
  );

  useEffect(() => {
    localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(colWidths));
  }, [colWidths]);

  const onResizePointerDown = useCallback(
    (index: number, e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        index,
        startX: e.clientX,
        startW: colWidths[index],
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.classList.add('is-col-resizing');
    },
    [colWidths],
  );

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    const next = Math.max(MIN_WIDTHS[drag.index], Math.round(drag.startW + delta));
    setColWidths((prev) => {
      if (prev[drag.index] === next) return prev;
      const copy = [...prev];
      copy[drag.index] = next;
      return copy;
    });
  }, []);

  const onResizePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.classList.remove('is-col-resizing');
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const selectRow = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  return (
    <div className="task-pane">
      <div className="toolbar">
        <button type="button" className="btn" onClick={onAdd} disabled={readOnly}>
          행 추가
        </button>
        <button type="button" className="btn" onClick={onAddChild} disabled={readOnly || !selectedId}>
          하위 추가
        </button>
        <button type="button" className="btn" onClick={onIndent} disabled={readOnly || !selectedId}>
          Indent
        </button>
        <button type="button" className="btn" onClick={onOutdent} disabled={readOnly || !selectedId}>
          Outdent
        </button>
        <button type="button" className="btn" onClick={onMoveUp} disabled={readOnly || !selectedId}>
          ↑
        </button>
        <button type="button" className="btn" onClick={onMoveDown} disabled={readOnly || !selectedId}>
          ↓
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={onDelete}
          disabled={readOnly || !selectedId}
        >
          삭제
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setColWidths([...DEFAULT_WIDTHS])}
          title="컬럼 너비 초기화"
        >
          열너비 초기화
        </button>
      </div>

      <div className="table-scroll" ref={scrollRef} onScroll={onScroll} onKeyDown={onGridEnter}>
        <div className="task-grid" style={{ ['--tg-cols' as string]: gridTemplate }}>
          <div className="tg-head">
            <div className="tg-month-spacer" aria-hidden />
            <div className="tg-row tg-header-row">
              {HEADERS.map((h, i) => (
                <div key={h} className={`tg-cell tg-center tg-header ${printColClass(i)}`}>
                  <span className="tg-header-label">{h}</span>
                  <div
                    className="tg-col-resizer"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`${h} 열 너비 조절`}
                    onPointerDown={(e) => onResizePointerDown(i, e)}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                    onPointerCancel={onResizePointerUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setColWidths((prev) => {
                        const copy = [...prev];
                        copy[i] = DEFAULT_WIDTHS[i];
                        return copy;
                      });
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="tg-row tg-totals-row" style={{ gridTemplateColumns: gridTemplate }}>
              <Cell align="left" className="pc-keep">계</Cell>
              <Cell align="left" className="pc-keep">합계</Cell>
              <Cell align="center" />
              <Cell align="center">{totals.planStart ?? ''}</Cell>
              <Cell align="center">{totals.planEnd ?? ''}</Cell>
              <Cell align="center">{totals.actualStart ?? ''}</Cell>
              <Cell align="center">{totals.actualEnd ?? ''}</Cell>
              <Cell align="right" />
              <Cell align="right">{fmtNum(totals.workDays, 0)}</Cell>
              <Cell align="right">{fmtNum(totals.manDay, 1)}</Cell>
              <Cell align="right">{fmtNum(totals.totalDays, 1)}</Cell>
              <Cell align="right" />
              <Cell align="right" />
              <Cell align="right">{fmtNum(totals.weight, 2)}</Cell>
              <Cell align="right" className="pc-keep">{fmtNum(totals.planActual, 2)}</Cell>
              <Cell align="right">{fmtNum(totals.execActual, 2)}</Cell>
              <Cell align="right">{fmtNum(totals.progressRate, 2)}</Cell>
              <Cell align="center" />
            </div>
          </div>

          <div className="tg-body">
            {computed.map((c, i) => {
              const t = tasks[i];
              if (!t) return null;
              return (
                <TaskRow
                  key={t.id}
                  task={t}
                  computed={c}
                  selected={t.id === selectedId}
                  gridTemplate={gridTemplate}
                  projectStartDate={projectStartDate}
                  onSelect={selectRow}
                  onUpdateTask={onUpdateTask}
                  readOnly={readOnly}
                />
              );
            })}
            {computed.length === 0 && (
              <div className="tg-empty">행 추가 또는 엑셀 가져오기로 시작하세요.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
