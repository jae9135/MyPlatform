import { whitenBackground, canvasToDataUrl, isWhitenEnabled } from "./background.js";

const MAX_IMAGE_SIZE = 1024;
const JPEG_QUALITY = 0.85;

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = url;
  });
}

function loadImageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  return loadImageFromUrl(url).finally(() => URL.revokeObjectURL(url));
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

function loadImageFromFileReader(blob) {
  return readBlobAsDataUrl(blob).then((url) => loadImageFromUrl(url));
}

function imageToCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("Invalid image dimensions");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0);
  return canvas;
}

function bitmapToCanvas(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  if (typeof bitmap.close === "function") bitmap.close();
  return canvas;
}

/** Copy file into memory immediately — mobile input clear cannot invalidate this. */
async function readFileStable(file) {
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsArrayBuffer(file);
  });

  if (!buffer || buffer.byteLength === 0) {
    throw new Error("Empty file");
  }

  const type = file.type || "image/jpeg";
  return {
    blob: new Blob([buffer], { type }),
    name: file.name || `receipt_${Date.now()}.jpg`,
  };
}

/** Try several decode methods — mobile camera compatibility. */
async function blobToCanvas(blob) {
  const errors = [];

  try {
    const img = await loadImageFromFileReader(blob);
    return imageToCanvas(img);
  } catch (err) {
    errors.push(err);
  }

  try {
    const img = await loadImageFromBlob(blob);
    return imageToCanvas(img);
  } catch (err) {
    errors.push(err);
  }

  if (typeof createImageBitmap === "function") {
    const attempts = [
      () => createImageBitmap(blob, { imageOrientation: "from-image" }),
      () => createImageBitmap(blob),
    ];

    for (const attempt of attempts) {
      try {
        return bitmapToCanvas(await attempt());
      } catch (err) {
        errors.push(err);
      }
    }

    try {
      return bitmapToCanvas(
        await createImageBitmap(blob, {
          resizeWidth: MAX_IMAGE_SIZE,
          resizeQuality: "high",
        })
      );
    } catch (err) {
      errors.push(err);
    }
  }

  console.error("blobToCanvas failed:", errors);
  throw new Error("Image decode failed");
}

/** Last resort — load via data URL, always resize/compress for mobile. */
async function receiptFromBlobDirect(blob, name, fullPage) {
  const dataUrl = await readBlobAsDataUrl(blob);
  const img = await loadImageFromUrl(dataUrl);
  let canvas = imageToCanvas(img);
  canvas = resizeCanvas(canvas, MAX_IMAGE_SIZE);

  let outUrl;
  try {
    outUrl = canvasToDataUrl(canvas, JPEG_QUALITY);
  } catch {
    canvas = resizeCanvas(canvas, 720);
    outUrl = canvasToDataUrl(canvas, 0.75);
  }

  return {
    id: newId(),
    name,
    dataUrl: outUrl,
    width: canvas.width,
    height: canvas.height,
    fullPage,
    addedAt: Date.now(),
  };
}

function resizeCanvas(canvas, maxSize = MAX_IMAGE_SIZE) {
  const { width, height } = canvas;
  const longest = Math.max(width, height);
  if (longest <= maxSize) return canvas;

  const scale = maxSize / longest;
  const resized = document.createElement("canvas");
  resized.width = Math.round(width * scale);
  resized.height = Math.round(height * scale);
  resized.getContext("2d").drawImage(canvas, 0, 0, resized.width, resized.height);
  return resized;
}

async function waitForReadableFile(file, attempts = 15, delayMs = 200) {
  for (let i = 0; i < attempts; i++) {
    if (file?.size > 0) return file;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (file) return file;
  throw new Error("Empty file");
}

/** Load a File, keep capture orientation, optionally whiten outer background. */
export async function processImageFile(file, options = {}) {
  const whitenBg = options.whitenBg ?? isWhitenEnabled();
  const fullPage = options.fullPage ?? false;

  await waitForReadableFile(file);
  const { blob, name } = await readFileStable(file);

  try {
    let canvas = await blobToCanvas(blob);
    canvas = resizeCanvas(canvas);
    const baseCanvas = canvas;

    if (whitenBg) {
      try {
        const processed = whitenBackground(canvas);
        if (processed?.width > 0 && processed?.height > 0) {
          canvas = processed;
        }
      } catch (err) {
        console.warn("Background processing skipped:", err);
        canvas = baseCanvas;
      }
    }

    let dataUrl;
    try {
      dataUrl = canvasToDataUrl(canvas, JPEG_QUALITY);
    } catch {
      try {
        canvas = resizeCanvas(baseCanvas, 720);
        dataUrl = canvasToDataUrl(canvas, 0.75);
      } catch {
        return receiptFromBlobDirect(blob, name, fullPage);
      }
    }

    if (!dataUrl?.startsWith("data:image/")) {
      throw new Error("Image decode failed");
    }

    return {
      id: newId(),
      name,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      fullPage,
      addedAt: Date.now(),
    };
  } catch (err) {
    console.warn("processImageFile fallback:", err);
    return receiptFromBlobDirect(blob, name, fullPage);
  }
}
