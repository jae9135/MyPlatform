"use client";

import { isLocalPortalHost } from "@/lib/localScanApi";

export function EnvSourceBadge() {
  const isLocal = isLocalPortalHost();
  return (
    <span className={`env-source-badge ${isLocal ? "local" : "cloud"}`}>
      {isLocal ? "로컬 API (프록시)" : "Render · Vercel 프록시"}
    </span>
  );
}

export function EnvToolsSkeleton() {
  return (
    <div className="env-tools-skeleton" aria-busy="true">
      <span className="env-tools-skeleton-line" />
      <span className="env-tools-skeleton-line short" />
      <span className="env-tools-skeleton-line" />
    </div>
  );
}

/** Shown on deployed portal when ZIP upload is available — local dev uses proxy to PC API. */
export function CloudLargeZipHint() {
  if (isLocalPortalHost()) return null;
  return (
    <p className="hint cloud-zip-hint">
      <strong>대용량 ZIP(약 4MB 초과)</strong>은 Render 업로드·메모리 한계로 실패할 수 있습니다. PC에서{" "}
      <code>scripts\start-local-scan.bat</code> 실행 후 <code>npm run dev:portal</code> →{" "}
      <code>http://localhost:3000</code> 에서 ZIP을 선택해 검사하세요.
    </p>
  );
}
