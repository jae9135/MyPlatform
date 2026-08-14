export type Kind = "deliverable" | "template" | "reference";
export type Tab = "biz" | "dev";

export type ShellFile = {
  path: string;
  name: string;
  folder: string;
  label?: string;
};

export type CatalogItem = {
  id: string;
  tab: string;
  phase: string;
  code: string;
  activity: string;
  task: string;
  output: string;
  size_large: string | null;
  size_medium: string | null;
  size_small: string | null;
  files: Record<Kind, ShellFile[]>;
};

export type Catalog = {
  version: number;
  public?: boolean;
  placeholder?: boolean;
  bucket: string;
  prefix: string;
  kinds: Record<Kind, string>;
  reference_sites?: { id: string; label: string; folder: string }[];
  tabs: Record<string, CatalogItem[]>;
  stats?: { items: number; files: number };
};

const KINDS: Kind[] = ["deliverable", "template", "reference"];

export function isKind(value: string): value is Kind {
  return KINDS.includes(value as Kind);
}

export function filesFor(item: CatalogItem, kind: Kind): ShellFile[] {
  const raw = item.files?.[kind] as ShellFile | ShellFile[] | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function publicObjectUrl(objectPath: string): string | null {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base || base.includes("YOUR_PROJECT")) return null;
  const encoded = objectPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${base}/storage/v1/object/public/samples/deliverable-manager/${encoded}`;
}

export async function loadCatalog(): Promise<Catalog> {
  const remote = publicObjectUrl("catalog.json");
  const urls = [remote, "/deliverable-manager/catalog.json"].filter(Boolean) as string[];
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        lastError = new Error(`${url} (${res.status})`);
        continue;
      }
      return (await res.json()) as Catalog;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("catalog.json을 불러오지 못했습니다.");
}

export async function loadShellBody(
  item: CatalogItem,
  file: ShellFile,
): Promise<{ text: string; from: "storage" | "local" }> {
  const remote = publicObjectUrl(file.path);
  if (remote) {
    const res = await fetch(remote, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("FILE_MISSING");
    }
    return { text: await res.text(), from: "storage" };
  }
  return {
    text: `${file.folder} / ${item.output}\n`,
    from: "local",
  };
}
