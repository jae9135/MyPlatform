import { parseIso } from './types';

/** Excel WEEKDAY(date, 1): Sunday=1 … Saturday=7 */
export function excelWeekday(date: Date): number {
  return date.getDay() + 1;
}

/**
 * Excel NETWORKDAYS(start, end, holidays)
 * Counts Mon–Fri between start and end inclusive, excluding holiday dates.
 */
export function networkDays(
  startIso: string,
  endIso: string,
  holidayIsos: string[],
): number {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let from = start;
  let to = end;
  let sign = 1;
  if (from > to) {
    from = end;
    to = start;
    sign = -1;
  }

  const holidaySet = new Set(holidayIsos);

  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const dow = cur.getDay(); // 0 Sun … 6 Sat
    if (dow !== 0 && dow !== 6) {
      const iso = toIso(cur);
      if (!holidaySet.has(iso)) count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return sign * count;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Calendar days inclusive */
export function calendarDays(startIso: string, endIso: string): number {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

/**
 * Excel: Q6 = C4 - WEEKDAY(C4,1) + 2 + 7*(K4-1)
 * Timeline start (typically Monday of the week containing project start, shifted by displayWeek).
 */
export function timelineStartDate(projectStartIso: string, displayWeek: number): Date {
  const c4 = parseIso(projectStartIso);
  const wd = excelWeekday(c4);
  const q6 = new Date(c4);
  q6.setDate(c4.getDate() - wd + 2 + 7 * (displayWeek - 1));
  return q6;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function dateToIso(d: Date): string {
  return toIso(d);
}
