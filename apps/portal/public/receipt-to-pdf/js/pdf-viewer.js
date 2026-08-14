/**
 * PDF viewer using PDF.js with mobile embed fallback.
 */

import { downloadBlobToDevice, openBlobInNewTab } from "./device-download.js";

const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs";
const WORKER_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(PDFJS_CDN);
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDN;
  return pdfjsLib;
}

function blobToArrayBuffer(blob) {
  return blob.arrayBuffer();
}

function renderPdfEmbedFallback(blob, container) {
  container.innerHTML = "";
  const url = URL.createObjectURL(blob);

  const embed = document.createElement("iframe");
  embed.className = "pdf-embed-fallback";
  embed.src = url;
  embed.title = "PDF preview";
  container.appendChild(embed);

  const hint = document.createElement("p");
  hint.className = "pdf-error-hint";
  hint.textContent = "위에 PDF가 안 보이면 「다운로드」를 누르세요.";
  container.appendChild(hint);

  container._pdfObjectUrl = url;
}

function clearPdfContainer(container) {
  if (container._pdfObjectUrl) {
    URL.revokeObjectURL(container._pdfObjectUrl);
    container._pdfObjectUrl = null;
  }
}

/**
 * Render all pages of a PDF blob into a container element.
 */
export async function renderPdfToContainer(blob, container) {
  clearPdfContainer(container);
  container.innerHTML = '<p class="pdf-loading">PDF 불러오는 중...</p>';

  if (!blob || blob.size === 0) {
    container.innerHTML = '<p class="pdf-error">PDF 파일이 비어 있습니다.</p>';
    return;
  }

  try {
    const lib = await loadPdfJs();
    const data = await blobToArrayBuffer(blob);
    const pdf = await lib.getDocument({ data }).promise;

    container.innerHTML = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const containerWidth = container.clientWidth || window.innerWidth - 40;
      const scale = Math.min(2, (containerWidth - 16) / baseViewport.width);
      const viewport = page.getViewport({ scale });

      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page-wrap";

      if (pdf.numPages > 1) {
        const label = document.createElement("div");
        label.className = "preview-page-label";
        label.textContent = `${pageNum} / ${pdf.numPages} 페이지`;
        wrapper.appendChild(label);
      }

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page-canvas";
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);

      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
    }
  } catch (err) {
    console.warn("PDF.js render failed, using embed fallback:", err);
    renderPdfEmbedFallback(blob, container);
  }
}

export function openPdfInNewTab(blob) {
  if (!blob || blob.size === 0) return null;
  openBlobInNewTab(blob);
  return true;
}

export async function downloadPdfBlob(blob, filename) {
  return downloadBlobToDevice(blob, filename || "document.pdf");
}

export function clearPdfViewerContainer(container) {
  if (container) clearPdfContainer(container);
}
