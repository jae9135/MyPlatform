import {
  createEmptyProject,
  hydrateProject,
  newId,
  type ErProject,
} from "./types";

const LIBRARY_KEY = "er-modeler.library.v1";
const ACTIVE_KEY = "er-modeler.active.v1";

export type LibraryItem = {
  id: string;
  updatedAt: string;
  project: ErProject;
};

export type LibraryState = {
  items: LibraryItem[];
  activeId: string;
};

function makeItem(project: ErProject, extra?: Partial<LibraryItem>): LibraryItem {
  return {
    id: extra?.id || project.id || newId(),
    updatedAt: extra?.updatedAt || new Date().toISOString(),
    project: hydrateProject({ ...project, id: extra?.id || project.id || newId() }),
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
          savedActive && items.some((i) => i.id === savedActive)
            ? savedActive
            : items[0].id;
        return { items, activeId };
      }
    }
  } catch {
    /* fall through */
  }

  const item = makeItem(createEmptyProject());
  persistLibrary([item], item.id);
  return { items: [item], activeId: item.id };
}

export function persistLibrary(items: LibraryItem[], activeId: string): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify({ items }));
  localStorage.setItem(ACTIVE_KEY, activeId);
}

export function upsertActive(state: LibraryState, project: ErProject): LibraryState {
  const updated: ErProject = {
    ...hydrateProject(project),
    updatedAt: new Date().toISOString(),
  };
  const items = state.items.map((it) =>
    it.id === state.activeId
      ? { ...it, project: updated, updatedAt: updated.updatedAt }
      : it
  );
  persistLibrary(items, state.activeId);
  return { items, activeId: state.activeId };
}

export function addProject(
  state: LibraryState,
  project: ErProject = createEmptyProject()
): LibraryState {
  const item = makeItem(project);
  const items = [...state.items, item];
  persistLibrary(items, item.id);
  return { items, activeId: item.id };
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

export async function fileToBase64(file: File): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("file read failed"));
          return;
        }
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
      reader.readAsDataURL(file);
    });
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
