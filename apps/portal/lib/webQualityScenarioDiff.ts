/** IPMS 등 화면 시나리오 diff · localStorage 백업 (내부 QA). */

export type ScenarioCandidate = {
  state_id: string;
  label: string;
  description?: string;
  access?: string;
  kind?: string;
};

export type ScenarioDiffStatus = "added" | "removed" | "changed" | "same";

export type ScenarioDiffRow = {
  state_id: string;
  status: ScenarioDiffStatus;
  beforeLabel?: string;
  afterLabel?: string;
  access?: string;
};

export type ScenarioBackupSnapshot = {
  savedAt: string;
  source: "ipms-online";
  zipName?: string;
  payload: Record<string, unknown>;
  selectedIds: string[];
};

/** 브라우저 localStorage — DevTools → Application → Local Storage → 해당 키 */
export const SCENARIO_BACKUP_STORAGE_KEY = "wq-scenario-backup-ipms-online";

function scenarioSignature(c: ScenarioCandidate): string {
  return `${c.label}|${(c.access || "public").toLowerCase()}|${c.description || ""}`;
}

export function diffScenarioLists(
  before: ScenarioCandidate[],
  after: ScenarioCandidate[],
): ScenarioDiffRow[] {
  const beforeMap = new Map(before.map((c) => [c.state_id, c]));
  const afterMap = new Map(after.map((c) => [c.state_id, c]));
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const rows: ScenarioDiffRow[] = [];

  for (const id of ids) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);
    if (b && a) {
      rows.push({
        state_id: id,
        status: scenarioSignature(b) === scenarioSignature(a) ? "same" : "changed",
        beforeLabel: b.label,
        afterLabel: a.label,
        access: a.access || b.access,
      });
    } else if (a) {
      rows.push({
        state_id: id,
        status: "added",
        afterLabel: a.label,
        access: a.access,
      });
    } else if (b) {
      rows.push({
        state_id: id,
        status: "removed",
        beforeLabel: b.label,
        access: b.access,
      });
    }
  }

  const order: Record<ScenarioDiffStatus, number> = {
    added: 0,
    removed: 1,
    changed: 2,
    same: 3,
  };
  return rows.sort((x, y) => {
    const d = order[x.status] - order[y.status];
    if (d !== 0) return d;
    return (x.afterLabel || x.beforeLabel || x.state_id).localeCompare(
      y.afterLabel || y.beforeLabel || y.state_id,
      "ko",
    );
  });
}

export function saveScenarioBackup(snapshot: ScenarioBackupSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SCENARIO_BACKUP_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}

export function loadScenarioBackup(): ScenarioBackupSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SCENARIO_BACKUP_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScenarioBackupSnapshot;
  } catch {
    return null;
  }
}

export function diffSummary(rows: ScenarioDiffRow[]): {
  added: number;
  removed: number;
  changed: number;
  same: number;
} {
  return rows.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { added: 0, removed: 0, changed: 0, same: 0 },
  );
}
