/**
 * PDF export using pdf-lib (loaded globally as PDFLib).
 */

import { downloadBlobToDevice } from "./device-download.js";
import { A4_WIDTH_MM, A4_HEIGHT_MM, MARGIN_MM, planPages } from "./layout.js";

const MM_TO_PT = 72 / 25.4;

function mmToPt(mm) {
  return mm * MM_TO_PT;
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function buildPdfBytes(receipts) {
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const pages = planPages(receipts);

  const pageW = mmToPt(A4_WIDTH_MM);
  const pageH = mmToPt(A4_HEIGHT_MM);
  const margin = mmToPt(MARGIN_MM);

  for (const page of pages) {
    const pdfPage = pdfDoc.addPage([pageW, pageH]);

    for (const { receipt, rect } of page.placements) {
      const imgBytes = dataUrlToUint8Array(receipt.dataUrl);
      const embedded = await pdfDoc.embedJpg(imgBytes);

      const x = margin + mmToPt(rect.x);
      const y = pageH - margin - mmToPt(rect.y) - mmToPt(rect.h);
      const w = mmToPt(rect.w);
      const h = mmToPt(rect.h);

      pdfPage.drawImage(embedded, { x, y, width: w, height: h });
    }
  }

  return pdfDoc.save();
}

/**
 * Build PDF bytes and save to the mobile device.
 */
export async function exportToPdf(receipts, filename, { autoDownload = true } = {}) {
  const pdfBytes = await buildPdfBytes(receipts);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  if (!autoDownload) {
    return { blob, downloadResult: "app-only" };
  }
  const result = await downloadBlobToDevice(blob, filename);
  return { blob, downloadResult: result };
}

export function defaultFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `receipts_${y}${m}${d}_${h}${min}.pdf`;
}

export function openPdfBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
