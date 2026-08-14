/**
 * Background whitening — detect receipt edges and crop desk background away.
 * Skips processing on white desks. Safe fallbacks — never throws.
 */

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function avgLuminanceOfStrip(data) {
  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += luminance(data[i], data[i + 1], data[i + 2]);
  }
  return sum / pixels;
}

function getAnalyzeCanvas(source, maxSize = 640) {
  const { width, height } = source;
  const longest = Math.max(width, height);
  if (longest <= maxSize) return { canvas: source, scale: 1 };

  const scale = maxSize / longest;
  const c = document.createElement("canvas");
  c.width = Math.round(width * scale);
  c.height = Math.round(height * scale);
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  return { canvas: c, scale };
}

/** Sample border strips on a small canvas (low memory, mobile-safe). */
function isWhiteBorder(canvas, threshold = 218) {
  try {
    const { canvas: small } = getAnalyzeCanvas(canvas, 320);
    const ctx = small.getContext("2d");
    const { width, height } = small;
    const strip = Math.max(2, Math.floor(Math.min(width, height) * 0.04));

    const top = avgLuminanceOfStrip(ctx.getImageData(0, 0, width, strip).data);
    const bottom = avgLuminanceOfStrip(ctx.getImageData(0, height - strip, width, strip).data);
    const left = avgLuminanceOfStrip(ctx.getImageData(0, 0, strip, height).data);
    const right = avgLuminanceOfStrip(ctx.getImageData(width - strip, 0, strip, height).data);
    const avg = (top + bottom + left + right) / 4;
    return avg >= threshold;
  } catch {
    return true;
  }
}

/** True when the whole scene is mostly white (white desk + light receipt). */
function isMostlyWhiteImage(canvas, brightRatio = 0.48) {
  try {
    const { canvas: small } = getAnalyzeCanvas(canvas, 96);
    const data = small.getContext("2d").getImageData(0, 0, small.width, small.height).data;
    let bright = 0;
    const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= 220 && data[i + 1] >= 220 && data[i + 2] >= 220) bright++;
    }
    return bright / total >= brightRatio;
  } catch {
    return true;
  }
}

function rowStats(data, width, y) {
  let sum = 0;
  let sumSq = 0;
  let edge = 0;
  let prev = -1;

  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const lum = luminance(data[i], data[i + 1], data[i + 2]);
    sum += lum;
    sumSq += lum * lum;
    if (prev >= 0) edge += Math.abs(lum - prev);
    prev = lum;
  }

  const mean = sum / width;
  return { variance: sumSq / width - mean * mean, edge: edge / width };
}

function colStats(data, width, height, x) {
  let sum = 0;
  let sumSq = 0;
  let edge = 0;
  let prev = -1;

  for (let y = 0; y < height; y++) {
    const i = (y * width + x) * 4;
    const lum = luminance(data[i], data[i + 1], data[i + 2]);
    sum += lum;
    sumSq += lum * lum;
    if (prev >= 0) edge += Math.abs(lum - prev);
    prev = lum;
  }

  const mean = sum / height;
  return { variance: sumSq / height - mean * mean, edge: edge / height };
}

function avgMetric(values, key) {
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + v[key], 0) / values.length;
}

function findEdgeStart(values, baseline, fromStart) {
  const threshold = Math.max(baseline.variance * 2.2 + 80, baseline.edge * 1.8 + 4, 120);
  const len = values.length;
  const limit = Math.floor(len * 0.45);

  if (fromStart) {
    for (let i = 2; i < limit; i++) {
      const score = values[i].variance + values[i].edge * 8;
      if (score > threshold && values[i + 1].variance + values[i + 1].edge * 8 > threshold * 0.85) {
        return Math.max(0, i - 1);
      }
    }
    return 0;
  }

  for (let i = len - 3; i > len - limit; i--) {
    const score = values[i].variance + values[i].edge * 8;
    if (score > threshold && values[i - 1].variance + values[i - 1].edge * 8 > threshold * 0.85) {
      return Math.min(len - 1, i + 1);
    }
  }
  return len - 1;
}

export function detectReceiptBounds(data, width, height) {
  const rowValues = [];
  for (let y = 0; y < height; y++) rowValues.push(rowStats(data, width, y));

  const colValues = [];
  for (let x = 0; x < width; x++) colValues.push(colStats(data, width, height, x));

  const margin = Math.max(3, Math.floor(Math.min(width, height) * 0.04));
  const topBaseline = {
    variance: avgMetric(rowValues.slice(0, margin), "variance"),
    edge: avgMetric(rowValues.slice(0, margin), "edge"),
  };
  const bottomBaseline = {
    variance: avgMetric(rowValues.slice(-margin), "variance"),
    edge: avgMetric(rowValues.slice(-margin), "edge"),
  };
  const leftBaseline = {
    variance: avgMetric(colValues.slice(0, margin), "variance"),
    edge: avgMetric(colValues.slice(0, margin), "edge"),
  };
  const rightBaseline = {
    variance: avgMetric(colValues.slice(-margin), "variance"),
    edge: avgMetric(colValues.slice(-margin), "edge"),
  };

  const top = findEdgeStart(rowValues, topBaseline, true);
  const bottom = findEdgeStart(rowValues, bottomBaseline, false);
  const left = findEdgeStart(colValues, leftBaseline, true);
  const right = findEdgeStart(colValues, rightBaseline, false);

  if (bottom <= top + 8 || right <= left + 8) return null;

  const boxW = right - left + 1;
  const boxH = bottom - top + 1;
  if (boxW < width * 0.3 || boxH < height * 0.3) return null;
  if (boxW > width * 0.97 && boxH > height * 0.97) return null;

  const pad = Math.max(1, Math.round(Math.min(width, height) * 0.005));
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  return {
    x,
    y,
    w: Math.min(width - x, boxW + pad * 2),
    h: Math.min(height - y, boxH + pad * 2),
  };
}

/** Tight crop — no extra white padding around the receipt. */
function cropCanvas(sourceCanvas, bounds) {
  const out = document.createElement("canvas");
  out.width = bounds.w;
  out.height = bounds.h;
  out.getContext("2d").drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    0,
    0,
    bounds.w,
    bounds.h
  );
  return out;
}

/**
 * Detect receipt edges and crop desk background away.
 * Returns original canvas on white desk or if detection fails.
 */
export function whitenBackground(canvas) {
  try {
    if (!canvas?.width || !canvas?.height) return canvas;

    if (isMostlyWhiteImage(canvas) || isWhiteBorder(canvas)) {
      return canvas;
    }

    const { canvas: analyzeCanvas, scale } = getAnalyzeCanvas(canvas, 480);
    const ctx = analyzeCanvas.getContext("2d");
    const { width, height } = analyzeCanvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const boundsSmall = detectReceiptBounds(imageData.data, width, height);

    if (!boundsSmall) return canvas;

    const bounds = {
      x: Math.round(boundsSmall.x / scale),
      y: Math.round(boundsSmall.y / scale),
      w: Math.round(boundsSmall.w / scale),
      h: Math.round(boundsSmall.h / scale),
    };

    const areaRatio = (bounds.w * bounds.h) / (canvas.width * canvas.height);
    if (areaRatio < 0.35 || areaRatio > 0.96) return canvas;

    bounds.x = Math.max(0, Math.min(bounds.x, canvas.width - 1));
    bounds.y = Math.max(0, Math.min(bounds.y, canvas.height - 1));
    bounds.w = Math.min(bounds.w, canvas.width - bounds.x);
    bounds.h = Math.min(bounds.h, canvas.height - bounds.y);

    if (bounds.w < 20 || bounds.h < 20) return canvas;

    return cropCanvas(canvas, bounds);
  } catch (err) {
    console.warn("whitenBackground skipped:", err);
    return canvas;
  }
}

export function canvasToDataUrl(canvas, quality = 0.92) {
  if (!canvas?.width || !canvas?.height) {
    throw new Error("Invalid canvas");
  }
  return canvas.toDataURL("image/jpeg", quality);
}

const WHITEN_KEY = "receipttopdf_whiten_bg";

export function isWhitenEnabled() {
  const stored = localStorage.getItem(WHITEN_KEY);
  return stored === "true";
}

export function setWhitenEnabled(enabled) {
  localStorage.setItem(WHITEN_KEY, enabled ? "true" : "false");
}
