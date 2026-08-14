/**
 * Main application — state, UI events, preview modal.
 */

import { isWhitenEnabled, setWhitenEnabled } from "./background.js";
import { processImageFile } from "./camera.js";
import { saveReceiptsToDevice, loadReceiptsFromDevice } from "./receipt-storage.js";
import { planPages, renderPagePreview } from "./layout.js";
import { exportToPdf, defaultFilename } from "./pdf-export.js";
import { downloadResultMessage, isInAppBrowser, getInAppBrowserName } from "./device-download.js";
import {
  savePdfRecord,
  listPdfs,
  getPdf,
  deletePdfRecord,
  formatDate,
} from "./pdf-storage.js";
import {
  renderPdfToContainer,
  downloadPdfBlob,
  clearPdfViewerContainer,
} from "./pdf-viewer.js";

const state = {
  receipts: [],
  savedPdfs: [],
  detailIndex: 0,
  currentPdfBlob: null,
  currentPdfName: "",
};

const els = {
  fileInput: document.getElementById("file-input"),
  galleryInput: document.getElementById("gallery-input"),
  pdfFileInput: document.getElementById("pdf-file-input"),
  receiptList: document.getElementById("receipt-list"),
  receiptListHint: document.getElementById("receipt-list-hint"),
  emptyState: document.getElementById("empty-state"),
  receiptCount: document.getElementById("receipt-count"),
  btnPdf: document.getElementById("btn-pdf"),
  btnGallery: document.getElementById("btn-gallery"),
  btnOpenPdf: document.getElementById("btn-open-pdf"),
  whitenToggle: document.getElementById("whiten-toggle"),
  savedPdfSection: document.getElementById("saved-pdf-section"),
  savedPdfList: document.getElementById("saved-pdf-list"),
  previewModal: document.getElementById("preview-modal"),
  previewPages: document.getElementById("preview-pages"),
  btnClosePreview: document.getElementById("btn-close-preview"),
  btnSavePdf: document.getElementById("btn-save-pdf"),
  galleryModal: document.getElementById("gallery-modal"),
  galleryPages: document.getElementById("gallery-pages"),
  btnCloseGallery: document.getElementById("btn-close-gallery"),
  imageDetailModal: document.getElementById("image-detail-modal"),
  imageDetailImg: document.getElementById("image-detail-img"),
  imageDetailTitle: document.getElementById("image-detail-title"),
  btnCloseImageDetail: document.getElementById("btn-close-image-detail"),
  btnPrevImage: document.getElementById("btn-prev-image"),
  btnNextImage: document.getElementById("btn-next-image"),
  pdfViewerModal: document.getElementById("pdf-viewer-modal"),
  pdfViewerPages: document.getElementById("pdf-viewer-pages"),
  pdfViewerTitle: document.getElementById("pdf-viewer-title"),
  btnClosePdfViewer: document.getElementById("btn-close-pdf-viewer"),
  btnPdfDownload: document.getElementById("btn-pdf-download"),
  savedPdfPickerModal: document.getElementById("saved-pdf-picker-modal"),
  savedPdfPickerList: document.getElementById("saved-pdf-picker-list"),
  savedPdfPickerEmpty: document.getElementById("saved-pdf-picker-empty"),
  btnCloseSavedPdfPicker: document.getElementById("btn-close-saved-pdf-picker"),
  btnPickExternalPdf: document.getElementById("btn-pick-external-pdf"),
  inAppBanner: document.getElementById("in-app-banner"),
  toast: document.getElementById("toast"),
  captureLabel: document.getElementById("capture-label"),
  captureModeInputs: document.querySelectorAll('input[name="capture-mode"]'),
};

let toastTimer = 0;

function showToast(message, duration = 2500) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, duration);
}

async function persist() {
  try {
    await saveReceiptsToDevice(state.receipts);
  } catch (err) {
    console.error(err);
    showToast("휴대폰 저장 공간이 부족합니다. 사진 수를 줄여 주세요.", 4000);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateActionButtons() {
  const count = state.receipts.length;
  els.btnPdf.disabled = count === 0;
  els.btnGallery.disabled = count === 0;
}

function moveReceipt(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.receipts.length) return;
  const [item] = state.receipts.splice(index, 1);
  state.receipts.splice(target, 0, item);
  persist().then(() => renderList());
}

function renderList() {
  const count = state.receipts.length;
  els.receiptCount.textContent = `${count}장`;
  updateActionButtons();
  els.emptyState.hidden = count > 0;
  els.receiptList.hidden = count === 0;
  els.receiptListHint.hidden = count < 2;

  els.receiptList.innerHTML = "";

  state.receipts.forEach((receipt, index) => {
    const li = document.createElement("li");
    li.className = "receipt-item";
    li.innerHTML = `
      <span class="receipt-number">${index + 1}</span>
      <button class="receipt-open" type="button" data-index="${index}" aria-label="영수증 ${index + 1} 상세보기">
        <img class="receipt-thumb" src="${receipt.dataUrl}" alt="영수증 ${index + 1}" loading="lazy"
          onerror="this.style.background='#fee2e2';this.alt='미리보기 실패'">
        <div class="receipt-info">
          <div class="name">${escapeHtml(receipt.name)}</div>
          <div class="meta">${receipt.fullPage ? "PDF 1페이지" : "개별 배치"} · ${receipt.width} x ${receipt.height}</div>
        </div>
      </button>
      <div class="receipt-actions">
        <button class="btn-move" type="button" data-dir="up" data-index="${index}" aria-label="위로"
          ${index === 0 ? "disabled" : ""}>&#9650;</button>
        <button class="btn-move" type="button" data-dir="down" data-index="${index}" aria-label="아래로"
          ${index === count - 1 ? "disabled" : ""}>&#9660;</button>
        <button class="btn-delete" type="button" data-id="${receipt.id}">삭제</button>
      </div>
    `;
    els.receiptList.appendChild(li);
  });
}

function renderPdfListItems(container, pdfs, { showDelete = false } = {}) {
  container.innerHTML = "";
  pdfs.forEach((pdf) => {
    const li = document.createElement("li");
    li.className = "pdf-item";
    li.innerHTML = `
      <button class="pdf-item-open" data-id="${pdf.id}">
        <span class="pdf-name">${escapeHtml(pdf.name)}</span>
        <span class="pdf-date">${formatDate(pdf.createdAt)}</span>
      </button>
      ${showDelete ? `<button class="btn-delete" data-pdf-id="${pdf.id}">삭제</button>` : ""}
    `;
    container.appendChild(li);
  });
}

function renderSavedPdfs() {
  const count = state.savedPdfs.length;
  els.savedPdfSection.hidden = count === 0;
  renderPdfListItems(els.savedPdfList, state.savedPdfs, { showDelete: true });
}

function scrollToSavedPdfSection() {
  if (els.savedPdfSection.hidden) return;
  els.savedPdfSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function openSavedPdfPicker() {
  await refreshSavedPdfs();
  const count = state.savedPdfs.length;
  els.savedPdfPickerEmpty.hidden = count > 0;
  els.savedPdfPickerList.hidden = count === 0;
  renderPdfListItems(els.savedPdfPickerList, state.savedPdfs);
  els.savedPdfPickerModal.hidden = false;
}

function closeSavedPdfPicker() {
  els.savedPdfPickerModal.hidden = true;
}

async function refreshSavedPdfs() {
  try {
    state.savedPdfs = await listPdfs();
    renderSavedPdfs();
  } catch (err) {
    console.error(err);
  }
}

function deleteReceipt(id) {
  state.receipts = state.receipts.filter((r) => r.id !== id);
  persist().then(() => renderList());
}

function openImageDetail(index) {
  if (index < 0 || index >= state.receipts.length) return;
  state.detailIndex = index;
  const receipt = state.receipts[index];
  els.imageDetailImg.src = receipt.dataUrl;
  els.imageDetailTitle.textContent = `${index + 1} / ${state.receipts.length}`;
  els.btnPrevImage.disabled = index === 0;
  els.btnNextImage.disabled = index === state.receipts.length - 1;
  els.imageDetailModal.hidden = false;
}

function closeImageDetail() {
  els.imageDetailModal.hidden = true;
  els.imageDetailImg.removeAttribute("src");
}

function showPrevImage() {
  openImageDetail(state.detailIndex - 1);
}

function showNextImage() {
  openImageDetail(state.detailIndex + 1);
}

function openGallery() {
  if (state.receipts.length === 0) return;

  els.galleryPages.innerHTML = "";
  state.receipts.forEach((receipt, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "gallery-item";
    wrapper.innerHTML = `
      <div class="gallery-item-label">${index + 1} / ${state.receipts.length}</div>
      <button type="button" class="gallery-item-btn" data-index="${index}">
        <img src="${receipt.dataUrl}" alt="영수증 ${index + 1}">
      </button>
    `;
    els.galleryPages.appendChild(wrapper);
  });

  els.galleryModal.hidden = false;
}

function closeGallery() {
  els.galleryModal.hidden = true;
  els.galleryPages.innerHTML = "";
}

function isBatchCaptureMode() {
  return document.querySelector('input[name="capture-mode"]:checked')?.value === "batch";
}

function updateCaptureLabel() {
  if (!els.captureLabel) return;
  els.captureLabel.textContent = isBatchCaptureMode()
    ? "+ 여러 장 한번에 촬영"
    : "+ 영수증 촬영 (개별)";
}

function fileSelectErrorMessage(err) {
  if (err?.message === "Empty file") {
    return "사진 파일이 비어 있습니다. 다시 촬영해 주세요.";
  }
  if (err?.message === "Image decode failed") {
    return "사진 형식을 읽을 수 없습니다. 갤러리에서 JPEG로 선택해 보세요.";
  }
  if (err?.message?.includes("memory") || err?.name === "SecurityError") {
    return "사진이 너무 큽니다. 갤러리에서 선택해 보세요.";
  }
  return "이미지를 불러올 수 없습니다.";
}

async function handleFileSelect(e) {
  const files = Array.from(e.target.files || []).filter(Boolean);
  if (files.length === 0) return;

  const whitenBg = els.whitenToggle.checked;
  const fullPage = isBatchCaptureMode();
  let added = 0;
  let lastError = null;

  try {
    for (let i = 0; i < files.length; i += 1) {
      showToast(
        files.length === 1 ? "이미지 처리 중..." : `${i + 1} / ${files.length} 처리 중...`,
        8000
      );
      try {
        const receipt = await processImageFile(files[i], { whitenBg, fullPage });
        if (!receipt?.dataUrl?.startsWith("data:image/")) {
          throw new Error("Image decode failed");
        }
        state.receipts.push(receipt);
        added += 1;
        await persist();
        renderList();
      } catch (err) {
        console.error(err);
        lastError = err;
      }
    }

    if (added === files.length) {
      showToast(
        added === 1
          ? fullPage
            ? "한번에 촬영 사진이 추가되었습니다."
            : "영수증이 추가되었습니다."
          : `${added}장이 추가되었습니다.`
      );
    } else if (added > 0) {
      showToast(`${added}장 추가, ${files.length - added}장은 건너뛰었습니다.`, 4000);
    } else {
      showToast(fileSelectErrorMessage(lastError));
    }
  } finally {
    els.fileInput.value = "";
    if (els.galleryInput) els.galleryInput.value = "";
  }
}

async function openPreview() {
  if (state.receipts.length === 0) return;

  els.previewPages.innerHTML = "";
  const pages = planPages(state.receipts);

  for (let i = 0; i < pages.length; i++) {
    const wrapper = document.createElement("div");
    const label = document.createElement("div");
    label.className = "preview-page-label";
    label.textContent = `${i + 1} / ${pages.length} 페이지 (A4 배치)`;
    const canvas = document.createElement("canvas");
    canvas.className = "preview-page";
    wrapper.appendChild(label);
    wrapper.appendChild(canvas);
    els.previewPages.appendChild(wrapper);
    await renderPagePreview(canvas, pages[i], 0.45);
  }

  els.previewModal.hidden = false;
}

function closePreview() {
  els.previewModal.hidden = true;
  els.previewPages.innerHTML = "";
}

function closePdfViewer() {
  clearPdfViewerContainer(els.pdfViewerPages);
  els.pdfViewerModal.hidden = true;
  els.pdfViewerPages.innerHTML = "";
  state.currentPdfBlob = null;
  state.currentPdfName = "";
}

async function viewPdfBlob(blob, title) {
  closePdfViewer();
  state.currentPdfBlob = blob;
  state.currentPdfName = title;
  els.pdfViewerTitle.textContent = title;
  els.pdfViewerModal.hidden = false;

  try {
    await renderPdfToContainer(blob, els.pdfViewerPages);
  } catch (err) {
    console.error(err);
    els.pdfViewerPages.innerHTML = `
      <p class="pdf-error">PDF를 화면에 표시할 수 없습니다.</p>
      <p class="pdf-error-hint">아래 「다운로드」로 파일을 저장하세요.</p>
    `;
  }
}

async function handleSavePdf() {
  if (state.receipts.length === 0) return;

  els.btnSavePdf.disabled = true;
  els.btnSavePdf.textContent = "생성 중...";

  try {
    const filename = defaultFilename(state.receipts.length);
    const { blob } = await exportToPdf(state.receipts, filename, {
      autoDownload: false,
    });

    try {
      await savePdfRecord(filename, blob);
      await refreshSavedPdfs();
      scrollToSavedPdfSection();
    } catch (storeErr) {
      console.error(storeErr);
    }

    try {
      const result = await downloadPdfBlob(blob, filename);
      showToast(downloadResultMessage(result), 4000);
    } catch (dlErr) {
      console.error(dlErr);
      showToast("브라우저 목록에는 저장됐습니다. 미리보기에서 「다운로드」를 다시 누르세요.", 4000);
    }
    closePreview();
  } catch (err) {
    console.error(err);
    showToast("PDF 생성에 실패했습니다.");
  } finally {
    els.btnSavePdf.disabled = false;
    els.btnSavePdf.textContent = "저장하고 다운로드";
  }
}

async function handleOpenSavedPdf(id) {
  try {
    const record = await getPdf(id);
    if (!record?.blob || record.blob.size === 0) {
      showToast("PDF 데이터를 찾을 수 없습니다.");
      return;
    }
    closeSavedPdfPicker();
    await viewPdfBlob(record.blob, record.name);
  } catch (err) {
    console.error(err);
    showToast("PDF를 열 수 없습니다.");
  }
}

async function handleDeleteSavedPdf(id) {
  try {
    await deletePdfRecord(id);
    await refreshSavedPdfs();
    showToast("저장된 PDF를 삭제했습니다.");
  } catch (err) {
    console.error(err);
    showToast("삭제에 실패했습니다.");
  }
}

async function handleOpenExternalPdf(e) {
  const file = e.target.files[0];
  if (!file) return;
  els.pdfFileInput.value = "";
  closeSavedPdfPicker();
  await viewPdfBlob(file, file.name);
}

function handlePickExternalPdf() {
  els.pdfFileInput.click();
}

function handleWhitenToggle() {
  setWhitenEnabled(els.whitenToggle.checked);
}

function handlePdfDownload() {
  if (!state.currentPdfBlob || state.currentPdfBlob.size === 0) {
    showToast("PDF가 준비되지 않았습니다.");
    return;
  }
  const name = state.currentPdfName || defaultFilename();
  downloadPdfBlob(state.currentPdfBlob, name)
    .then((result) => {
      showToast(downloadResultMessage(result), 4000);
    })
    .catch((err) => {
      console.error(err);
      showToast("다운로드에 실패했습니다.");
    });
}

els.fileInput.addEventListener("change", handleFileSelect);
els.galleryInput.addEventListener("change", handleFileSelect);
els.pdfFileInput.addEventListener("change", handleOpenExternalPdf);
els.btnOpenPdf.addEventListener("click", openSavedPdfPicker);
els.btnCloseSavedPdfPicker.addEventListener("click", closeSavedPdfPicker);
els.savedPdfPickerModal.querySelector(".modal-backdrop").addEventListener("click", closeSavedPdfPicker);
els.btnPickExternalPdf.addEventListener("click", handlePickExternalPdf);
els.savedPdfPickerList.addEventListener("click", (e) => {
  const openBtn = e.target.closest(".pdf-item-open");
  if (openBtn?.dataset.id) handleOpenSavedPdf(openBtn.dataset.id);
});
els.whitenToggle.addEventListener("change", handleWhitenToggle);
els.captureModeInputs.forEach((input) => {
  input.addEventListener("change", updateCaptureLabel);
});
updateCaptureLabel();

els.receiptList.addEventListener("click", (e) => {
  const moveBtn = e.target.closest(".btn-move");
  if (moveBtn?.dataset.index !== undefined) {
    const index = Number(moveBtn.dataset.index);
    moveReceipt(index, moveBtn.dataset.dir === "up" ? -1 : 1);
    return;
  }
  const openBtn = e.target.closest(".receipt-open");
  if (openBtn?.dataset.index !== undefined) {
    openImageDetail(Number(openBtn.dataset.index));
    return;
  }
  const btn = e.target.closest(".btn-delete");
  if (btn?.dataset.id) deleteReceipt(btn.dataset.id);
});

els.galleryPages.addEventListener("click", (e) => {
  const btn = e.target.closest(".gallery-item-btn");
  if (btn?.dataset.index !== undefined) {
    closeGallery();
    openImageDetail(Number(btn.dataset.index));
  }
});

els.savedPdfList.addEventListener("click", (e) => {
  const openBtn = e.target.closest(".pdf-item-open");
  if (openBtn?.dataset.id) {
    handleOpenSavedPdf(openBtn.dataset.id);
    return;
  }
  const delBtn = e.target.closest(".btn-delete");
  if (delBtn?.dataset.pdfId) handleDeleteSavedPdf(delBtn.dataset.pdfId);
});

els.btnGallery.addEventListener("click", openGallery);
els.btnCloseGallery.addEventListener("click", closeGallery);
els.galleryModal.querySelector(".modal-backdrop").addEventListener("click", closeGallery);

els.btnCloseImageDetail.addEventListener("click", closeImageDetail);
els.imageDetailModal.querySelector(".modal-backdrop").addEventListener("click", closeImageDetail);
els.btnPrevImage.addEventListener("click", showPrevImage);
els.btnNextImage.addEventListener("click", showNextImage);

els.btnPdf.addEventListener("click", openPreview);
els.btnClosePreview.addEventListener("click", closePreview);
els.previewModal.querySelector(".modal-backdrop").addEventListener("click", closePreview);
els.btnSavePdf.addEventListener("click", handleSavePdf);

els.btnClosePdfViewer.addEventListener("click", closePdfViewer);
els.pdfViewerModal.querySelector(".modal-backdrop").addEventListener("click", closePdfViewer);
els.btnPdfDownload.addEventListener("click", handlePdfDownload);

els.whitenToggle.checked = isWhitenEnabled();

async function bootApp() {
  if (els.inAppBanner && isInAppBrowser()) {
    const app = getInAppBrowserName();
    els.inAppBanner.innerHTML = `
      <strong>${escapeHtml(app)} 안 브라우저</strong>
      저장 시 다운로드가 바로 시작됩니다. 파일 이름이 바뀌거나 공유 화면이 뜨면
      우측 상단 <strong>⋮ → 다른 브라우저로 열기</strong>(Chrome·삼성 인터넷)를 권장합니다.
    `;
    els.inAppBanner.hidden = false;
  }

  state.receipts = await loadReceiptsFromDevice();
  renderList();
  await refreshSavedPdfs();
}

bootApp();
