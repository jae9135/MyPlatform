const POPUP_FEATURES =
  "width=980,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes";

export function openWebQualityHistoryPopout(): void {
  window.open("/apps/web-quality/history", "web-quality-history", POPUP_FEATURES)?.focus();
}

export function notifyMainWebQualityHistory(jobId: string, mode?: string): void {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(
      { type: "web-quality-load-history", jobId, mode },
      window.location.origin
    );
    window.opener.focus();
    return;
  }
  const q = new URLSearchParams({ load: jobId });
  if (mode) q.set("mode", mode);
  window.location.href = `/apps/web-quality?${q.toString()}`;
}
