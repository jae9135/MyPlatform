/**
 * Save PDF to the device Downloads folder with a stable filename.
 * Do not open the system share sheet (다른 앱으로 보내기).
 */

function ensurePdfFilename(filename) {
  let name = (filename || "receipts.pdf").trim();
  name = name.replace(/[/\\?%*:|"<>]/g, "_");
  if (!name.toLowerCase().endsWith(".pdf")) name = `${name}.pdf`;
  return name;
}

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|EverytimeApp|WhatsApp|Twitter/i.test(
    ua
  );
}

export function getInAppBrowserName() {
  const ua = navigator.userAgent || "";
  if (/KAKAOTALK/i.test(ua)) return "카카오톡";
  if (/Line\//i.test(ua)) return "LINE";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook";
  if (/NAVER\(inapp/i.test(ua)) return "네이버";
  return "앱 안 브라우저";
}

function namedPdfFile(blob, name) {
  return new File([blob], name, { type: "application/pdf" });
}

export async function downloadBlobToDevice(blob, filename) {
  const name = ensurePdfFilename(filename);

  if (!blob || blob.size === 0) {
    throw new Error("Empty PDF");
  }

  const file = namedPdfFile(blob, name);
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);

  if (isIOS() || isInAppBrowser()) {
    return "download-limited";
  }
  return "download";
}

export function downloadResultMessage(result) {
  if (result === "download-limited") {
    const app = isInAppBrowser() ? getInAppBrowserName() : "이 브라우저";
    return `${app}에서는 파일 이름이 바뀌거나 공유 화면이 열릴 수 있습니다. Chrome에서 열면 이름이 유지됩니다.`;
  }
  return "다운로드 폴더에 저장되었습니다.";
}

export function openBlobInNewTab(blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
