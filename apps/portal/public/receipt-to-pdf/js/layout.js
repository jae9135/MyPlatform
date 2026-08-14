/**
 * A4 layout engine — plans page grids and computes image placement.
 * Receipts with fullPage=true always get a whole A4 page (batch photo mode).
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const MARGIN_MM = 10;

export function pickCountForPage(remaining) {
  if (remaining <= 1) return 1;
  if (remaining === 2) return 2;
  if (remaining === 3) return 3;
  if (remaining >= 4) return 4;
  return remaining;
}

export function gridFor(count, printableW, printableH) {
  const gap = 4;

  if (count === 1) {
    return [{ x: 0, y: 0, w: printableW, h: printableH }];
  }

  if (count === 2) {
    const h = (printableH - gap) / 2;
    return [
      { x: 0, y: 0, w: printableW, h },
      { x: 0, y: h + gap, w: printableW, h },
    ];
  }

  if (count === 3) {
    const topH = (printableH - gap) * 0.55;
    const bottomH = printableH - topH - gap;
    const halfW = (printableW - gap) / 2;
    return [
      { x: 0, y: 0, w: halfW, h: topH },
      { x: halfW + gap, y: 0, w: halfW, h: topH },
      { x: 0, y: topH + gap, w: printableW, h: bottomH },
    ];
  }

  const cellW = (printableW - gap) / 2;
  const cellH = (printableH - gap) / 2;
  return [
    { x: 0, y: 0, w: cellW, h: cellH },
    { x: cellW + gap, y: 0, w: cellW, h: cellH },
    { x: 0, y: cellH + gap, w: cellW, h: cellH },
    { x: cellW + gap, y: cellH + gap, w: cellW, h: cellH },
  ];
}

export function fitInSlot(imgW, imgH, slot) {
  const padding = 0;
  const availW = slot.w - padding * 2;
  const availH = slot.h - padding * 2;
  const scale = Math.min(availW / imgW, availH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  return {
    x: slot.x + (slot.w - drawW) / 2,
    y: slot.y + (slot.h - drawH) / 2,
    w: drawW,
    h: drawH,
  };
}

function pageWithOne(receipt, printableW, printableH) {
  const slot = gridFor(1, printableW, printableH)[0];
  return {
    slots: [slot],
    placements: [{ receipt, rect: fitInSlot(receipt.width, receipt.height, slot) }],
  };
}

function pagesForGroup(group, printableW, printableH) {
  const pages = [];
  let k = 0;
  while (k < group.length) {
    const remaining = group.length - k;
    const count = pickCountForPage(remaining);
    const slots = gridFor(count, printableW, printableH);
    const slice = group.slice(k, k + count);
    pages.push({
      slots,
      placements: slice.map((receipt, idx) => ({
        receipt,
        rect: fitInSlot(receipt.width, receipt.height, slots[idx]),
      })),
    });
    k += count;
  }
  return pages;
}

/**
 * Plan all pages. fullPage receipts = 1 photo → 1 PDF page.
 * Individual receipts = 2~4 per page.
 */
export function planPages(receipts) {
  const printableW = A4_WIDTH_MM - MARGIN_MM * 2;
  const printableH = A4_HEIGHT_MM - MARGIN_MM * 2;
  const pages = [];
  let i = 0;

  while (i < receipts.length) {
    const receipt = receipts[i];

    if (receipt.fullPage) {
      pages.push(pageWithOne(receipt, printableW, printableH));
      i += 1;
      continue;
    }

    let j = i;
    while (j < receipts.length && !receipts[j].fullPage) j += 1;
    pages.push(...pagesForGroup(receipts.slice(i, j), printableW, printableH));
    i = j;
  }

  return pages;
}

const MM_TO_PX = 3.7795275591;

export function renderPagePreview(canvas, page, scale = 0.5) {
  const pageW = A4_WIDTH_MM * MM_TO_PX * scale;
  const pageH = A4_HEIGHT_MM * MM_TO_PX * scale;
  canvas.width = pageW;
  canvas.height = pageH;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pageW, pageH);

  const mmScale = MM_TO_PX * scale;
  const margin = MARGIN_MM * mmScale;

  const drawImage = (receipt, rect) => {
    const img = receipt._img;
    if (!img) return;
    ctx.drawImage(
      img,
      margin + rect.x * mmScale,
      margin + rect.y * mmScale,
      rect.w * mmScale,
      rect.h * mmScale
    );
  };

  const loadPromises = page.placements.map(({ receipt }) => {
    if (receipt._img) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        receipt._img = img;
        resolve();
      };
      img.onerror = resolve;
      img.src = receipt.dataUrl;
    });
  });

  return Promise.all(loadPromises).then(() => {
    for (const { receipt, rect } of page.placements) {
      drawImage(receipt, rect);
    }
  });
}
