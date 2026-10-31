"use client";

import { useEffect, useState } from "react";

/**
 * 데모 탭 — 패널 내용은 서버에서 모두 렌더링되고(검색엔진·화면낭독기가 읽음), 여기서는 보이기만 전환.
 * 주소 해시(#source, #web, #db)로 특정 탭을 바로 열 수 있습니다.
 */
export function DemoTabs({
  tabs,
  panels,
}: {
  tabs: { id: string; label: string }[];
  panels: Record<string, React.ReactNode>;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (tabs.some((t) => t.id === fromHash)) setActive(fromHash);
  }, [tabs]);

  function select(id: string) {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="mkt-demo-tabs">
      <div className="mkt-tabbtns" role="tablist" aria-label="진단 종류">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className={`mkt-tabbtn${active === t.id ? " active" : ""}`}
            onClick={() => select(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
              select(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}
        >
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
