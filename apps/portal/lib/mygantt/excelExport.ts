import * as XLSX from 'xlsx';
import type { ComputedTask, Project, ProjectTotals } from './types';
import { downloadBlob } from './excelImport';

function pct(n: number | null | undefined, digits = 2): number | string {
  if (n == null || Number.isNaN(n)) return '';
  return Number((n * 100).toFixed(digits));
}

function num(n: number | null | undefined, digits = 2): number | string {
  if (n == null || Number.isNaN(n)) return '';
  return Number(n.toFixed(digits));
}

export function exportProjectToExcel(
  project: Project,
  computed: ComputedTask[],
  totals: ProjectTotals,
): void {
  const header = [
    'WBS',
    'TASK',
    'LEAD',
    '계획START',
    '계획END',
    '실제START',
    '실제END',
    'DAYS',
    'WORK DAYS',
    'Man/Day',
    '총일수',
    '계획공정율',
    '실제공정율',
    '비중',
    '계획실적',
    '실행실적',
    '공정율',
    '산출물',
  ];

  const meta: unknown[][] = [
    [`${project.name} Project Schedule`],
    [project.company],
    [],
    [
      '',
      'Project Start Date',
      project.startDate,
      'Project End Date',
      project.endDate,
      'As Of Date',
      project.asOfDate,
      'Display Week',
      project.displayWeek,
    ],
    ['', 'Project Manager', project.manager],
    [],
    header,
    [
      '계',
      project.name,
      '',
      totals.planStart ?? '',
      totals.planEnd ?? '',
      totals.actualStart ?? '',
      totals.actualEnd ?? '',
      '',
      totals.workDays,
      num(totals.manDay, 1),
      num(totals.totalDays, 1),
      '',
      '',
      num(totals.weight, 2),
      num(totals.planActual, 2),
      num(totals.execActual, 2),
      num(totals.progressRate, 2),
      '',
    ],
  ];

  const taskRows = computed.map((t) => [
    t.wbs,
    t.name,
    t.lead,
    t.planStart ?? '',
    t.planEnd ?? '',
    t.actualStart ?? '',
    t.actualEnd ?? '',
    t.days ?? '',
    t.workDays ?? '',
    num(t.manDay, 1),
    num(t.totalDays, 1),
    t.planPct == null ? '' : pct(t.planPct, 2),
    t.actualPct == null ? '' : pct(t.actualPct, 2),
    num(t.weight, 2),
    num(t.planActual, 2),
    num(t.execActual, 2),
    num(t.progressRate, 2),
    t.deliverable,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...meta, ...taskRows]);
  ws['!cols'] = header.map((_, i) => ({ wch: i === 1 || i === 17 ? 28 : 12 }));

  const holidayRows: unknown[][] = [['날짜', '공휴일']];
  for (const h of project.holidays) {
    holidayRows.push([h.date, h.name]);
  }
  const hs = XLSX.utils.aoa_to_sheet(holidayRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'WBS');
  XLSX.utils.book_append_sheet(wb, hs, '휴일목록');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const safeName = (project.name || 'MyGantt').replace(/[\\/:*?"<>|]/g, '_');
  downloadBlob(blob, `${safeName}_일정.xlsx`);
}
