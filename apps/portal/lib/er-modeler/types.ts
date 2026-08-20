export type ErColumn = {
  name: string;
  koreanName: string;
  dataType: string;
  length?: number | null;
  notNull: boolean;
  isPk: boolean;
  isFk: boolean;
  fkRef?: string | null;
  comment?: string | null;
  indexKey?: string | null;
  isUk?: boolean;
  defaultValue?: string | null;
};

export type ErTable = {
  id: string;
  name: string;
  koreanName: string;
  columns: ErColumn[];
  position: { x: number; y: number };
};

export type RelationCardinality =
  | "1:1"
  | "1:1..N"
  | "1..N:1"
  | "N:N"
  | "1:0..1"
  | "0..1:1"
  | "1:0..N"
  | "0..N:1";

/** 레거시 1:N / N:1 → 1:1..N / 1..N:1 */
export function normalizeCardinality(card: string | undefined | null): RelationCardinality {
  const c = String(card || "1:1..N").trim();
  if (c === "1:N") return "1:1..N";
  if (c === "N:1") return "1..N:1";
  if (
    c === "1:1" ||
    c === "1:1..N" ||
    c === "1..N:1" ||
    c === "N:N" ||
    c === "1:0..1" ||
    c === "0..1:1" ||
    c === "1:0..N" ||
    c === "0..N:1"
  ) {
    return c;
  }
  return "1:1..N";
}

export function displayCardinality(card: string | undefined | null): string {
  return normalizeCardinality(card);
}

export function cardSideIsMany(side: string): boolean {
  const t = side.trim().toUpperCase();
  if (t === "1" || t === "0..1") return false;
  if (t === "N" || t === "1..N" || t === "0..N" || t === "*") return true;
  return t.includes("N");
}

/** 비식별관계(FK가 자식 PK에 없음)면 점선, 식별관계(FK가 자식 PK에 포함)면 실선 */
export function relationLineDashed(rel: ErRelation): boolean {
  return !rel.isIdentifying;
}

export function inferRelationMetadata(
  project: ErProject,
  rel: ErRelation
): Pick<ErRelation, "cardinality" | "isIdentifying"> {
  const fromT = project.tables.find((t) => t.name === rel.fromTable || t.id === rel.fromTable);
  const toT = project.tables.find((t) => t.name === rel.toTable || t.id === rel.toTable);
  if (!fromT || !toT) {
    return {
      cardinality: normalizeCardinality(rel.cardinality),
      isIdentifying: Boolean(rel.isIdentifying),
    };
  }
  const cols = inferRelationColumns(project, rel.fromTable, rel.toTable);
  const inferred = inferParentChildTables(fromT, toT);
  const parent = inferred?.parent || fromT;
  const child = inferred?.child || toT;
  const parentCol = preferParentPkColumn(
    parent,
    parent.name === fromT.name ? cols.fromColumn : cols.toColumn
  );
  const childColName = preferChildFkColumn(
    child,
    parent,
    parentCol,
    child.name === fromT.name ? cols.fromColumn : cols.toColumn
  );
  const childCol = child.columns.find((c) => c.name === childColName);
  const isIdentifying = Boolean(childCol?.isFk && childCol?.isPk);
  const cardinality = normalizeCardinality(
    rel.cardinality || (childCol && !childCol.notNull ? "1:0..N" : "1:1..N")
  );
  return { cardinality, isIdentifying };
}

export function syncRelationsMetadata(project: ErProject): ErProject {
  return {
    ...project,
    relations: project.relations.map((rel) => {
      const cols = inferRelationColumns(project, rel.fromTable, rel.toTable);
      const merged = { ...rel, fromColumn: cols.fromColumn, toColumn: cols.toColumn };
      const meta = inferRelationMetadata(project, merged);
      const nextId = `${rel.fromTable}:${cols.fromColumn}->${rel.toTable}:${cols.toColumn}`;
      return normalizeRelation({
        ...merged,
        id: nextId,
        isIdentifying: meta.isIdentifying,
        cardinality: rel.cardinality ? normalizeCardinality(rel.cardinality) : meta.cardinality,
      });
    }),
  };
}

export type NameDisplayMode = "both" | "en" | "ko";

export type HandleSide = "L" | "R" | "T" | "B";

export type ErRelation = {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  /** from → to 방향. 카디널리티 왼쪽은 from, 오른쪽은 to (예: 1:1..N = from이 1, to가 1..N) */
  cardinality: RelationCardinality;
  /** FK 컬럼이 자식 PK에 포함되면 식별관계(실선) */
  isIdentifying?: boolean;
  /** 직교 관계선의 세로 구간을 좌우로 옮긴 거리(px) */
  pathOffset?: number;
  /** 시작 쪽 가로선(연결점)을 컬럼 기본 위치에서 위아래로 옮긴 거리(px) */
  fromYOffset?: number;
  toYOffset?: number;
  /** 위/아래 가장자리 연결 시 좌우로 옮긴 거리(px) */
  fromXOffset?: number;
  toXOffset?: number;
  /** 연결이 시작된 테이블 쪽 (L=왼쪽, R=오른쪽). 기본 R */
  fromSide?: HandleSide;
  /** 연결이 도착한 테이블 쪽. 기본 L */
  toSide?: HandleSide;
};

export type EdgePathLayout = {
  pathOffset: number;
  fromYOffset: number;
  toYOffset: number;
  fromXOffset: number;
  toXOffset: number;
};

export type ErProject = {
  id: string;
  name: string;
  updatedAt: string;
  dbName: string;
  schema: string;
  sheet: string;
  designFormat: "flat" | "block" | "sql";
  sourceFilename?: string;
  systemName?: string;
  createdDate?: string;
  author?: string;
  tables: ErTable[];
  relations: ErRelation[];
  templateBase64?: string;
};

export type ImportMeta = {
  sheet: string;
  designFormat: "flat" | "block" | "sql";
  dbName: string;
  schema: string;
  tables: number;
  columns: number;
  relations: number;
  warnings?: string[];
  systemName?: string;
  createdDate?: string;
  author?: string;
};

export type ImportResponse = {
  ok: boolean;
  source_filename: string;
  meta: ImportMeta;
  tables: Omit<ErTable, "position">[];
  relations: ErRelation[];
};

export function createEmptyProject(name = "새 ER 모델"): ErProject {
  const id = newId();
  return {
    id,
    name,
    updatedAt: new Date().toISOString(),
    dbName: "dbm",
    schema: "db1",
    sheet: "테이블정의서",
    designFormat: "flat",
    systemName: "",
    createdDate: todayDate(),
    author: "",
    tables: [],
    relations: [],
  };
}

export function todayDate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `er-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseDataType(
  raw: string,
  length?: number | null
): { dataType: string; length: number | null } {
  const text = (raw || "VARCHAR2").trim().toUpperCase();
  const packed = text.match(/^([A-Z][A-Z0-9_]*)\s*\(\s*(\d+)\s*\)\s*$/);
  if (packed) {
    return {
      dataType: packed[1],
      length: Number(packed[2]),
    };
  }
  const open = text.match(/^([A-Z][A-Z0-9_]*)\s*\(\s*(\d*)\s*\)?$/);
  if (open) {
    return {
      dataType: open[1],
      length: open[2] ? Number(open[2]) : null,
    };
  }
  const dataType = text.replace(/\(.*$/, "").trim() || "VARCHAR2";
  if (
    dataType === "DATE" ||
    dataType === "TIMESTAMP" ||
    dataType === "CLOB" ||
    dataType === "NCLOB" ||
    dataType === "BLOB"
  ) {
    return { dataType, length: null };
  }
  return { dataType, length: length ?? null };
}

export function normalizeColumn(raw: Partial<ErColumn> & { name: string }): ErColumn {
  const parsed = parseDataType(raw.dataType || "VARCHAR2", raw.length ?? null);
  return {
    name: raw.name.trim().toLowerCase(),
    koreanName: (raw.koreanName || "").trim(),
    dataType: parsed.dataType,
    length: parsed.length,
    isPk: Boolean(raw.isPk),
    notNull: Boolean(raw.isPk) || Boolean(raw.notNull),
    isFk: Boolean(raw.isFk),
    fkRef: raw.fkRef ?? null,
    comment: raw.comment ?? null,
    indexKey: raw.indexKey ?? null,
    isUk: Boolean(raw.isUk),
    defaultValue: raw.defaultValue ?? null,
  };
}

export function normalizeTable(raw: Partial<ErTable> & { name: string }): ErTable {
  const name = raw.name.trim().toLowerCase();
  return {
    id: raw.id || name,
    name,
    koreanName: (raw.koreanName || "").trim(),
    columns: (raw.columns || []).map((c) =>
      normalizeColumn({ ...c, name: c.name || "col" })
    ),
    position: raw.position || { x: 0, y: 0 },
  };
}

export function normalizeRelation(
  raw: Partial<ErRelation> &
    Pick<ErRelation, "id" | "fromTable" | "fromColumn" | "toTable" | "toColumn">
): ErRelation {
  const card = normalizeCardinality(raw.cardinality);
  const side = (v: unknown, fallback: HandleSide): HandleSide =>
    v === "L" || v === "R" || v === "T" || v === "B" ? v : fallback;
  return {
    id: raw.id,
    fromTable: raw.fromTable,
    fromColumn: raw.fromColumn,
    toTable: raw.toTable,
    toColumn: raw.toColumn,
    cardinality: card,
    isIdentifying: Boolean(raw.isIdentifying),
    pathOffset: typeof raw.pathOffset === "number" ? raw.pathOffset : 0,
    fromYOffset: typeof raw.fromYOffset === "number" ? raw.fromYOffset : 0,
    toYOffset: typeof raw.toYOffset === "number" ? raw.toYOffset : 0,
    fromXOffset: typeof raw.fromXOffset === "number" ? raw.fromXOffset : 0,
    toXOffset: typeof raw.toXOffset === "number" ? raw.toXOffset : 0,
    fromSide: side(raw.fromSide, "R"),
    toSide: side(raw.toSide, "L"),
  };
}

export function hydrateProject(raw: ErProject): ErProject {
  const base = createEmptyProject();
  const existingRels = raw.relations || [];
  const relById = Object.fromEntries(existingRels.map((r) => [r.id, r]));
  const hydrated: ErProject = {
    ...base,
    ...raw,
    systemName: raw.systemName || "",
    createdDate: raw.createdDate || "",
    author: raw.author || "",
    tables: (raw.tables || []).map((t) => normalizeTable(t)),
    relations: (raw.relations || []).map((r) =>
      normalizeRelation({
        ...r,
        cardinality: normalizeCardinality(
          r.cardinality ?? relById[r.id]?.cardinality ?? "1:1..N"
        ),
        isIdentifying: r.isIdentifying ?? relById[r.id]?.isIdentifying,
      })
    ),
  };
  return syncRelationsMetadata(hydrated);
}

export function columnHandleId(
  tableName: string,
  columnName: string,
  side: HandleSide = "R"
): string {
  return `${tableName}:${columnName}__${side}`;
}

export function formatTableTitle(
  name: string,
  koreanName: string,
  mode: NameDisplayMode
): string {
  if (mode === "en") return name;
  if (mode === "ko") return koreanName || name;
  return koreanName ? `${koreanName} (${name})` : name;
}

export function formatColumnLabel(
  name: string,
  koreanName: string,
  mode: NameDisplayMode
): string {
  if (mode === "en") return name;
  if (mode === "ko") return koreanName || name;
  return koreanName ? `${name} · ${koreanName}` : name;
}

export function formatColumnType(dataType: string, length?: number | null): string {
  const parsed = parseDataType(dataType, length ?? null);
  const t = parsed.dataType;
  if (!t) return "";
  return parsed.length ? `${t}(${parsed.length})` : t;
}

export const EDGE_COLUMN = "*";

/** 두 테이블 간 FK/PK 쌍 추론 (연결선 위치와 무관) */
export function inferRelationColumns(
  project: ErProject,
  fromTableName: string,
  toTableName: string
): { fromColumn: string; toColumn: string } {
  const fromT = project.tables.find(
    (t) => t.name === fromTableName || t.id === fromTableName
  );
  const toT = project.tables.find(
    (t) => t.name === toTableName || t.id === toTableName
  );
  if (!fromT || !toT) return { fromColumn: EDGE_COLUMN, toColumn: EDGE_COLUMN };

  const parseRef = (fkRef: string | null | undefined) => {
    const m = String(fkRef || "").trim().match(/^(.+?)\((.+)\)$/);
    if (!m) return null;
    return {
      table: m[1].replace(/^.*\./, "").trim().toLowerCase(),
      column: m[2].trim(),
    };
  };

  for (const col of fromT.columns) {
    if (!col.isFk) continue;
    const ref = parseRef(col.fkRef);
    if (ref && ref.table === toT.name.toLowerCase()) {
      return { fromColumn: col.name, toColumn: ref.column };
    }
  }
  for (const col of toT.columns) {
    if (!col.isFk) continue;
    const ref = parseRef(col.fkRef);
    if (ref && ref.table === fromT.name.toLowerCase()) {
      return { fromColumn: ref.column, toColumn: col.name };
    }
  }
  for (const col of fromT.columns) {
    if (!col.isFk) continue;
    const pk = toT.columns.find(
      (c) => c.isPk && c.name.toLowerCase() === col.name.toLowerCase()
    );
    if (pk) return { fromColumn: col.name, toColumn: pk.name };
  }
  for (const col of toT.columns) {
    if (!col.isFk) continue;
    const pk = fromT.columns.find(
      (c) => c.isPk && c.name.toLowerCase() === col.name.toLowerCase()
    );
    if (pk) return { fromColumn: pk.name, toColumn: col.name };
  }
  return { fromColumn: EDGE_COLUMN, toColumn: EDGE_COLUMN };
}

export function parseHandleId(
  handle: string
): { table: string; column: string; side: HandleSide } | null {
  let side: HandleSide = "R";
  let raw = handle;
  const m = raw.match(/__(L|R|T|B)$/);
  if (m) {
    side = m[1] as HandleSide;
    raw = raw.slice(0, -3);
  }
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  return {
    table: raw.slice(0, idx),
    column: raw.slice(idx + 1),
    side,
  };
}

export function syncRelationsToColumns(project: ErProject): ErProject {
  return project;
}

export function pkColumnNames(table: ErTable): string[] {
  return table.columns.filter((c) => c.isPk).map((c) => c.name);
}

export function inferParentChildTables(
  a: ErTable,
  b: ErTable
): { parent: ErTable; child: ErTable } | null {
  const aPk = pkColumnNames(a);
  const bPk = pkColumnNames(b);
  const aCols = new Set(a.columns.map((c) => c.name.toLowerCase()));
  const bCols = new Set(b.columns.map((c) => c.name.toLowerCase()));
  const aPkInB = aPk.length > 0 && aPk.every((n) => bCols.has(n.toLowerCase()));
  const bPkInA = bPk.length > 0 && bPk.every((n) => aCols.has(n.toLowerCase()));
  if (aPkInB && !bPkInA) return { parent: a, child: b };
  if (bPkInA && !aPkInB) return { parent: b, child: a };
  if (aPkInB && bPkInA) return { parent: a, child: b };
  return null;
}

export function preferParentPkColumn(parent: ErTable, hinted?: string | null): string {
  const hint = parent.columns.find((c) => c.name === hinted);
  if (hint?.isPk) return hint.name;
  const pks = parent.columns.filter((c) => c.isPk);
  if (pks.length === 1) return pks[0].name;
  if (hint) return hint.name;
  return pks[0]?.name || parent.columns[0]?.name || "id";
}

export function preferChildFkColumn(
  child: ErTable,
  parent: ErTable,
  parentCol: string,
  hinted?: string | null
): string {
  const byName = child.columns.find(
    (c) => c.name.toLowerCase() === parentCol.toLowerCase()
  );
  if (byName) return byName.name;
  const byRef = child.columns.find((c) => {
    const text = String(c.fkRef || "");
    const m = text.match(/^(.+?)\((.+)\)$/);
    if (!m) return false;
    const table = m[1].replace(/^.*\./, "").trim().toLowerCase();
    const col = m[2].trim().toLowerCase();
    return (
      (table === parent.name.toLowerCase() || table === parent.id.toLowerCase()) &&
      col === parentCol.toLowerCase()
    );
  });
  if (byRef) return byRef.name;
  if (hinted && child.columns.some((c) => c.name === hinted)) return hinted;
  return child.columns[0]?.name || parentCol;
}

export function isIdentifyingOneToOne(child: ErTable, childFkCol: string): boolean {
  const pks = pkColumnNames(child).map((n) => n.toLowerCase());
  if (!pks.length) return false;
  return pks.length === 1 && pks[0] === childFkCol.toLowerCase();
}

export function orientRelation(
  project: ErProject,
  rel: ErRelation
): ErRelation {
  const fromT = project.tables.find(
    (t) => t.name === rel.fromTable || t.id === rel.fromTable
  );
  const toT = project.tables.find(
    (t) => t.name === rel.toTable || t.id === rel.toTable
  );
  if (!fromT || !toT) return rel;
  const inferred = inferParentChildTables(fromT, toT);
  const parent = inferred?.parent || fromT;
  const child = inferred?.child || toT;
  const parentCol = preferParentPkColumn(
    parent,
    parent.name === fromT.name ? rel.fromColumn : rel.toColumn
  );
  const childCol = preferChildFkColumn(
    child,
    parent,
    parentCol,
    child.name === fromT.name ? rel.fromColumn : rel.toColumn
  );
  const oneToOne = isIdentifyingOneToOne(child, childCol);
  const card = normalizeCardinality(rel.cardinality || "1:1..N");
  const idx = card.indexOf(":");
  const left = idx >= 0 ? card.slice(0, idx) : "1";
  const right = idx >= 0 ? card.slice(idx + 1) : "N";
  const leftMany = /N|\*/i.test(left);
  const rightMany = /N|\*/i.test(right);
  const wantChildAsFrom = leftMany && !rightMany;
  if (wantChildAsFrom) {
    const id = `${child.name}:${childCol}->${parent.name}:${parentCol}`;
    return normalizeRelation({
      ...rel,
      id,
      fromTable: child.name,
      fromColumn: childCol,
      toTable: parent.name,
      toColumn: parentCol,
      cardinality: oneToOne ? "1:1" : card,
    });
  }
  const nextCard = oneToOne && (leftMany || rightMany) ? "1:1" : card || "1:1..N";
  const id = `${parent.name}:${parentCol}->${child.name}:${childCol}`;
  return normalizeRelation({
    ...rel,
    id,
    fromTable: parent.name,
    fromColumn: parentCol,
    toTable: child.name,
    toColumn: childCol,
    cardinality:
      nextCard === "1:1..N" && oneToOne ? "1:1" : normalizeCardinality(nextCard),
  });
}

export function formatFkRef(tableName: string, columnName: string): string {
  return `${tableName}(${columnName})`;
}

function findTable(project: ErProject, nameOrId: string): ErTable | undefined {
  return project.tables.find((t) => t.name === nameOrId || t.id === nameOrId);
}

function relatedTables(project: ErProject, table: ErTable): ErTable[] {
  const names = new Set<string>();
  for (const rel of project.relations || []) {
    if (rel.fromTable === table.name || rel.fromTable === table.id) {
      names.add(rel.toTable);
    }
    if (rel.toTable === table.name || rel.toTable === table.id) {
      names.add(rel.fromTable);
    }
  }
  return project.tables.filter((t) => names.has(t.name) || names.has(t.id));
}

export function matchingFkRefForColumn(
  project: ErProject,
  childTableName: string,
  columnName: string
): string | null {
  const child = findTable(project, childTableName);
  if (!child || !columnName) return null;
  const want = columnName.toLowerCase();
  for (const parent of relatedTables(project, child)) {
    const pk = parent.columns.find(
      (c) => c.isPk && c.name.toLowerCase() === want
    );
    if (pk) return formatFkRef(parent.name, pk.name);
  }
  return null;
}

export function applyMatchingFkRefs(
  project: ErProject,
  tableAName: string,
  tableBName: string
): ErProject {
  const a = findTable(project, tableAName);
  const b = findTable(project, tableBName);
  if (!a || !b) return project;

  const fillChild = (child: ErTable, parent: ErTable): ErTable => ({
    ...child,
    columns: child.columns.map((col) => {
      if (!col.isFk) return col;
      const pk = parent.columns.find(
        (c) => c.isPk && c.name.toLowerCase() === col.name.toLowerCase()
      );
      if (!pk) return col;
      return { ...col, fkRef: formatFkRef(parent.name, pk.name) };
    }),
  });

  return {
    ...project,
    tables: project.tables.map((t) => {
      if (t.id === a.id || t.name === a.name) return fillChild(t, b);
      if (t.id === b.id || t.name === b.name) return fillChild(t, a);
      return t;
    }),
  };
}

export function rewriteFkRefsForRenamedTable(
  tables: ErTable[],
  oldTableName: string,
  newTableName: string
): ErTable[] {
  const oldN = oldTableName.trim().toLowerCase();
  if (!oldN || oldN === newTableName.trim().toLowerCase()) return tables;
  return tables.map((t) => ({
    ...t,
    columns: t.columns.map((c) => {
      const text = String(c.fkRef || "").trim();
      const m = text.match(/^(.+?)\((.+)\)$/);
      if (!m) return c;
      const tablePart = m[1].trim();
      const tableOnly = tablePart.replace(/^.*\./, "");
      if (tableOnly.toLowerCase() !== oldN) return c;
      const prefix = tablePart.slice(0, tablePart.length - tableOnly.length);
      return { ...c, fkRef: `${prefix}${newTableName}(${m[2].trim()})` };
    }),
  }));
}

export function syncColumnsToRelations(project: ErProject): ErProject {
  return syncRelationsMetadata({
    ...project,
    relations: (project.relations || []).map((r) => normalizeRelation(r)),
  });
}
