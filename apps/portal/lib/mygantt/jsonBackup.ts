import { downloadBlob } from "./excelImport";
import {
  createEmptyProject,
  normalizeTask,
  type Project,
} from "./types";

export const JSON_KIND = "mygantt.project";

export function exportProjectToJson(project: Project): void {
  const payload = {
    kind: JSON_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const safeName = (project.name || "MyGantt").replace(/[\\/:*?"<>|]/g, "_");
  downloadBlob(blob, `${safeName}.json`);
}

export function importProjectFromJson(text: string): Project {
  const parsed = JSON.parse(text) as {
    kind?: string;
    project?: Project;
    tasks?: Project["tasks"];
  };
  const raw =
    parsed && typeof parsed === "object" && parsed.project
      ? parsed.project
      : (parsed as unknown as Project);
  if (!raw || !Array.isArray(raw.tasks)) {
    throw new Error("MyGantt JSON 형식이 아닙니다.");
  }
  const base = createEmptyProject();
  return {
    ...base,
    ...raw,
    holidays: raw.holidays ?? [],
    tasks: raw.tasks.map((t) => normalizeTask(t)),
    displayWeek: raw.displayWeek || 1,
    asOfDate: raw.asOfDate || base.asOfDate,
  };
}
