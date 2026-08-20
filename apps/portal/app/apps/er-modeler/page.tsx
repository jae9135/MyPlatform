"use client";

import dynamic from "next/dynamic";
import { PortalNav } from "@/lib/PortalNav";
import "./er-modeler.css";

const ErModelerApp = dynamic(() => import("@/lib/er-modeler/ErModelerApp"), {
  ssr: false,
  loading: () => (
    <div className="er-modeler">
      <div className="er-boot-loading">
        <p>ER Modeler 불러오는 중…</p>
      </div>
    </div>
  ),
});

export default function ErModelerPage() {
  return (
    <div className="er-modeler-shell">
      <div className="er-modeler-shell-bar">
        <PortalNav />
      </div>
      <ErModelerApp />
    </div>
  );
}
