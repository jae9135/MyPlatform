/** UTC ISO 문자열을 한국 시간(KST)으로 표시합니다. */
export function formatUtcIsoToKst(iso?: string | null, fallback = "—"): string {
  const raw = iso?.trim();
  if (!raw) return fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return raw.includes("T") ? raw.slice(0, 19).replace("T", " ") : raw.slice(0, 19);
  }
  const s = d.toLocaleString("en-GB", { timeZone: "Asia/Seoul", hour12: false });
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}`;
  return s;
}
