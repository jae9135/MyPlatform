import type { Holiday } from "./types";

/** 한국 공휴일·대체공휴일 (2025–2028). 프로젝트 기간에 해당하는 날짜만 합칩니다. */
const KR_HOLIDAYS: Holiday[] = [
  { date: "2025-01-01", name: "신정" },
  { date: "2025-01-28", name: "설날 연휴" },
  { date: "2025-01-29", name: "설날" },
  { date: "2025-01-30", name: "설날 연휴" },
  { date: "2025-03-01", name: "삼일절" },
  { date: "2025-03-03", name: "삼일절 대체공휴일" },
  { date: "2025-05-05", name: "어린이날·석가탄신일" },
  { date: "2025-05-06", name: "어린이날 대체공휴일" },
  { date: "2025-06-06", name: "현충일" },
  { date: "2025-08-15", name: "광복절" },
  { date: "2025-10-03", name: "개천절" },
  { date: "2025-10-05", name: "추석 연휴" },
  { date: "2025-10-06", name: "추석" },
  { date: "2025-10-07", name: "추석 연휴" },
  { date: "2025-10-08", name: "추석 대체공휴일" },
  { date: "2025-10-09", name: "한글날" },
  { date: "2025-12-25", name: "크리스마스" },

  { date: "2026-01-01", name: "신정" },
  { date: "2026-02-16", name: "설날 연휴" },
  { date: "2026-02-17", name: "설날" },
  { date: "2026-02-18", name: "설날 연휴" },
  { date: "2026-03-01", name: "삼일절" },
  { date: "2026-03-02", name: "삼일절 대체공휴일" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-05-24", name: "석가탄신일" },
  { date: "2026-05-25", name: "석가탄신일 대체공휴일" },
  { date: "2026-06-06", name: "현충일" },
  { date: "2026-08-15", name: "광복절" },
  { date: "2026-08-17", name: "광복절 대체공휴일" },
  { date: "2026-09-24", name: "추석 연휴" },
  { date: "2026-09-25", name: "추석" },
  { date: "2026-09-26", name: "추석 연휴" },
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "크리스마스" },

  { date: "2027-01-01", name: "신정" },
  { date: "2027-02-06", name: "설날" },
  { date: "2027-02-07", name: "설날 연휴" },
  { date: "2027-02-08", name: "설날 연휴" },
  { date: "2027-02-09", name: "설날 대체공휴일" },
  { date: "2027-03-01", name: "삼일절" },
  { date: "2027-05-05", name: "어린이날" },
  { date: "2027-05-13", name: "석가탄신일" },
  { date: "2027-06-06", name: "현충일" },
  { date: "2027-08-15", name: "광복절" },
  { date: "2027-08-16", name: "광복절 대체공휴일" },
  { date: "2027-09-14", name: "추석 연휴" },
  { date: "2027-09-15", name: "추석" },
  { date: "2027-09-16", name: "추석 연휴" },
  { date: "2027-10-03", name: "개천절" },
  { date: "2027-10-04", name: "개천절 대체공휴일" },
  { date: "2027-10-09", name: "한글날" },
  { date: "2027-10-11", name: "한글날 대체공휴일" },
  { date: "2027-12-25", name: "크리스마스" },
  { date: "2027-12-27", name: "크리스마스 대체공휴일" },

  { date: "2028-01-01", name: "신정" },
  { date: "2028-01-26", name: "설날 연휴" },
  { date: "2028-01-27", name: "설날" },
  { date: "2028-01-28", name: "설날 연휴" },
  { date: "2028-03-01", name: "삼일절" },
  { date: "2028-05-02", name: "석가탄신일" },
  { date: "2028-05-05", name: "어린이날" },
  { date: "2028-06-06", name: "현충일" },
  { date: "2028-08-15", name: "광복절" },
  { date: "2028-10-02", name: "추석 연휴" },
  { date: "2028-10-03", name: "개천절·추석" },
  { date: "2028-10-04", name: "추석 연휴" },
  { date: "2028-10-05", name: "추석 대체공휴일" },
  { date: "2028-10-09", name: "한글날" },
  { date: "2028-12-25", name: "크리스마스" },
];

export function koreanHolidaysInRange(start: string, end: string): Holiday[] {
  const from = start || "0000-01-01";
  const to = end || "9999-12-31";
  return KR_HOLIDAYS.filter((h) => h.date >= from && h.date <= to);
}

export function mergeHolidays(current: Holiday[], extra: Holiday[]): Holiday[] {
  const byDate = new Map<string, Holiday>();
  for (const h of current) {
    if (h.date) byDate.set(h.date, h);
  }
  for (const h of extra) {
    if (h.date && !byDate.has(h.date)) byDate.set(h.date, h);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
