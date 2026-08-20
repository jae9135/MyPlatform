import {
  cardSideIsMany,
  EDGE_COLUMN,
  inferParentChildTables,
  inferRelationColumns,
  isIdentifyingOneToOne,
  normalizeCardinality,
  preferChildFkColumn,
  preferParentPkColumn,
  type ErColumn,
  type ErProject,
  type ErRelation,
  type RelationCardinality,
} from "./types";

export type ErValidationSeverity = "error" | "warn";

export type ErValidationItem = {
  id: string;
  severity: ErValidationSeverity;
  title: string;
  detail?: string;
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function normalizeDataType(dt: string | undefined | null): string {
  const raw = String(dt ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw) return "";
  // Keep broad compatibility; "VARCHAR2" vs "VARCHAR" vs "(...)"
  return raw.replace(/\(.+\)/g, "").replace(/[\d]/g, "");
}

type ParsedFkRef = { table: string; column: string } | null;

function parseFkRef(fkRef: string | null | undefined): ParsedFkRef {
  const text = String(fkRef ?? "").trim();
  const m = text.match(/^(.+?)\((.+?)\)$/);
  if (!m) return null;
  const table = norm(m[1]).replace(/^.*\./, ""); // allow schema.table(col)
  const column = norm(m[2]);
  if (!table || !column) return null;
  return { table, column };
}

function getTable(project: ErProject, tableName: string): { table: any } | null {
  const t = project.tables.find((x) => x.name === tableName || x.id === tableName);
  return t ? { table: t } : null;
}

function getColumn(table: any, colName: string): ErColumn | null {
  if (!table) return null;
  const c = table.columns.find((x: ErColumn) => x.name === colName);
  return c ?? null;
}

export function splitCardinality(card: string): [string, string] {
  const c = normalizeCardinality(card);
  const idx = c.indexOf(":");
  if (idx < 0) return ["1", "1..N"];
  return [c.slice(0, idx), c.slice(idx + 1)];
}

export function relationParentChild(
  project: ErProject,
  rel: ErRelation
): {
  parentTable: string;
  parentCol: string;
  childTable: string;
  childCol: string;
} | null {
  const fromTable = project.tables.find(
    (t) => t.name === rel.fromTable || t.id === rel.fromTable
  );
  const toTable = project.tables.find(
    (t) => t.name === rel.toTable || t.id === rel.toTable
  );
  if (!fromTable || !toTable) return null;

  const linked = inferRelationColumns(project, rel.fromTable, rel.toTable);
  const fromCol = fromTable.columns.find((c) => c.name === linked.fromColumn);
  const toCol = toTable.columns.find((c) => c.name === linked.toColumn);

  const inferred = inferParentChildTables(fromTable, toTable);
  if (inferred && (linked.fromColumn === EDGE_COLUMN || !fromCol || !toCol)) {
    const parentCol = preferParentPkColumn(inferred.parent, undefined);
    const childCol = preferChildFkColumn(
      inferred.child,
      inferred.parent,
      parentCol,
      undefined
    );
    return {
      parentTable: inferred.parent.name,
      parentCol,
      childTable: inferred.child.name,
      childCol,
    };
  }

  if (!fromCol || !toCol) return null;

  if (inferred) {
    const parentCol = preferParentPkColumn(
      inferred.parent,
      inferred.parent.name === fromTable.name ? linked.fromColumn : linked.toColumn
    );
    const childCol = preferChildFkColumn(
      inferred.child,
      inferred.parent,
      parentCol,
      inferred.child.name === fromTable.name ? linked.fromColumn : linked.toColumn
    );
    return {
      parentTable: inferred.parent.name,
      parentCol,
      childTable: inferred.child.name,
      childCol,
    };
  }

  const [left, right] = splitCardinality(rel.cardinality);
  if (cardSideIsMany(left) && !cardSideIsMany(right)) {
    return {
      childTable: fromTable.name,
      childCol: fromCol.name,
      parentTable: toTable.name,
      parentCol: toCol.name,
    };
  }
  if (!cardSideIsMany(left) && cardSideIsMany(right)) {
    return {
      childTable: toTable.name,
      childCol: toCol.name,
      parentTable: fromTable.name,
      parentCol: fromCol.name,
    };
  }
  if (fromCol.isPk && fromCol.isFk) {
    return {
      childTable: fromTable.name,
      childCol: fromCol.name,
      parentTable: toTable.name,
      parentCol: toCol.name,
    };
  }
  if (toCol.isPk && toCol.isFk) {
    return {
      childTable: toTable.name,
      childCol: toCol.name,
      parentTable: fromTable.name,
      parentCol: fromCol.name,
    };
  }
  return {
    childTable: fromTable.name,
    childCol: fromCol.name,
    parentTable: toTable.name,
    parentCol: toCol.name,
  };
}

function fkRefFromRelations(
  project: ErProject,
  tableName: string,
  colName: string
): ParsedFkRef {
  for (const rel of project.relations) {
    const roles = relationParentChild(project, rel);
    if (!roles) continue;
    if (norm(roles.childTable) === norm(tableName) && norm(roles.childCol) === norm(colName)) {
      return { table: roles.parentTable, column: roles.parentCol };
    }
  }
  return null;
}

function expectedCardForFkColumn(fromCol: ErColumn): RelationCardinality {
  return fromCol.notNull ? "1:1..N" : "1:0..N";
}

export function formatErrorReasons(items: ErValidationItem[]): string {
  return items
    .filter((i) => i.severity === "error")
    .map((i) => (i.detail ? `${i.title}: ${i.detail}` : i.title))
    .join("\n");
}

export function formatValidationReasons(items: ErValidationItem[]): string {
  return items
    .map((i) => (i.detail ? `${i.title}: ${i.detail}` : i.title))
    .join("\n");
}

export function errorsForColumnSave(
  project: ErProject,
  tableName: string,
  columnNames: string[]
): ErValidationItem[] {
  const table = norm(tableName);
  const cols = [...new Set(columnNames.map((n) => norm(n)).filter(Boolean))];
  if (!table || !cols.length) return [];
  return validateErProject(project).filter((i) => {
    if (i.severity !== "error") return false;
    const hay = `${i.id} ${i.detail || ""}`.toLowerCase();
    return cols.some((col) => {
      const qualified = `${table}.${col}`;
      return (
        hay.includes(`'${qualified}'`) ||
        hay.includes(`${qualified} `) ||
        hay.includes(`_${table}_${col}`) ||
        hay.includes(`${table}_${col}`)
      );
    });
  });
}

export function validationForRelation(
  project: ErProject,
  rel: ErRelation
): ErValidationItem[] {
  const roles = relationParentChild(project, rel);
  const needles = [
    rel.id,
    `${rel.fromTable} → ${rel.toTable}`,
    rel.fromTable,
    rel.toTable,
  ];
  if (roles) {
    needles.push(
      roles.childTable,
      roles.parentTable,
      `${roles.childTable}.${roles.childCol}`,
      `${roles.parentTable}.${roles.parentCol}`
    );
  }
  const keys = [...new Set(needles.map((n) => norm(n)).filter(Boolean))];
  if (!keys.length) return [];
  return validateErProject(project).filter((i) => {
    const hay = `${i.id} ${i.detail || ""} ${i.title}`.toLowerCase();
    return keys.some((k) => hay.includes(k));
  });
}

export function errorsTouching(
  project: ErProject,
  needles: string[]
): ErValidationItem[] {
  const keys = needles.map((n) => norm(n)).filter(Boolean);
  if (!keys.length) return [];
  return validateErProject(project).filter((i) => {
    if (i.severity !== "error") return false;
    const hay = `${i.id} ${i.detail || ""} ${i.title}`;
    const h = hay.toLowerCase();
    return keys.some((k) => h.includes(k));
  });
}

function detectCycleEdges(project: ErProject): string[][] {
  const adj = new Map<string, string[]>();
  for (const rel of project.relations) {
    const roles = relationParentChild(project, rel);
    const from = roles ? roles.childTable : rel.fromTable;
    const to = roles ? roles.parentTable : rel.toTable;
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];

  const dfs = (node: string) => {
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const next of adj.get(node) || []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        const idx = path.indexOf(next);
        if (idx >= 0) {
          cycles.push(path.slice(idx).concat([next]));
        }
      }
    }
    stack.delete(node);
    path.pop();
  };

  for (const t of project.tables) {
    if (!visited.has(t.name)) dfs(t.name);
  }

  // De-dup: stringify
  const seen = new Set<string>();
  return cycles.filter((c) => {
    const k = c.join("->");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function validateTableNames(project: ErProject): ErValidationItem[] {
  const by = new Map<string, string[]>();
  for (const t of project.tables) {
    const key = norm(t.name);
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(t.name);
  }
  const items: ErValidationItem[] = [];
  for (const [key, names] of by.entries()) {
    if (names.length <= 1) continue;
    items.push({
      id: `dup_entity_${key}`,
      severity: "error",
      title: "엔터티명 중복",
      detail: `동일/유사 엔터티명이 발견됨: ${names.join(", ")}`,
    });
  }
  return items;
}

function validateAttributeNames(project: ErProject): ErValidationItem[] {
  const items: ErValidationItem[] = [];
  for (const t of project.tables) {
    const by = new Map<string, string[]>();
    for (const c of t.columns) {
      const key = norm(c.name);
      if (!by.has(key)) by.set(key, []);
      by.get(key)!.push(c.name);
    }
    for (const [key, names] of by.entries()) {
      if (names.length <= 1) continue;
      items.push({
        id: `dup_attr_${t.name}_${key}`,
        severity: "error",
        title: "속성명 중복",
        detail: `테이블 '${t.name}'에서 컬럼명 중복: ${names.join(", ")}`,
      });
    }
  }
  return items;
}

function validatePkFk(project: ErProject): ErValidationItem[] {
  const items: ErValidationItem[] = [];

  // referenced table must have PK
  for (const child of project.tables) {
    for (const col of child.columns) {
      if (!col.isFk) continue;
      let fkRef = parseFkRef(col.fkRef);
      const parentFromRel = fkRefFromRelations(project, child.name, col.name);
      const fkRefTableExists = Boolean(
        fkRef &&
          project.tables.find((t) => t.name === fkRef!.table || t.id === fkRef!.table)
      );
      if (!fkRefTableExists && parentFromRel) {
        fkRef = parentFromRel;
      }
      if (!fkRef) {
        items.push({
          id: `fk_ref_missing_${child.name}_${col.name}`,
          severity: "error",
          title: "FK 참조 오류",
          detail: `컬럼 '${child.name}.${col.name}'가 FK인데 fkRef가 없습니다/형식이 다릅니다.`,
        });
        continue;
      }

      const parent = project.tables.find((t) => t.name === fkRef.table || t.id === fkRef.table);
      if (!parent) {
        items.push({
          id: `fk_parent_missing_${child.name}_${col.name}`,
          severity: "error",
          title: "FK 참조 오류",
          detail: `컬럼 '${child.name}.${col.name}'의 fkRef 테이블 '${fkRef.table}'이(가) 없습니다.`,
        });
        continue;
      }

      const parentCol = parent.columns.find((c) => c.name === fkRef.column);
      if (!parentCol) {
        items.push({
          id: `fk_parent_col_missing_${child.name}_${col.name}`,
          severity: "error",
          title: "FK 참조 오류",
          detail: `컬럼 '${child.name}.${col.name}'의 fkRef 컬럼 '${fkRef.column}'이(가) 없습니다.`,
        });
        continue;
      }

      const hasPk = parent.columns.some((c) => c.isPk);
      if (!hasPk) {
        items.push({
          id: `fk_target_has_no_pk_${child.name}_${col.name}`,
          severity: "error",
          title: "PK 참조 오류",
          detail: `참조 대상 테이블 '${parent.name}'에 PK가 없습니다.`,
        });
        continue;
      }

      if (!parentCol.isPk) {
        items.push({
          id: `fk_ref_target_not_pk_${child.name}_${col.name}`,
          severity: "error",
          title: "PK 참조 오류",
          detail: `참조 대상 컬럼 '${parent.name}.${parentCol.name}'은 PK가 아닙니다.`,
        });
      }

      const fromType = normalizeDataType(col.dataType);
      const toType = normalizeDataType(parentCol.dataType);
      if (fromType && toType && fromType !== toType) {
        items.push({
          id: `type_mismatch_${child.name}_${col.name}`,
          severity: "warn",
          title: "FK 타입 불일치",
          detail: `'${child.name}.${col.name}'(${col.dataType}) ↔ '${parent.name}.${parentCol.name}'(${parentCol.dataType})`,
        });
      }
    }
  }

  // PK existence per table
  for (const t of project.tables) {
    const hasPk = t.columns.some((c) => c.isPk);
    if (!hasPk) {
      items.push({
        id: `pk_missing_${t.name}`,
        severity: "warn",
        title: "PK 없는 테이블",
        detail: `테이블 '${t.name}'에 PK가 없습니다.`,
      });
    }
  }

  return items;
}

function validateRelations(project: ErProject): ErValidationItem[] {
  const items: ErValidationItem[] = [];

  for (const rel of project.relations) {
    const fromTable = project.tables.find(
      (t) => t.name === rel.fromTable || t.id === rel.fromTable
    );
    const toTable = project.tables.find(
      (t) => t.name === rel.toTable || t.id === rel.toTable
    );
    if (!fromTable || !toTable) continue;

    const roles = relationParentChild(project, rel);
    if (!roles) continue;
    const childTable = project.tables.find(
      (t) => t.name === roles.childTable || t.id === roles.childTable
    );
    const parentTable = project.tables.find(
      (t) => t.name === roles.parentTable || t.id === roles.parentTable
    );
    const childCol = childTable?.columns.find((c) => c.name === roles.childCol);
    const parentCol = parentTable?.columns.find((c) => c.name === roles.parentCol);
    if (!childCol || !parentCol || !childTable || !parentTable) continue;

    if (!childCol.isFk) {
      items.push({
        id: `rel_fk_missing_${rel.id}`,
        severity: "error",
        title: "관계선 오류",
        detail: `관계 '${rel.fromTable} → ${rel.toTable}'에서 자식(N 또는 FK) 컬럼 '${childTable.name}.${childCol.name}'이 FK가 아닙니다.`,
      });
    }

    if (!parentCol.isPk) {
      items.push({
        id: `rel_parent_not_pk_${rel.id}`,
        severity: "error",
        title: "관계선 오류",
        detail: `관계 '${rel.fromTable} → ${rel.toTable}'에서 부모(1) 컬럼 '${parentTable.name}.${parentCol.name}'이 PK가 아닙니다.`,
      });
    }

    const [left, right] = splitCardinality(rel.cardinality);
    const fromIsMany = cardSideIsMany(left);
    const toIsMany = cardSideIsMany(right);
    if (fromIsMany === toIsMany && (fromIsMany || rel.cardinality === "N:N")) {
      if (rel.cardinality === "N:N") {
        items.push({
          id: `rel_nn_${rel.id}`,
          severity: "error",
          title: "관계선 오류",
          detail: `N:N은 직접 연결할 수 없습니다. 교차 테이블로 풀어야 합니다. (${fromTable.name} ↔ ${toTable.name})`,
        });
      }
    }

    const childIsIdentifying11 = isIdentifyingOneToOne(childTable, childCol.name);
    if (childIsIdentifying11 && (fromIsMany || toIsMany)) {
      const manyTable = fromIsMany ? fromTable.name : toTable.name;
      items.push({
        id: `rel_identifying_not_1n_${rel.id}`,
        severity: "error",
        title: "관계선 오류",
        detail: `'${childTable.name}.${childCol.name}'만 PK인 식별관계는 1:1이어야 합니다. 현재 '${rel.cardinality}'라서 '${manyTable}' 쪽이 N입니다.`,
      });
    }

    const childType = normalizeDataType(childCol.dataType);
    const parentType = normalizeDataType(parentCol.dataType);
    if (childType && parentType && childType !== parentType) {
      items.push({
        id: `rel_type_mismatch_${rel.id}`,
        severity: "warn",
        title: "FK 타입 불일치",
        detail: `'${childTable.name}.${childCol.name}'(${childCol.dataType}) ↔ '${parentTable.name}.${parentCol.name}'(${parentCol.dataType})`,
      });
    }

    const expectedOptional = expectedCardForFkColumn(childCol).includes("0..");
    const actualOptional = String(rel.cardinality).includes("0..");
    if (expectedOptional !== actualOptional) {
      items.push({
        id: `rel_nullable_mismatch_${rel.id}`,
        severity: "warn",
        title: "Nullable 오류",
        detail: `FK 컬럼(${childTable.name}.${childCol.name}) notNull=${childCol.notNull} 인데 관계 카디널리티가 '${rel.cardinality}' 입니다.`,
      });
    }

    const expectedIdentifying = childCol.isPk && childCol.isFk;
    if (
      typeof rel.isIdentifying === "boolean" &&
      rel.isIdentifying !== expectedIdentifying
    ) {
      items.push({
        id: `rel_identifying_mismatch_${rel.id}`,
        severity: "warn",
        title: "식별/비식별 관계 불일치",
        detail: `관계 '${rel.fromTable} → ${rel.toTable}'에서 자식 컬럼 PK+FK=${expectedIdentifying} 입니다.`,
      });
    }

    if (rel.cardinality === "1:1" || rel.cardinality === "1:0..1") {
      if (!childCol.isUk && !childCol.isPk) {
        items.push({
          id: `unique_required_${rel.id}`,
          severity: "warn",
          title: "Unique 오류",
          detail: `1:1 관계에서는 자식 컬럼 '${childTable.name}.${childCol.name}'에 UNIQUE/UK 또는 PK가 필요합니다.`,
        });
      }
    }
  }

  // cycle — 자기 자신 참조(member→member)는 허용
  const cycles = detectCycleEdges(project);
  for (const c of cycles) {
    const core = c.slice(0, -1);
    if (core.length === 1 || (core.length === 2 && core[0] === core[1])) {
      continue;
    }
    items.push({
      id: `cycle_${c.join("_")}`,
      severity: "warn",
      title: "순환 FK 경고",
      detail: c.join(" → "),
    });
  }

  return items;
}

function validateOrphanTables(project: ErProject): ErValidationItem[] {
  if (project.tables.length <= 1) return [];
  const connected = new Set<string>();
  for (const rel of project.relations) {
    connected.add(rel.fromTable);
    connected.add(rel.toTable);
  }
  const items: ErValidationItem[] = [];
  for (const t of project.tables) {
    if (connected.has(t.name) || connected.has(t.id)) continue;
    items.push({
      id: `orphan_table_${t.name}`,
      severity: "warn",
      title: "고아 테이블",
      detail: `테이블 '${t.name}'에 연결된 관계가 없습니다.`,
    });
  }
  return items;
}

export function validateErProject(project: ErProject): ErValidationItem[] {
  if (!project) return [];
  const results: ErValidationItem[] = [];
  results.push(...validateTableNames(project));
  results.push(...validateAttributeNames(project));
  results.push(...validatePkFk(project));
  results.push(...validateOrphanTables(project));
  results.push(...validateRelations(project));

  // Stable ordering: errors first
  results.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return results;
}

