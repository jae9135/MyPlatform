"use client";

import { PortalNav } from "@/lib/PortalNav";
import "./receipt.css";

export default function ReceiptToPdfPage() {
  return (
    <div className="receipt-shell">
      <div className="receipt-shell-bar">
        <PortalNav />
      </div>
      <iframe
        className="receipt-shell-frame"
        src="/receipt-to-pdf/index.html"
        title="ReceiptToPDF"
        allow="camera; fullscreen"
      />
    </div>
  );
}
