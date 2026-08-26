const POPUP_FEATURES = "width=980,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes";

export function openSourceScanHistoryPopout(): void {
  window.open("/apps/source-scan/history", "source-scan-history", POPUP_FEATURES)?.focus();
}

export function openSourceScanRulesPopout(): void {
  window.open("/apps/source-scan/rules", "source-scan-rules", POPUP_FEATURES)?.focus();
}

export function notifyMainSourceScanHistory(jobId: string): void {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: "source-scan-load-history", jobId }, window.location.origin);
    window.opener.focus();
    return;
  }
  window.location.href = `/apps/source-scan?load=${encodeURIComponent(jobId)}`;
}
