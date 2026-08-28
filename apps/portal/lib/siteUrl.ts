/** Canonical public site URL (sitemap · robots · OG). */
export function getSiteUrl(): string {
  const portal = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (portal) return portal.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
