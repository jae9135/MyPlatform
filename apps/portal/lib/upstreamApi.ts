/** Server-side Render/upstream config for portal API routes. */

export function upstreamBase(): string {
  const fromEnv =
    process.env.API_UPSTREAM_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:8001";
}

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

export type UpstreamConfigIssue = {
  ok: false;
  status: number;
  detail: string;
  missing?: string[];
};

/** Vercel 등 클라우드에서 Render URL·API 키가 빠졌을 때 명확한 503 */
export function checkUpstreamConfig(): UpstreamConfigIssue | null {
  if (!isVercelRuntime()) return null;

  const base =
    process.env.API_UPSTREAM_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const apiKey = process.env.API_ACCESS_KEY?.trim();
  const missing: string[] = [];

  if (!base || base.includes("127.0.0.1") || base.includes("localhost")) {
    missing.push("NEXT_PUBLIC_API_BASE_URL");
  }
  if (!apiKey) {
    missing.push("API_ACCESS_KEY");
  }

  if (missing.length === 0) return null;

  const parts = [
    "Vercel 환경 변수가 필요합니다.",
    missing.includes("NEXT_PUBLIC_API_BASE_URL")
      ? "NEXT_PUBLIC_API_BASE_URL = Render API URL (예: https://xxx.onrender.com)"
      : null,
    missing.includes("API_ACCESS_KEY")
      ? "API_ACCESS_KEY = Render API와 동일한 값"
      : null,
    "설정 후 Redeploy 하세요.",
    "Render 쪽 CORS_ORIGINS에 https://project-auto-platform.vercel.app 도 추가하세요.",
  ].filter(Boolean);

  return {
    ok: false,
    status: 503,
    detail: parts.join(" "),
    missing,
  };
}

export function upstreamHeaders(): HeadersInit {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = process.env.API_ACCESS_KEY?.trim();
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}
