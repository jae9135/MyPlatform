"use client";

import {
  DEFAULT_LOCAL_SCAN_API,
  setLocalScanApiBase,
  setLocalScanEnabled,
} from "@/lib/localScanApi";

type Props = {
  useLocal: boolean;
  localApiUrl: string;
  envLoadError?: string;
  envLoading?: boolean;
  onToggle: (on: boolean) => void;
  onUrlChange: (url: string) => void;
  onUrlBlur: () => void;
};

/** Shared A-plan panel: ZIP scans on the user's PC (source-scan + web-quality). */
export function LocalScanSettings({
  useLocal,
  localApiUrl,
  envLoadError,
  envLoading,
  onToggle,
  onUrlChange,
  onUrlBlur,
}: Props) {
  return (
    <div className="local-scan-panel">
      <label className="check-row">
        <input
          type="checkbox"
          checked={useLocal}
          onChange={(e) => {
            const on = e.target.checked;
            setLocalScanEnabled(on);
            onToggle(on);
          }}
        />
        <span>내 PC에서 검사 (ZIP·점검툴은 이 PC — Render 업로드 없음)</span>
      </label>
      {useLocal ? (
        <div className="local-scan-panel-body">
          <label className="local-scan-url-field">
            <span className="local-scan-url-label">로컬 API</span>
            <input
              value={localApiUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              onBlur={() => {
                setLocalScanApiBase(localApiUrl);
                onUrlBlur();
              }}
              placeholder={DEFAULT_LOCAL_SCAN_API}
            />
          </label>
          <details className="local-scan-help">
            <summary>로컬 설치 · CORS · 툴 경로</summary>
            <ol>
              <li>
                <code>scripts\start-local-scan.bat</code> 실행 (또는{" "}
                <code>start-api-source-scan.ps1</code>)
              </li>
              <li>
                <strong>각 PC마다</strong> JDK·Maven·PMD·SpotBugs를 설치하고, 스크립트 상단{" "}
                <code>C:\tools</code> 등 경로를 본인 PC에 맞게 수정
              </li>
              <li>
                Vercel 포털에서 접속 시: 스크립트 실행 전{" "}
                <code>$env:CORS_ORIGINS=&quot;https://your-app.vercel.app&quot;</code> (또는{" "}
                <code>.env.local</code>의 <code>NEXT_PUBLIC_PORTAL_URL</code> 자동 반영)
              </li>
              <li>
                <code>localhost:3000</code> 포털은 CORS 추가 없이 사용 가능
              </li>
            </ol>
          </details>
          {envLoading ? <p className="hint local-scan-status">로컬 API 환경 확인 중…</p> : null}
          {envLoadError ? <p className="msg err local-scan-status">{envLoadError}</p> : null}
        </div>
      ) : (
        <p className="hint local-scan-cloud-hint">
          클라우드(Render) 경로 — 4MB 초과 ZIP은 502가 날 수 있어 로컬 검사를 권장합니다.
        </p>
      )}
    </div>
  );
}

export function EnvSourceBadge({ local: isLocal }: { local: boolean }) {
  return (
    <span className={`env-source-badge ${isLocal ? "local" : "cloud"}`}>
      {isLocal ? "로컬 API" : "Render · Vercel 프록시"}
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
