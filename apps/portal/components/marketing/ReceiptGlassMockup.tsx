"use client";

import { useState } from "react";

type Variant = "home" | "capture" | "pdf";

type Props = {
  variant?: Variant;
  interactive?: boolean;
  /** Reference mockup shows success line under the button */
  showSuccess?: boolean;
};

function ReceiptIcon() {
  return (
    <svg
      className="mkt-receipt-icon"
      viewBox="0 0 48 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 4h32v44l-4 3-4-3-4 3-4-3-4 3-4-3-4 3V4z"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth="1.5"
      />
      <path d="M14 14h20M14 22h20M14 30h14" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ReceiptGlassMockup({
  variant = "home",
  interactive = true,
  showSuccess = !interactive,
}: Props) {
  const [showToast, setShowToast] = useState(showSuccess);

  const handlePdf = () => {
    if (!interactive) return;
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 2200);
  };

  const toastVisible = showSuccess || showToast;

  return (
    <div className="mkt-receipt-glass">
      <div className="mkt-receipt-glass-inner">
        <div className="mkt-receipt-glass-head">
          <span>ReceiptToPDF</span>
          <span className="mkt-receipt-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>

        {variant === "home" ? (
          <div className="mkt-receipt-dropzone">
            <ReceiptIcon />
          </div>
        ) : null}

        {variant === "capture" ? (
          <>
            <div className="mkt-receipt-camera">📷 촬영 · 갤러리</div>
            <div className="mkt-receipt-thumb-grid">
              <div className="mkt-receipt-thumb on" />
              <div className="mkt-receipt-thumb on" />
              <div className="mkt-receipt-thumb" />
            </div>
          </>
        ) : null}

        {variant === "pdf" ? (
          <div className="mkt-receipt-pdf-preview">A4 PDF · 3페이지</div>
        ) : null}

        <button
          type="button"
          className="mkt-receipt-gradient-btn"
          onClick={handlePdf}
          disabled={!interactive}
        >
          {variant === "pdf" ? "다운로드" : "PDF 만들기"}
        </button>

        <div className={`mkt-receipt-toast${toastVisible ? " show" : ""}`}>
          ✓ 3페이지 PDF 생성 완료
        </div>
      </div>
    </div>
  );
}
