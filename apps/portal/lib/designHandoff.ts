export type DesignHandoffMeta = {
  filename: string;
  sheet?: string;
  from?: string;
};

type StoredHandoff = {
  blob: Blob;
  meta: DesignHandoffMeta;
};

const IDB_NAME = "myplatform-portal-v1";
const STORE = "handoffs";
const KEY = "design-for-chk";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDesignHandoff(
  file: File,
  meta: DesignHandoffMeta
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ blob: file, meta } satisfies StoredHandoff, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadDesignHandoff(): Promise<{
  file: File;
  meta: DesignHandoffMeta;
} | null> {
  const db = await openDb();
  try {
    const stored = await new Promise<StoredHandoff | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as StoredHandoff | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!stored?.blob || !stored.meta?.filename) return null;
    const file = new File([stored.blob], stored.meta.filename, {
      type:
        stored.blob.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return { file, meta: stored.meta };
  } finally {
    db.close();
  }
}

export async function clearDesignHandoff(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
