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

/** Vercel 대시보드 (배포 포털 URL과 구분 — NEXT_PUBLIC_PORTAL_URL은 여기 쓰지 않음) */
function portalHref(): string {
  const infra = process.env.NEXT_PUBLIC_INFRA_VERCEL_URL?.trim();
  if (infra) return trimUrl(infra);
  return "https://vercel.com/dashboard";
}

/** Render 대시보드 또는 공개 API URL. 로컬 127.0.0.1 API 주소는 사용하지 않음 */
function renderHref(): string {
  const infra = process.env.NEXT_PUBLIC_INFRA_RENDER_URL?.trim();
  if (infra) return trimUrl(infra);

  const api = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (api && /^https?:\/\//i.test(api) && !isLocalHost(api)) {
    return trimUrl(api);
  }

  return "https://dashboard.render.com";
}

/** 배포된 포털 공개 URL (배지와 별도 — 필요 시 다른 UI에서 사용) */
export function deployedPortalHref(): string | null {
  const portal = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (portal && !isLocalHost(portal)) return trimUrl(portal);
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return null;
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
