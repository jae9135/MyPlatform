import { mergeImportedProject } from "./flow";
import type { ImportMode } from "./ImportDialog";
import type { ErProject } from "./types";

export type ImportPreview = {
  mode: ImportMode;
  incomingTableCount: number;
  incomingRelationCount: number;
  currentTableCount: number;
  currentRelationCount: number;
  toAdd: string[];
  toSkip: string[];
  relationsToAdd: number;
  relationsToSkip: number;
};

export function buildImportPreview(
  current: ErProject,
  imported: ErProject,
  mode: ImportMode
): ImportPreview {
  const incomingTableCount = imported.tables.length;
  const incomingRelationCount = imported.relations.length;
  const currentTableCount = current.tables.length;
  const currentRelationCount = current.relations.length;

  if (mode === "replace" || !current.tables.length) {
    return {
      mode: mode === "append" && !current.tables.length ? "replace" : mode,
      incomingTableCount,
      incomingRelationCount,
      currentTableCount,
      currentRelationCount,
      toAdd: imported.tables.map((t) => t.name),
      toSkip: [],
      relationsToAdd: incomingRelationCount,
      relationsToSkip: 0,
    };
  }

  const existingNames = new Set(
    current.tables.map((t) => t.name.toLowerCase())
  );
  const toAdd: string[] = [];
  const toSkip: string[] = [];
  for (const t of imported.tables) {
    if (existingNames.has(t.name.toLowerCase())) toSkip.push(t.name);
    else toAdd.push(t.name);
  }

  const merged = mergeImportedProject(current, imported);
  const relationsToAdd = merged.project.relations.length - current.relations.length;
  const relationsToSkip = Math.max(0, incomingRelationCount - relationsToAdd);

  return {
    mode: "append",
    incomingTableCount,
    incomingRelationCount,
    currentTableCount,
    currentRelationCount,
    toAdd,
    toSkip,
    relationsToAdd,
    relationsToSkip,
  };
}

/** merge 후 새로 추가된 테이블 id 목록 */
export function addedTableIdsAfterImport(
  before: ErProject,
  after: ErProject,
  preview: ImportPreview
): string[] {
  if (preview.mode === "replace" || !before.tables.length) {
    return after.tables.map((t) => t.id);
  }
  const beforeNames = new Set(before.tables.map((t) => t.name.toLowerCase()));
  return after.tables
    .filter((t) => !beforeNames.has(t.name.toLowerCase()))
    .map((t) => t.id);
}
