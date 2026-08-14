/**
 * IndexedDB storage for generated PDFs (in-app reload).
 */

const DB_NAME = "receipttopdf";
const DB_VERSION = 3;
export const STORE_PDFS = "pdfs";
export const STORE_META = "meta";

export function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
  });
}

function toBlob(record) {
  if (record.blob instanceof Blob && record.blob.size > 0) {
    return record.blob;
  }
  if (record.data instanceof ArrayBuffer && record.data.byteLength > 0) {
    const copy = record.data.slice(0);
    return new Blob([copy], { type: "application/pdf" });
  }
  if (record.data && record.data.byteLength > 0) {
    return new Blob([record.data], { type: "application/pdf" });
  }
  return null;
}

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function savePdfRecord(name, blob) {
  const db = await openDb();
  const data = await blob.arrayBuffer();
  const record = {
    id: newId(),
    name,
    createdAt: Date.now(),
    data,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, "readwrite");
    tx.objectStore(STORE_PDFS).put(record);
    tx.oncomplete = () => resolve({ ...record, blob });
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPdfs() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, "readonly");
    const request = tx.objectStore(STORE_PDFS).getAll();
    request.onsuccess = () => {
      const items = request.result
        .map((r) => ({ ...r, blob: toBlob(r) }))
        .filter((r) => r.blob)
        .sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPdf(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, "readonly");
    const request = tx.objectStore(STORE_PDFS).get(id);
    request.onsuccess = () => {
      const record = request.result;
      if (!record) resolve(null);
      else resolve({ ...record, blob: toBlob(record) });
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deletePdfRecord(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, "readwrite");
    tx.objectStore(STORE_PDFS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}
