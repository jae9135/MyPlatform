/**
 * Mobile-friendly PDF save to device.
 * In-app browsers (KakaoTalk etc.) cannot save to the user's Downloads folder reliably.
 */

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** KakaoTalk, Line, Instagram, etc. — downloads often stay inside the app. */
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

function ensurePdfFilename(filename) {
  const name = (filename || "receipts.pdf").trim();
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function openBlobInNewTab(blob) {
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

async function trySharePdf(blob, name) {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const file = new File([blob], name, { type: "application/pdf" });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ title: name, files: [file] });
    return true;
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return false;
  }
}

export async function downloadBlobToDevice(blob, filename) {
  const name = ensurePdfFilename(filename);

  if (!blob || blob.size === 0) {
    throw new Error("Empty PDF");
  }

  if (isIOS()) {
    openBlobInNewTab(blob);
    return "ios-open";
  }

  if (isInAppBrowser()) {
    const shared = await trySharePdf(blob, name);
    if (shared) return "share";

    openBlobInNewTab(blob);
    return "in-app-open";
  }

  const shared = await trySharePdf(blob, name);
  if (shared) return "share";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "download";
}

export function downloadResultMessage(result) {
  if (result === "app-only") {
    const app = getInAppBrowserName();
    return `${app} 안에서는 Chrome(삼성 인터넷)으로 열어 다운로드하세요.`;
  }
  if (result === "ios-open") {
    return "새 탭에서 PDF를 연 뒤 공유(↑) → 「파일에 저장」을 선택하세요.";
  }
  if (result === "in-app-open") {
    const app = getInAppBrowserName();
    return `${app} 안에서는 「다른 브라우저로 열기」(Chrome) 후 다운로드하거나, 공유 메뉴에서 저장하세요.`;
  }
  if (result === "share") {
    return "공유 메뉴에서 「다운로드」 또는 「Drive/내 파일에 저장」을 선택하세요.";
  }
  return "다운로드 폴더에 저장되었습니다.";
}

export { openBlobInNewTab };
