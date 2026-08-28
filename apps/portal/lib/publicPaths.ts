/** Paths accessible without portal login. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/login") return true;
  if (pathname === "/api/login") return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;
  if (/^\/(google|naver)[a-z0-9]+\.html$/i.test(pathname)) return true;
  if (pathname.startsWith("/products")) return true;
  if (pathname.startsWith("/demo")) return true;
  if (pathname === "/customize") return true;
  if (pathname === "/contact") return true;
  if (pathname === "/api/contact") return true;
  if (pathname === "/api/visit") return true;
  if (pathname.startsWith("/receipt-to-pdf")) return true;
  return false;
}
