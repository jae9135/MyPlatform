export type WorkStatus = "none" | "wip" | "done";

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  none: "미착수",
  wip: "작성중",
  done: "완료",
};

const STORAGE_KEY = "deliverable-manager.status.v1";
const ORDER: WorkStatus[] = ["none", "wip", "done"];

function isStatus(value: string): value is WorkStatus {
  return value === "none" || value === "wip" || value === "done";
}

export function loadWorkStatusMap(): Record<string, WorkStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, WorkStatus> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isStatus(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveWorkStatusMap(map: Record<string, WorkStatus>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function cycleWorkStatus(current: WorkStatus): WorkStatus {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}
