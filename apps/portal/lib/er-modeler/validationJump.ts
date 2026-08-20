import type { ErProject } from "./types";
import type { ErValidationItem } from "./validation";

export type ValidationJumpTarget =
  | { kind: "table"; tableId: string }
  | { kind: "column"; tableId: string; columnName: string }
  | { kind: "relation"; relationId: string };

function tableIdForName(project: ErProject, name: string): string | null {
  const t = project.tables.find(
    (x) => x.name === name || x.id === name
  );
  return t?.id ?? null;
}

function parseTableColumnSuffix(
  project: ErProject,
  suffix: string
): ValidationJumpTarget | null {
  for (const t of project.tables) {
    const prefix = `${t.name}_`;
    if (!suffix.startsWith(prefix)) continue;
    const columnName = suffix.slice(prefix.length);
    if (!columnName || !t.columns.some((c) => c.name === columnName)) continue;
    return { kind: "column", tableId: t.id, columnName };
  }
  const lastUnderscore = suffix.lastIndexOf("_");
  if (lastUnderscore <= 0) return null;
  const tableName = suffix.slice(0, lastUnderscore);
  const columnName = suffix.slice(lastUnderscore + 1);
  const tableId = tableIdForName(project, tableName);
  if (!tableId) return null;
  return { kind: "column", tableId, columnName };
}

export function parseValidationJump(
  item: ErValidationItem,
  project: ErProject
): ValidationJumpTarget | null {
  const id = item.id;

  if (id.startsWith("orphan_table_")) {
    const name = id.slice("orphan_table_".length);
    const tableId = tableIdForName(project, name);
    return tableId ? { kind: "table", tableId } : null;
  }

  if (id.startsWith("pk_missing_")) {
    const name = id.slice("pk_missing_".length);
    const tableId = tableIdForName(project, name);
    return tableId ? { kind: "table", tableId } : null;
  }

  if (id.startsWith("dup_attr_")) {
    const rest = id.slice("dup_attr_".length);
    const us = rest.lastIndexOf("_");
    if (us <= 0) return null;
    const tableName = rest.slice(0, us);
    const tableId = tableIdForName(project, tableName);
    return tableId ? { kind: "table", tableId } : null;
  }

  const fkPrefixes = [
    "fk_ref_missing_",
    "fk_parent_missing_",
    "fk_parent_col_missing_",
    "fk_target_has_no_pk_",
    "fk_ref_target_not_pk_",
    "type_mismatch_",
  ];
  for (const p of fkPrefixes) {
    if (id.startsWith(p)) {
      return parseTableColumnSuffix(project, id.slice(p.length));
    }
  }

  if (id.startsWith("rel_")) {
    const rel = project.relations.find((r) => id.endsWith(r.id));
    if (rel) return { kind: "relation", relationId: rel.id };
  }

  if (id.startsWith("cycle_")) {
    const chain = id.slice("cycle_".length).split("_");
    const first = chain[0];
    if (first) {
      const tableId = tableIdForName(project, first);
      if (tableId) return { kind: "table", tableId };
    }
  }

  const detail = item.detail || "";
  const tableMatch = detail.match(/테이블\s+'([^']+)'/);
  if (tableMatch) {
    const tableId = tableIdForName(project, tableMatch[1]);
    if (tableId) return { kind: "table", tableId };
  }

  return null;
}
