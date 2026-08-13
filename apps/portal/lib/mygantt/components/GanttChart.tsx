import {
  memo,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { ComputedTask, Holiday } from "../types";
import {
  dateToIso,
  timelineStartDate,
  addDays,
  excelWeekday,
} from "../networkDays";
import { formatIso, parseIso } from "../types";

const DAY_W = 22;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

interface Props {
  projectStart: string;
  projectEnd: string;
  asOfDate: string;
  displayWeek: number;
  holidays: Holiday[];
  computed: ComputedTask[];
  dayCount: number;
  scrollRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  readOnly?: boolean;
  onMovePlan?: (id: string, planStart: string, planEnd: string) => void;
}

function barStyle(
  start: Date,
  startIso: string | null,
  endIso: string | null,
): CSSProperties | null {
  if (!startIso || !endIso) return null;
  const s = parseIso(startIso);
  const e = parseIso(endIso);
  const offset = Math.round((s.getTime() - start.getTime()) / 86400000);
  const len = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (len <= 0) return null;
  return {
    left: offset * DAY_W,
    width: Math.max(len * DAY_W - 2, 4),
  };
}

function shiftIso(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return formatIso(d);
}

export const GanttChart = memo(function GanttChart({
  projectStart,
  projectEnd,
  asOfDate,
  displayWeek,
  holidays,
  computed,
  dayCount,
  scrollRef,
  onScroll,
  readOnly,
  onMovePlan,
}: Props) {
  const holidaySet = useMemo(
    () => new Set(holidays.map((h) => h.date)),
    [holidays],
  );

  const start = useMemo(
    () => timelineStartDate(projectStart, displayWeek),
    [projectStart, displayWeek],
  );

  const days = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(start, i));
  }, [start, dayCount]);

  const baseMonday = useMemo(
    () => timelineStartDate(projectStart, 1),
    [projectStart],
  );

  const todayIso = asOfDate || dateToIso(new Date());
  const todayIndex = useMemo(
    () => days.findIndex((d) => dateToIso(d) === todayIso),
    [days, todayIso],
  );

  const rowGridBg = useMemo(() => {
    if (dayCount <= 0) return undefined;
    const stops: string[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = days[i];
      const iso = dateToIso(d);
      const wd = excelWeekday(d);
      const nonwork = wd === 1 || wd === 7 || holidaySet.has(iso);
      const color = nonwork ? "var(--nonwork)" : "transparent";
      const a = (i / dayCount) * 100;
      const b = ((i + 1) / dayCount) * 100;
      stops.push(`${color} ${a}%`, `${color} ${b}%`);
    }
    return `linear-gradient(to right, ${stops.join(",")})`;
  }, [days, dayCount, holidaySet]);

  const months = useMemo(() => {
    const spans: { key: string; label: string; width: number }[] = [];
    if (days.length === 0) return spans;
    let year = days[0].getFullYear();
    let month = days[0].getMonth();
    let count = 0;
    const flush = (y: number, m: number, n: number) => {
      const width = n * DAY_W;
      spans.push({
        key: `${y}-${m}`,
        label: width >= 88 ? `${y}년 ${m + 1}월` : `${m + 1}월`,
        width,
      });
    };
    for (const d of days) {
      if (d.getFullYear() !== year || d.getMonth() !== month) {
        flush(year, month, count);
        year = d.getFullYear();
        month = d.getMonth();
        count = 1;
      } else {
        count += 1;
      }
    }
    flush(year, month, count);
    return spans;
  }, [days]);

  const projectStartIndex = useMemo(
    () => days.findIndex((d) => dateToIso(d) === projectStart),
    [days, projectStart],
  );
  const projectEndIndex = useMemo(
    () => days.findIndex((d) => dateToIso(d) === projectEnd),
    [days, projectEnd],
  );

  const bars = useMemo(
    () =>
      computed.map((c) => ({
        id: c.id,
        wbs: c.wbs,
        name: c.name,
        level: c.level,
        isParent: c.isParent,
        planStart: c.planStart,
        planEnd: c.planEnd,
        plan: barStyle(start, c.planStart, c.planEnd),
        actual: barStyle(start, c.actualStart, c.actualEnd),
        donePct: c.isParent
          ? c.weight
            ? Math.min(1, Math.max(0, c.execActual / c.weight))
            : 0
          : Math.min(1, Math.max(0, c.actualPct ?? 0)),
      })),
    [computed, start],
  );

  const drag = useRef<{
    id: string;
    startX: number;
    planStart: string;
    planEnd: string;
    lastDays: number;
  } | null>(null);

  const onBarDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    id: string,
    planStart: string | null,
    planEnd: string | null,
  ) => {
    if (readOnly || !onMovePlan || !planStart || !planEnd) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id,
      startX: e.clientX,
      planStart,
      planEnd,
      lastDays: 0,
    };
  };

  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !onMovePlan) return;
    const delta = Math.round((e.clientX - d.startX) / DAY_W);
    if (delta === d.lastDays) return;
    d.lastDays = delta;
    onMovePlan(d.id, shiftIso(d.planStart, delta), shiftIso(d.planEnd, delta));
  };

  const onBarUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="gantt-pane">
      <div className="toolbar gantt-toolbar-spacer">
        <span className="gantt-toolbar-label">
          Gantt
          {projectStart && projectEnd ? ` (${projectStart} ~ ${projectEnd})` : ""}
          {!readOnly ? " · 막대를 드래그해 계획 이동" : " · 읽기 전용"}
        </span>
      </div>
      <div className="gantt-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="gantt-inner" style={{ width: dayCount * DAY_W }}>
          {todayIndex >= 0 && (
            <div
              className="gantt-today-line"
              style={{ left: todayIndex * DAY_W + DAY_W / 2 }}
              title={`오늘 ${todayIso}`}
              aria-hidden
            />
          )}
          {projectStartIndex >= 0 && (
            <div
              className="gantt-marker-line start"
              style={{ left: projectStartIndex * DAY_W }}
              aria-hidden
            />
          )}
          {projectEndIndex >= 0 && (
            <div
              className="gantt-marker-line end"
              style={{ left: (projectEndIndex + 1) * DAY_W - 2 }}
              aria-hidden
            />
          )}
          <div className="gantt-header-months">
            {months.map((m) => (
              <div
                key={m.key}
                className="gantt-month-h"
                style={{ width: m.width }}
                title={m.label}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className="gantt-header-days">
            {days.map((d, i) => {
              const iso = dateToIso(d);
              const wd = excelWeekday(d);
              const isWeekend = wd === 1 || wd === 7;
              const isHoliday = holidaySet.has(iso);
              const isToday = iso === todayIso;
              const isProjectStart = iso === projectStart;
              const isProjectEnd = iso === projectEnd;
              const weekNum =
                Math.floor((d.getTime() - baseMonday.getTime()) / (7 * 86400000)) +
                1;
              const showWeek = i % 7 === 0;
              return (
                <div
                  key={iso}
                  className={[
                    "gantt-day-h",
                    isWeekend || isHoliday ? "nonwork" : "",
                    isToday ? "today" : "",
                    isProjectStart ? "project-start" : "",
                    isProjectEnd ? "project-end" : "",
                    showWeek ? "week-start" : "",
                  ].join(" ")}
                  style={{ width: DAY_W }}
                  title={`${iso} (W${weekNum})${isToday ? " · 오늘" : ""}${isProjectEnd ? " · 종료일" : ""}${isProjectStart ? " · 시작일" : ""}`}
                >
                  {isToday
                    ? WEEKDAYS[wd - 1]
                    : showWeek
                      ? `W${weekNum}`
                      : WEEKDAYS[wd - 1]}
                </div>
              );
            })}
          </div>
          <div className="gantt-header-dates">
            {days.map((d) => {
              const iso = dateToIso(d);
              const wd = excelWeekday(d);
              const isWeekend = wd === 1 || wd === 7;
              const isHoliday = holidaySet.has(iso);
              const isToday = iso === todayIso;
              const isProjectStart = iso === projectStart;
              const isProjectEnd = iso === projectEnd;
              return (
                <div
                  key={iso}
                  className={[
                    "gantt-date-h",
                    isWeekend || isHoliday ? "nonwork" : "",
                    isToday ? "today" : "",
                    isProjectStart ? "project-start" : "",
                    isProjectEnd ? "project-end" : "",
                  ].join(" ")}
                  style={{ width: DAY_W }}
                  title={isToday ? `오늘 ${iso}` : iso}
                >
                  {d.getDate()}
                </div>
              );
            })}
          </div>

          {bars.map((b) => (
            <div
              key={b.id}
              className={`gantt-row gantt-level-${Math.min(Math.max(0, b.level), 5)}`}
              style={
                rowGridBg
                  ? {
                      backgroundImage: `${rowGridBg}, repeating-linear-gradient(to right, transparent 0, transparent ${DAY_W - 1}px, #eee8df ${DAY_W - 1}px, #eee8df ${DAY_W}px)`,
                      backgroundSize: `${dayCount * DAY_W}px 100%`,
                    }
                  : undefined
              }
            >
              {b.plan && (
                <div
                  className={[
                    "gantt-bar",
                    b.isParent ? "parent" : "leaf",
                    b.donePct >= 0.999 ? "done" : "",
                  ].join(" ")}
                  style={b.plan}
                  title={`계획 ${b.wbs} ${b.name} · 완료 ${(b.donePct * 100).toFixed(0)}%`}
                  onPointerDown={
                    b.isParent
                      ? undefined
                      : (e) => onBarDown(e, b.id, b.planStart, b.planEnd)
                  }
                  onPointerMove={b.isParent ? undefined : onBarMove}
                  onPointerUp={b.isParent ? undefined : onBarUp}
                  onPointerCancel={b.isParent ? undefined : onBarUp}
                >
                  {b.donePct > 0 && (
                    <span
                      className="gantt-bar-fill"
                      style={{ width: `${Math.min(100, b.donePct * 100)}%` }}
                    />
                  )}
                </div>
              )}
              {b.actual && !b.isParent && (
                <div
                  className="gantt-bar actual"
                  style={b.actual}
                  title={`실제 ${b.wbs} ${b.name}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
