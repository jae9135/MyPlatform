/**
 * IndexedDB storage for receipt photos on the mobile device.
 */

import { openDb, STORE_META } from "./pdf-storage.js";

const RECEIPTS_KEY = "receipt_list";
const LEGACY_SESSION_KEY = "receipttopdf_receipts";

export function receiptToStorage(receipt) {
  return {
    id: receipt.id,
    name: receipt.name,
    dataUrl: receipt.dataUrl,
    width: receipt.width,
    height: receipt.height,
    fullPage: !!receipt.fullPage,
    addedAt: receipt.addedAt,
  };
}

export function receiptFromStorage(raw) {
  return { ...raw, fullPage: !!raw.fullPage, _img: null };
}

export async function saveReceiptsToDevice(receipts) {
  const db = await openDb();
  const payload = {
    key: RECEIPTS_KEY,
    receipts: receipts.map(receiptToStorage),
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put(payload);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function loadLegacySessionReceipts() {
  try {
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map(receiptFromStorage);
  } catch {
    return [];
  }
}

export async function loadReceiptsFromDevice() {
  try {
    const db = await openDb();
    const fromIdb = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readonly");
      const request = tx.objectStore(STORE_META).get(RECEIPTS_KEY);
      request.onsuccess = () => {
        const row = request.result;
        if (!row?.receipts?.length) resolve([]);
        else resolve(row.receipts.map(receiptFromStorage));
      };
      request.onerror = () => reject(request.error);
    });

    if (fromIdb.length > 0) return fromIdb;

    const legacy = loadLegacySessionReceipts();
    if (legacy.length > 0) {
      await saveReceiptsToDevice(legacy);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      return legacy;
    }

    return [];
  } catch (err) {
    console.error("IndexedDB receipt load failed:", err);
    return loadLegacySessionReceipts();
  }
}
