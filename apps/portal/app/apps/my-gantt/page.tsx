"use client";

import dynamic from "next/dynamic";
import { PortalNav } from "@/lib/PortalNav";
import "./gantt.css";

const GanttApp = dynamic(() => import("@/lib/mygantt/GanttApp"), {
  ssr: false,
  loading: () => (
    <div className="mygantt">
      <div className="app boot-loading">
        <p>MyGantt 불러오는 중…</p>
      </div>
    </div>
  ),
});

export default function MyGanttPage() {
  return (
    <div className="gantt-shell">
      <div className="gantt-shell-bar">
        <PortalNav />
      </div>
      <div className="mygantt">
        <GanttApp />
      </div>
    </div>
  );
}
