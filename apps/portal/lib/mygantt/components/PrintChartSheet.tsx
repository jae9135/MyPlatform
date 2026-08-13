import { useMemo } from "react";
import type { ComputedTask, Project, ProjectTotals } from "../types";
import { parseIso } from "../types";
import { addDays, timelineStartDate } from "../networkDays";

interface Props {
  project: Project;
  computed: ComputedTask[];
  totals: ProjectTotals;
  dayCount: number;
}

function donePct(c: ComputedTask): number {
  if (c.isParent) {
    return c.weight ? Math.min(1, Math.max(0, c.execActual / c.weight)) : 0;
  }
  return Math.min(1, Math.max(0, c.actualPct ?? 0));
}

function barPct(
  start: Date,
  dayCount: number,
  startIso: string | null,
  endIso: string | null,
): { left: string; width: string } | null {
  if (!startIso || !endIso || dayCount <= 0) return null;
  const s = parseIso(startIso);
  const e = parseIso(endIso);
  const offset = Math.round((s.getTime() - start.getTime()) / 86400000);
  const len = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (len <= 0) return null;
  return {
    left: `${(offset / dayCount) * 100}%`,
    width: `${(len / dayCount) * 100}%`,
  };
}

export function PrintChartSheet({
  project,
  computed,
  totals,
  dayCount,
}: Props) {
  const start = useMemo(
    () => timelineStartDate(project.startDate, project.displayWeek),
    [project.startDate, project.displayWeek],
  );
  const baseMonday = useMemo(
    () => timelineStartDate(project.startDate, 1),
    [project.startDate],
  );
  const weeks = useMemo(() => {
    const marks: { left: string; label: string }[] = [];
    for (let i = 0; i < dayCount; i += 7) {
      const d = addDays(start, i);
      const weekNum =
        Math.floor((d.getTime() - baseMonday.getTime()) / (7 * 86400000)) + 1;
      marks.push({ left: `${(i / Math.max(1, dayCount)) * 100}%`, label: `W${weekNum}` });
    }
    return marks;
  }, [start, baseMonday, dayCount]);

  const months = useMemo(() => {
    const spans: { key: string; left: string; width: string; label: string }[] = [];
    if (dayCount <= 0) return spans;
    let year = start.getFullYear();
    let month = start.getMonth();
    let from = 0;
    const flush = (y: number, m: number, i0: number, i1: number) => {
      const n = i1 - i0;
      const pct = n / dayCount;
      spans.push({
        key: `${y}-${m}-${i0}`,
        left: `${(i0 / dayCount) * 100}%`,
        width: `${pct * 100}%`,
        label: pct >= 0.08 ? `${y}년 ${m + 1}월` : `${m + 1}월`,
      });
    };
    for (let i = 0; i < dayCount; i++) {
      const d = addDays(start, i);
      if (d.getFullYear() !== year || d.getMonth() !== month) {
        flush(year, month, from, i);
        year = d.getFullYear();
        month = d.getMonth();
        from = i;
      }
    }
    flush(year, month, from, dayCount);
    return spans;
  }, [start, dayCount]);

  return (
    <table className="print-chart-sheet" aria-hidden>
      <thead>
        <tr>
          <th className="pcs-wbs">WBS</th>
          <th className="pcs-task">TASK</th>
          <th className="pcs-pa">계획실적</th>
          <th className="pcs-gantt">
            <div className="pcs-gantt-head pcs-gantt-months">
              {months.map((m) => (
                <span key={m.key} style={{ left: m.left, width: m.width }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="pcs-gantt-head">
              {weeks.map((w) => (
                <span key={w.label + w.left} style={{ left: w.left }}>
                  {w.label}
                </span>
              ))}
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="pcs-totals">
          <td>계</td>
          <td>합계</td>
          <td>{totals.planActual.toFixed(2)}</td>
          <td />
        </tr>
        {computed.map((c) => {
          const pct = donePct(c);
          const plan = barPct(start, dayCount, c.planStart, c.planEnd);
          return (
            <tr
              key={c.id}
              className={`pcs-row pcs-level-${Math.min(Math.max(0, c.level), 5)} ${c.isParent ? "parent" : "leaf"}`}
            >
              <td className="pcs-wbs">{c.wbs}</td>
              <td className="pcs-task" style={{ paddingLeft: 6 + c.level * 10 }}>
                {c.name}
              </td>
              <td className="pcs-pa">{c.planActual.toFixed(2)}</td>
              <td className="pcs-gantt">
                {plan && (
                  <div
                    className={[
                      "pcs-bar",
                      c.isParent ? "parent" : "leaf",
                      pct >= 0.999 ? "done" : "",
                    ].join(" ")}
                    style={plan}
                  >
                    {pct > 0 && (
                      <span
                        className="pcs-bar-fill"
                        style={{ width: `${Math.min(100, pct * 100)}%` }}
                      />
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
