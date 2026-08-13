import * as XLSX from 'xlsx';
import {
  createEmptyProject,
  createEmptyTask,
  formatIso,
  type Holiday,
  type Project,
  type Task,
} from './types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdToIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Excel serial → calendar Y/M/D (timezone-safe; epoch 1899-12-30). */
function excelSerialToYmd(serial: number): { y: number; m: number; d: number } | null {
  if (!Number.isFinite(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

/** Parse Excel display text like "7/21/2025 (Monday)" or "Mon 7/21/25". */
function parseExcelDateText(text: string): string | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return ymdToIso(year, month, day);
}

/**
 * Convert Excel cell value to ISO date (YYYY-MM-DD).
 * Prefer serial numbers — SheetJS cellDates + local timezone often shifts a day earlier (KST).
 */
function excelDateToIso(value: unknown, formatted?: string): string | null {
  if (value == null || value === '' || value === ' - ') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = excelSerialToYmd(value);
    if (!parsed) return null;
    return ymdToIso(parsed.y, parsed.m, parsed.d);
  }

  if (typeof formatted === 'string' && formatted.trim()) {
    const fromText = parseExcelDateText(formatted);
    if (fromText) return fromText;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // cellDates artifact: use UTC calendar day only when time is exactly midnight UTC
    if (
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0
    ) {
      return ymdToIso(
        value.getUTCFullYear(),
        value.getUTCMonth() + 1,
        value.getUTCDate(),
      );
    }
    // Otherwise prefer local calendar (rare path)
    return formatIso(value);
  }

  if (typeof value === 'string') {
    const fromText = parseExcelDateText(value);
    if (fromText) return fromText;
    // YYYY-MM-DD only — avoid new Date(string) timezone shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  return null;
}

function cellDateIso(cell: XLSX.CellObject | undefined): string | null {
  if (!cell) return null;
  return excelDateToIso(cell.v, typeof cell.w === 'string' ? cell.w : undefined);
}

function cellNum(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function getCell(ws: XLSX.WorkSheet, r: number, c: number): XLSX.CellObject | undefined {
  return ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
}

function cellHasFormula(cell: XLSX.CellObject | undefined): boolean {
  return Boolean(cell?.f);
}

/**
 * Import from Vertex42-style template (WBS + 휴일목록 sheets).
 */
export function importProjectFromExcel(data: ArrayBuffer): Project {
  // cellDates:false — keep Excel serials; cellDates:true shifts dates back 1 day in KST
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const project = createEmptyProject();

  const holidaySheetName =
    wb.SheetNames.find((n) => n.includes('휴일') || n.toLowerCase().includes('holiday')) ??
    wb.SheetNames[1];
  if (holidaySheetName && wb.Sheets[holidaySheetName]) {
    const hs = wb.Sheets[holidaySheetName];
    const ref = hs['!ref'];
    const holidays: Holiday[] = [];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let r = 1; r <= range.e.r; r++) {
        const dateCell = getCell(hs, r, 0);
        const date = cellDateIso(dateCell);
        if (!date) continue;
        const nameCell = getCell(hs, r, 1);
        holidays.push({ date, name: nameCell?.v != null ? String(nameCell.v) : '' });
      }
    }
    project.holidays = holidays;
  }

  const wbsName =
    wb.SheetNames.find((n) => n.toUpperCase() === 'WBS') ?? wb.SheetNames[0];
  const ws = wb.Sheets[wbsName];
  if (!ws) return project;

  const ref = ws['!ref'];
  if (!ref) return project;
  const range = XLSX.utils.decode_range(ref);

  const titleCell = getCell(ws, 0, 0);
  if (titleCell?.v != null) {
    const title = String(titleCell.v);
    project.name = title.replace(/\s*Project Schedule\s*$/i, '').trim() || title;
  }
  const companyCell = getCell(ws, 1, 0);
  if (companyCell?.v != null) project.company = String(companyCell.v);

  // C4 = project start (row 3, col 2), K4 = display week (row 3, col 10)
  const startIso = cellDateIso(getCell(ws, 3, 2));
  if (startIso) project.startDate = startIso;
  const dw = cellNum(getCell(ws, 3, 10)?.v);
  if (dw != null) project.displayWeek = dw;

  // Manager often in C5
  const mgr = getCell(ws, 4, 2)?.v ?? getCell(ws, 4, 1)?.v;
  if (mgr != null && typeof mgr === 'string' && !/project manager/i.test(mgr)) {
    project.manager = mgr;
  }

  let headerRow = -1;
  for (let r = 0; r <= Math.min(14, range.e.r); r++) {
    const a = getCell(ws, r, 0)?.v;
    const b = getCell(ws, r, 1)?.v;
    if (a === 'WBS' || b === 'TASK') {
      headerRow = r;
      break;
    }
  }
  if (headerRow < 0) return project;

  // Resolve columns by header label (template / export variants)
  const col = {
    wbs: 0,
    task: 1,
    lead: 2,
    start: 3,
    end: 4,
    days: 5,
    manDay: 7,
    actualPct: 10,
    deliverable: 15,
  };
  for (let c = 0; c <= range.e.c; c++) {
    const label = String(getCell(ws, headerRow, c)?.v ?? '')
      .trim()
      .toLowerCase();
    if (label === 'wbs') col.wbs = c;
    else if (label === 'task') col.task = c;
    else if (label === 'lead') col.lead = c;
    else if (label === 'start' || label === '계획start' || label === '계획시작')
      col.start = c;
    else if (label === 'end' || label === '계획end' || label === '계획종료')
      col.end = c;
    else if (label === 'days') col.days = c;
    else if (label === 'man/day' || label === 'm/d' || label === 'manday')
      col.manDay = c;
    else if (
      label === '% done' ||
      label === '%done' ||
      label === '실제공정율' ||
      label === 'done'
    )
      col.actualPct = c;
    else if (label === '산출물') col.deliverable = c;
  }

  const tasks: Task[] = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const nameCell = getCell(ws, r, col.task);
    if (nameCell?.v == null || nameCell.v === '') continue;
    const wbsCell = getCell(ws, r, col.wbs);
    if (wbsCell?.v === '계') continue;

    const name = String(nameCell.v).trim();
    const wbsVal = wbsCell?.v != null ? String(wbsCell.v) : '';
    const level = wbsVal.includes('.')
      ? wbsVal.split('.').length - 1
      : wbsVal
        ? 0
        : 0;

    const startCellR = getCell(ws, r, col.start);
    const endCellR = getCell(ws, r, col.end);
    const daysCell = getCell(ws, r, col.days);
    const manCell = getCell(ws, r, col.manDay);
    const actualPctCell = getCell(ws, r, col.actualPct);
    const leadCell = getCell(ws, r, col.lead);
    const delivCell = getCell(ws, r, col.deliverable);

    // Parent: START/END rollup formula, or Man/Day SUM formula
    const manFormula = typeof manCell?.f === 'string' ? manCell.f : '';
    const isParent =
      cellHasFormula(startCellR) ||
      (startCellR?.v == null && cellHasFormula(endCellR)) ||
      /^SUM\(/i.test(manFormula);

    const task = createEmptyTask(level);
    task.name = name;
    task.lead = leadCell?.v != null ? String(leadCell.v) : '';
    task.deliverable = delivCell?.v != null ? String(delivCell.v) : '';
    task.manDay = 0;
    task.actualPct = 0;

    if (!isParent) {
      task.planStart = cellDateIso(startCellR);
      const endIso = cellDateIso(endCellR);
      const days = cellNum(daysCell?.v);
      if (endIso) {
        task.planEnd = endIso;
      } else if (task.planStart && days != null && days > 0) {
        const d = new Date(`${task.planStart}T00:00:00`);
        d.setDate(d.getDate() + days - 1);
        task.planEnd = formatIso(d);
      } else if (task.planStart && days === 0) {
        task.planEnd = task.planStart;
      }
      if (cellHasFormula(endCellR) && task.planStart && days != null && days > 0) {
        const d = new Date(`${task.planStart}T00:00:00`);
        d.setDate(d.getDate() + days - 1);
        task.planEnd = formatIso(d);
      }
      // Empty Man/Day in template → 0 (do not default to 1)
      const md = cellNum(manCell?.v);
      task.manDay = md == null ? 0 : Math.round(md * 10) / 10;
      // % DONE / 실제공정율: Excel ratio 0~1 or percent 0~100
      const ap = cellNum(actualPctCell?.v);
      if (ap == null) {
        task.actualPct = 0;
      } else if (ap > 1) {
        task.actualPct = Math.min(1, Math.max(0, ap / 100));
      } else {
        task.actualPct = Math.min(1, Math.max(0, ap));
      }
    } else {
      task.planStart = null;
      task.planEnd = null;
      task.actualStart = null;
      task.actualEnd = null;
      task.manDay = 0;
      task.actualPct = 0;
    }

    tasks.push(task);
  }

  // Normalize levels (no jump > +1)
  const normalized: Task[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (i === 0) {
      normalized.push({ ...t, level: 0 });
    } else {
      const maxLv = normalized[i - 1].level + 1;
      normalized.push({ ...t, level: Math.min(Math.max(0, t.level), maxLv) });
    }
  }
  project.tasks = normalized;

  // Project end date: explicit cell, else max task end, else start+90
  for (let r = 0; r < Math.min(8, range.e.r); r++) {
    for (let c = 0; c <= Math.min(12, range.e.c); c++) {
      const v = getCell(ws, r, c)?.v;
      if (typeof v === 'string' && /project end|종료일/i.test(v)) {
        const d = cellDateIso(getCell(ws, r, c + 1));
        if (d) project.endDate = d;
      }
    }
  }
  if (!project.endDate || project.endDate < project.startDate) {
    const ends = normalized
      .map((t) => t.planEnd)
      .filter((d): d is string => Boolean(d));
    if (ends.length) {
      project.endDate = ends.reduce((a, b) => (a > b ? a : b));
    } else {
      const d = new Date(`${project.startDate}T00:00:00`);
      d.setDate(d.getDate() + 90);
      project.endDate = formatIso(d);
    }
  }
  project.asOfDate = formatIso(new Date());

  return project;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
