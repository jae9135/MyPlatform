import type {
  ComputedTask,
  Project,
  ProjectTotals,
  Task,
} from './types';
import { formatIso, parseIso } from './types';
import { calendarDays, dateToIso, networkDays, timelineStartDate } from './networkDays';
import { assignWbs, directChildIndices, isParentTask } from './wbs';

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/** Excel-style progress: NETWORKDAYS(start, asOf+1) / NETWORKDAYS(start, end) */
function schedulePct(
  start: string | null,
  end: string | null,
  asOfPlus1Iso: string,
  nd: (start: string, end: string) => number,
): number {
  if (!start || !end) return 0;
  const workDays = nd(start, end);
  if (workDays === 0) return 0;
  const elapsed = nd(start, asOfPlus1Iso);
  return Math.min(1, Math.max(0, elapsed / workDays));
}

interface LeafMetrics {
  planStart: string | null;
  planEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  days: number | null;
  workDays: number | null;
  manDay: number;
  totalDays: number;
  planPct: number;
  actualPct: number;
  weight: number;
  planActual: number;
  execActual: number;
  progressRate: number;
}

export function computeProject(project: Project): {
  tasks: ComputedTask[];
  totals: ProjectTotals;
} {
  const holidayIsos = project.holidays.map((h) => h.date);
  const wbsList = assignWbs(project.tasks);
  const n = project.tasks.length;
  const parents = project.tasks.map((_, i) => isParentTask(project.tasks, i));

  const asOf = project.asOfDate || formatIso(new Date());
  const asOfDate = parseIso(asOf);
  const asOfPlus1 = new Date(asOfDate);
  asOfPlus1.setDate(asOfPlus1.getDate() + 1);
  const asOfPlus1Iso = formatIso(asOfPlus1);

  // Cache NETWORKDAYS — many tasks share overlapping ranges
  const ndCache = new Map<string, number>();
  const nd = (start: string, end: string) => {
    const key = `${start}|${end}`;
    const hit = ndCache.get(key);
    if (hit !== undefined) return hit;
    const v = networkDays(start, end, holidayIsos);
    ndCache.set(key, v);
    return v;
  };

  const leafCache: (LeafMetrics | null)[] = Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (parents[i]) continue;
    const t = project.tasks[i];
    const planStart = t.planStart;
    const planEnd = t.planEnd;
    const actualStart = t.actualStart;
    const actualEnd = t.actualEnd;

    let days: number | null = null;
    let workDays: number | null = null;
    if (planStart && planEnd) {
      days = calendarDays(planStart, planEnd);
      workDays = nd(planStart, planEnd);
    }

    const planPct = schedulePct(planStart, planEnd, asOfPlus1Iso, nd);
    // 실제공정율: 사용자 입력 (0~1). 실행실적 = (총일수/합계총일수)*actualPct*100
    const actualPct = Math.min(1, Math.max(0, t.actualPct || 0));
    // Full precision for rollups / 비중 (UI rounds for display only)
    const manDay = t.manDay || 0;
    const totalDays = (workDays ?? 0) * manDay;

    leafCache[i] = {
      planStart,
      planEnd,
      actualStart,
      actualEnd,
      days,
      workDays,
      manDay,
      totalDays,
      planPct,
      actualPct,
      weight: 0,
      planActual: 0,
      execActual: 0,
      progressRate: 0,
    };
  }

  type Roll = {
    planStart: string | null;
    planEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    workDays: number;
    manDay: number;
    totalDays: number;
  };
  const roll: (Roll | null)[] = Array(n).fill(null);

  function ensureRoll(i: number): Roll {
    if (roll[i]) return roll[i]!;
    if (!parents[i]) {
      const leaf = leafCache[i]!;
      const r: Roll = {
        planStart: leaf.planStart,
        planEnd: leaf.planEnd,
        actualStart: leaf.actualStart,
        actualEnd: leaf.actualEnd,
        workDays: leaf.workDays ?? 0,
        manDay: leaf.manDay,
        totalDays: leaf.totalDays,
      };
      roll[i] = r;
      return r;
    }
    const children = directChildIndices(project.tasks, i);
    let planStart: string | null = null;
    let planEnd: string | null = null;
    let actualStart: string | null = null;
    let actualEnd: string | null = null;
    let workDays = 0;
    let manDay = 0;
    let totalDays = 0;
    for (const c of children) {
      const cr = ensureRoll(c);
      planStart = minIso(planStart, cr.planStart);
      planEnd = maxIso(planEnd, cr.planEnd);
      actualStart = minIso(actualStart, cr.actualStart);
      actualEnd = maxIso(actualEnd, cr.actualEnd);
      workDays += cr.workDays;
      manDay += cr.manDay;
      totalDays += cr.totalDays;
    }
    const r: Roll = {
      planStart,
      planEnd,
      actualStart,
      actualEnd,
      workDays,
      manDay,
      totalDays,
    };
    roll[i] = r;
    return r;
  }

  for (let i = 0; i < n; i++) ensureRoll(i);

  let projectTotalDays = 0;
  for (let i = 0; i < n; i++) {
    if (project.tasks[i].level === 0) {
      projectTotalDays += ensureRoll(i).totalDays;
    }
  }

  type Perf = { weight: number; planActual: number; execActual: number };
  const perf: Perf[] = Array.from({ length: n }, () => ({
    weight: 0,
    planActual: 0,
    execActual: 0,
  }));

  for (let i = 0; i < n; i++) {
    if (parents[i]) continue;
    const leaf = leafCache[i]!;
    const w =
      projectTotalDays === 0 ? 0 : (leaf.totalDays / projectTotalDays) * 100;
    const pa =
      projectTotalDays === 0
        ? 0
        : (leaf.totalDays / projectTotalDays) * leaf.planPct * 100;
    const ea =
      projectTotalDays === 0
        ? 0
        : (leaf.totalDays / projectTotalDays) * leaf.actualPct * 100;
    const pr = pa === 0 ? 0 : (ea / pa) * 100;
    perf[i] = { weight: w, planActual: pa, execActual: ea };
    leaf.weight = w;
    leaf.planActual = pa;
    leaf.execActual = ea;
    leaf.progressRate = pr;
  }

  function ensurePerf(i: number): Perf {
    if (!parents[i]) return perf[i];
    const children = directChildIndices(project.tasks, i);
    let weight = 0;
    let planActual = 0;
    let execActual = 0;
    for (const c of children) {
      const cp = ensurePerf(c);
      weight += cp.weight;
      planActual += cp.planActual;
      execActual += cp.execActual;
    }
    perf[i] = { weight, planActual, execActual };
    return perf[i];
  }

  for (let i = 0; i < n; i++) {
    if (parents[i]) ensurePerf(i);
  }

  const computed: ComputedTask[] = project.tasks.map((t, i) => {
    const r = ensureRoll(i);
    const p = perf[i];
    const progressRate =
      p.planActual === 0 ? 0 : (p.execActual / p.planActual) * 100;
    if (parents[i]) {
      return {
        id: t.id,
        level: t.level,
        wbs: wbsList[i],
        name: t.name,
        lead: t.lead,
        isParent: true,
        planStart: r.planStart,
        planEnd: r.planEnd,
        actualStart: r.actualStart,
        actualEnd: r.actualEnd,
        days:
          r.planStart && r.planEnd ? calendarDays(r.planStart, r.planEnd) : null,
        workDays: r.workDays,
        manDay: r.manDay,
        totalDays: r.totalDays,
        planPct: null,
        actualPct: null,
        weight: p.weight,
        planActual: p.planActual,
        execActual: p.execActual,
        progressRate,
        deliverable: t.deliverable,
      };
    }
    const leaf = leafCache[i]!;
    return {
      id: t.id,
      level: t.level,
      wbs: wbsList[i],
      name: t.name,
      lead: t.lead,
      isParent: false,
      planStart: leaf.planStart,
      planEnd: leaf.planEnd,
      actualStart: leaf.actualStart,
      actualEnd: leaf.actualEnd,
      days: leaf.days,
      workDays: leaf.workDays,
      manDay: leaf.manDay,
      totalDays: leaf.totalDays,
      planPct: leaf.planPct,
      actualPct: leaf.actualPct,
      weight: leaf.weight,
      planActual: leaf.planActual,
      execActual: leaf.execActual,
      progressRate: leaf.progressRate,
      deliverable: t.deliverable,
    };
  });

  let tPlanStart: string | null = null;
  let tPlanEnd: string | null = null;
  let tActStart: string | null = null;
  let tActEnd: string | null = null;
  let tWork = 0;
  let tMan = 0;
  let tTotal = 0;
  let tWeight = 0;
  let tPlan = 0;
  let tExec = 0;
  for (let i = 0; i < n; i++) {
    if (project.tasks[i].level !== 0) continue;
    const c = computed[i];
    tPlanStart = minIso(tPlanStart, c.planStart);
    tPlanEnd = maxIso(tPlanEnd, c.planEnd);
    tActStart = minIso(tActStart, c.actualStart);
    tActEnd = maxIso(tActEnd, c.actualEnd);
    tWork += c.workDays ?? 0;
    tMan += c.manDay ?? 0;
    tTotal += c.totalDays ?? 0;
    tWeight += c.weight;
    tPlan += c.planActual;
    tExec += c.execActual;
  }

  const totals: ProjectTotals = {
    planStart: tPlanStart,
    planEnd: tPlanEnd,
    actualStart: tActStart,
    actualEnd: tActEnd,
    workDays: tWork,
    manDay: tMan,
    totalDays: tTotal,
    weight: tWeight,
    planActual: tPlan,
    execActual: tExec,
    progressRate: tPlan === 0 ? 0 : (tExec / tPlan) * 100,
  };

  return { tasks: computed, totals };
}

/** Clamp task date fields against project start and pair ordering */
export function clampTaskDates(
  task: Task,
  projectStart: string,
  patch: Partial<Task>,
): Partial<Task> {
  const next = { ...patch };

  const clampStart = (v: string | null | undefined): string | null | undefined => {
    if (v == null || v === '') return v === '' ? null : v;
    return v < projectStart ? projectStart : v;
  };

  if ('planStart' in next) next.planStart = clampStart(next.planStart) ?? null;
  if ('actualStart' in next) next.actualStart = clampStart(next.actualStart) ?? null;

  const planStart = next.planStart !== undefined ? next.planStart : task.planStart;
  const planEnd = next.planEnd !== undefined ? next.planEnd : task.planEnd;
  if (planStart && planEnd && planEnd < planStart) {
    if ('planEnd' in next) next.planEnd = planStart;
    else if ('planStart' in next) next.planEnd = planStart;
  }

  const actualStart =
    next.actualStart !== undefined ? next.actualStart : task.actualStart;
  const actualEnd = next.actualEnd !== undefined ? next.actualEnd : task.actualEnd;
  if (actualStart && actualEnd && actualEnd < actualStart) {
    if ('actualEnd' in next) next.actualEnd = actualStart;
    else if ('actualStart' in next) next.actualEnd = actualStart;
  }

  return next;
}

export function indentSubtree(tasks: Task[], index: number): Task[] {
  if (index <= 0) return tasks;
  const maxLevel = tasks[index - 1].level + 1;
  if (tasks[index].level >= maxLevel) return tasks;
  const level = tasks[index].level;
  let end = index;
  for (let i = index + 1; i < tasks.length; i++) {
    if (tasks[i].level <= level) break;
    end = i;
  }
  return tasks.map((t, i) =>
    i >= index && i <= end ? { ...t, level: t.level + 1 } : t,
  );
}

export function outdentSubtree(tasks: Task[], index: number): Task[] {
  if (tasks[index].level <= 0) return tasks;
  const level = tasks[index].level;
  let end = index;
  for (let i = index + 1; i < tasks.length; i++) {
    if (tasks[i].level <= level) break;
    end = i;
  }
  return tasks.map((t, i) =>
    i >= index && i <= end ? { ...t, level: t.level - 1 } : t,
  );
}

export function moveSubtree(tasks: Task[], index: number, direction: -1 | 1): Task[] {
  const level = tasks[index].level;
  let end = index;
  for (let i = index + 1; i < tasks.length; i++) {
    if (tasks[i].level <= level) break;
    end = i;
  }
  const block = tasks.slice(index, end + 1);

  if (direction === -1) {
    if (index === 0) return tasks;
    let prevStart = index - 1;
    while (prevStart > 0 && tasks[prevStart].level > level) prevStart--;
    if (tasks[prevStart].level < level) return tasks;
    let blockStart = prevStart;
    while (blockStart > 0 && tasks[blockStart].level > level) blockStart--;
    if (tasks[blockStart].level !== level) return tasks;

    const before = tasks.slice(0, blockStart);
    const prevBlock = tasks.slice(blockStart, index);
    const after = tasks.slice(end + 1);
    return [...before, ...block, ...prevBlock, ...after];
  }

  if (end + 1 >= tasks.length) return tasks;
  if (tasks[end + 1].level !== level) return tasks;
  let nextEnd = end + 1;
  for (let i = end + 2; i < tasks.length; i++) {
    if (tasks[i].level <= level) break;
    nextEnd = i;
  }
  const before = tasks.slice(0, index);
  const nextBlock = tasks.slice(end + 1, nextEnd + 1);
  const after = tasks.slice(nextEnd + 1);
  return [...before, ...nextBlock, ...block, ...after];
}

export function deleteSubtree(tasks: Task[], index: number): Task[] {
  const level = tasks[index].level;
  let end = index;
  for (let i = index + 1; i < tasks.length; i++) {
    if (tasks[i].level <= level) break;
    end = i;
  }
  return [...tasks.slice(0, index), ...tasks.slice(end + 1)];
}

export function ganttDayCount(project: Project): number {
  const start = timelineStartDate(project.startDate, project.displayWeek);
  const endIso = project.endDate || project.startDate;
  if (Number.isNaN(parseIso(endIso).getTime())) return 90;

  const startIso = dateToIso(start);
  if (endIso < startIso) return 1;
  return Math.max(1, calendarDays(startIso, endIso));
}
