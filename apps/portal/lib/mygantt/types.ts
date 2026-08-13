export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface Task {
  id: string;
  level: number;
  name: string;
  lead: string;
  /** 계획 시작 — leaf only, ISO YYYY-MM-DD */
  planStart: string | null;
  /** 계획 종료 — leaf only */
  planEnd: string | null;
  /** 실제 시작 — leaf only */
  actualStart: string | null;
  /** 실제 종료 — leaf only */
  actualEnd: string | null;
  /** Leaf only */
  manDay: number;
  /** Leaf only — 실제공정율 0~1 (사용자 입력) */
  actualPct: number;
  deliverable: string;
}

export interface Project {
  name: string;
  company: string;
  manager: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** 기준일(시뮬레이션용 오늘). 계획공정율·간트 오늘선에 사용 */
  asOfDate: string;
  displayWeek: number;
  holidays: Holiday[];
  tasks: Task[];
}

export interface ComputedTask {
  id: string;
  level: number;
  wbs: string;
  name: string;
  lead: string;
  isParent: boolean;
  planStart: string | null;
  planEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  days: number | null;
  workDays: number | null;
  manDay: number | null;
  totalDays: number | null;
  /** 계획공정율 0~1 */
  planPct: number | null;
  /** 실제공정율 0~1 */
  actualPct: number | null;
  weight: number;
  planActual: number;
  execActual: number;
  progressRate: number;
  deliverable: string;
}

export interface ProjectTotals {
  planStart: string | null;
  planEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  workDays: number;
  manDay: number;
  totalDays: number;
  weight: number;
  planActual: number;
  execActual: number;
  progressRate: number;
}

export function createEmptyProject(): Project {
  const today = new Date();
  const iso = formatIso(today);
  const end = new Date(today);
  end.setDate(end.getDate() + 90);
  return {
    name: '새 프로젝트',
    company: '',
    manager: '',
    startDate: iso,
    endDate: formatIso(end),
    asOfDate: iso,
    displayWeek: 1,
    holidays: [],
    tasks: [],
  };
}

export function createEmptyTask(level = 0): Task {
  return {
    id: crypto.randomUUID(),
    level,
    name: '',
    lead: '',
    planStart: null,
    planEnd: null,
    actualStart: null,
    actualEnd: null,
    manDay: 1,
    actualPct: 0,
    deliverable: '',
  };
}

export function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Migrate legacy task shape { start, end, donePct } → plan/actual */
export function normalizeTask(raw: Partial<Task> & {
  start?: string | null;
  end?: string | null;
  donePct?: number;
}): Task {
  const base = createEmptyTask(raw.level ?? 0);
  const pctRaw = raw.actualPct ?? raw.donePct;
  let actualPct = 0;
  if (typeof pctRaw === 'number' && Number.isFinite(pctRaw)) {
    // accept 0~1 ratio or 0~100 percent
    actualPct = pctRaw > 1 ? pctRaw / 100 : pctRaw;
    actualPct = Math.min(1, Math.max(0, actualPct));
  }
  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    planStart: raw.planStart ?? raw.start ?? null,
    planEnd: raw.planEnd ?? raw.end ?? null,
    actualStart: raw.actualStart ?? null,
    actualEnd: raw.actualEnd ?? null,
    manDay: raw.manDay ?? 1,
    actualPct,
    deliverable: raw.deliverable ?? '',
  };
}
