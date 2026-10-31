/** @type {import('next').NextConfig} */
/**
 * 공통 보안 헤더
 * - X-Frame-Options / frame-ancestors: 다른 사이트가 이 사이트를 iframe 으로 감싸는 것(클릭재킹) 차단.
 *   같은 출처 iframe(영수증 PDF 미리보기 등)은 허용.
 * - Permissions-Policy: 카메라는 영수증 촬영 때문에 이 사이트에서만 허용, 나머지 민감 권한은 차단.
 * - HSTS 는 Vercel 이 기본으로 붙이므로 여기서 설정하지 않음.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  transpilePackages: ["xlsx"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      stream: false,
    };
    return config;
  },
};

export default nextConfig;
