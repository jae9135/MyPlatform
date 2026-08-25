export type InfraLink = { label: string; href: string };

function trimUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Vercel · Portal — 배포 URL 또는 Vercel 대시보드 */
function portalHref(): string {
  const infra = process.env.NEXT_PUBLIC_INFRA_VERCEL_URL?.trim();
  if (infra) return trimUrl(infra);

  const portal = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (portal && !isLocalHost(portal)) return trimUrl(portal);

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

  return "https://vercel.com/dashboard";
}

/** Render · API — Render 서비스 URL(배포) 또는 Render 대시보드. 로컬 API 주소는 사용하지 않음 */
function renderHref(): string {
  const infra = process.env.NEXT_PUBLIC_INFRA_RENDER_URL?.trim();
  if (infra) return trimUrl(infra);

  const api = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (api && /^https?:\/\//i.test(api) && !isLocalHost(api)) {
    return trimUrl(api);
  }

  return "https://dashboard.render.com";
}

/** Supabase · DB/Storage — 프로젝트 대시보드 */
function supabaseHref(): string {
  const infra = process.env.NEXT_PUBLIC_INFRA_SUPABASE_URL?.trim();
  if (infra) return trimUrl(infra);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const m = url?.match(/https:\/\/([^.]+)\.supabase\.co/i);
  if (m?.[1]) return `https://supabase.com/dashboard/project/${m[1]}`;

  return "https://supabase.com/dashboard";
}

export function getInfraLinks(): InfraLink[] {
  return [
    { label: "Vercel · Portal", href: portalHref() },
    { label: "Render · API", href: renderHref() },
    { label: "Supabase · DB/Storage", href: supabaseHref() },
  ];
}
