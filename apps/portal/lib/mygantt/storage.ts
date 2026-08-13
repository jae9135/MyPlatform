import {
  createEmptyProject,
  normalizeTask,
  type Project,
} from "./types";

const LEGACY_KEY = "mygantt.project.v1";
const LIBRARY_KEY = "mygantt.library.v1";
const ACTIVE_KEY = "mygantt.active.v1";

export type LibraryItem = {
  id: string;
  updatedAt: string;
  shareId: string | null;
  editKey: string | null;
  project: Project;
};

export type LibraryState = {
  items: LibraryItem[];
  activeId: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hydrateProject(raw: Project): Project {
  const base = createEmptyProject();
  return {
    ...base,
    ...raw,
    holidays: raw.holidays ?? [],
    tasks: (raw.tasks ?? []).map((t) => normalizeTask(t)),
    displayWeek: raw.displayWeek || 1,
    startDate: raw.startDate || base.startDate,
    endDate: raw.endDate || base.endDate,
    asOfDate: raw.asOfDate || base.asOfDate,
  };
}

function makeItem(project: Project, extra?: Partial<LibraryItem>): LibraryItem {
  return {
    id: extra?.id || newId(),
    updatedAt: extra?.updatedAt || new Date().toISOString(),
    shareId: extra?.shareId ?? null,
    editKey: extra?.editKey ?? null,
    project: hydrateProject(project),
  };
}

export function loadLibrary(): LibraryState {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { items?: LibraryItem[] };
      const items = (parsed.items ?? [])
        .filter((it) => it && it.id && it.project)
        .map((it) => makeItem(it.project, it));
      if (items.length) {
        const savedActive = localStorage.getItem(ACTIVE_KEY);
        const activeId =
          (savedActive && items.some((i) => i.id === savedActive)
            ? savedActive
            : items[0].id) as string;
        return { items, activeId };
      }
    }
  } catch {
    /* migrate below */
  }

  const legacy = loadLegacyProject();
  const item = makeItem(legacy);
  persistLibrary([item], item.id);
  return { items: [item], activeId: item.id };
}

function loadLegacyProject(): Project {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return createEmptyProject();
    const parsed = JSON.parse(raw) as Project;
    if (!parsed || !Array.isArray(parsed.tasks)) return createEmptyProject();
    return hydrateProject(parsed);
  } catch {
    return createEmptyProject();
  }
}

export function persistLibrary(items: LibraryItem[], activeId: string): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify({ items }));
  localStorage.setItem(ACTIVE_KEY, activeId);
}

export function upsertActive(
  state: LibraryState,
  project: Project,
  share?: { shareId: string | null; editKey: string | null },
): LibraryState {
  const items = state.items.map((it) =>
    it.id === state.activeId
      ? {
          ...it,
          project,
          updatedAt: new Date().toISOString(),
          shareId: share ? share.shareId : it.shareId,
          editKey: share ? share.editKey : it.editKey,
        }
      : it,
  );
  persistLibrary(items, state.activeId);
  return { items, activeId: state.activeId };
}

export function addProject(
  state: LibraryState,
  project: Project = createEmptyProject(),
): LibraryState {
  const item = makeItem(project);
  const items = [...state.items, item];
  persistLibrary(items, item.id);
  return { items, activeId: item.id };
}

export function duplicateActive(state: LibraryState): LibraryState {
  const cur = state.items.find((i) => i.id === state.activeId);
  if (!cur) return addProject(state);
  const copy = hydrateProject({
    ...cur.project,
    name: `${cur.project.name || "프로젝트"} 복사`,
  });
  return addProject(state, copy);
}

export function removeActive(state: LibraryState): LibraryState {
  const rest = state.items.filter((i) => i.id !== state.activeId);
  if (!rest.length) {
    const item = makeItem(createEmptyProject());
    persistLibrary([item], item.id);
    return { items: [item], activeId: item.id };
  }
  persistLibrary(rest, rest[0].id);
  return { items: rest, activeId: rest[0].id };
}

export function switchActive(state: LibraryState, id: string): LibraryState {
  if (!state.items.some((i) => i.id === id)) return state;
  persistLibrary(state.items, id);
  return { ...state, activeId: id };
}

export function getActive(state: LibraryState): LibraryItem {
  return (
    state.items.find((i) => i.id === state.activeId) ??
    state.items[0] ??
    makeItem(createEmptyProject())
  );
}

/** @deprecated kept for callers that still expect a single project */
export function loadProject(): Project {
  return getActive(loadLibrary()).project;
}

export function saveProject(project: Project): void {
  const state = loadLibrary();
  upsertActive(state, project);
}

export function clearProject(): void {
  const state = loadLibrary();
  upsertActive(state, createEmptyProject());
}
