"use client";

import { useState } from "react";
import { resetDirectScanApiConfig } from "@/lib/localScanApi";

/**
 * IPMS 2차 암호 입력창 — 성능 진단 등에서 사용 (웹 품질 진단과 같은 모양·클래스).
 * 성공하면 서버가 서명된 해제 쿠키를 심고, Render 직접 호출 토큰도 IPMS 권한으로 다시 받습니다.
 */
export function IpmsUnlockDialog({
  open,
  title = "IPMS 진단 2차 암호",
  description,
  onClose,
  onUnlocked,
  endpoint = "/api/portal/ipms-unlock",
  notConfiguredText = "서버에 IPMS_UNLOCK_PASSWORD 가 설정되지 않았습니다.",
}: {
  open: boolean;
  title?: string;
  description?: React.ReactNode;
  onClose: () => void;
  onUnlocked: () => void;
  /** 같은 모양으로 다른 잠금(DB 등)에도 사용 */
  endpoint?: string;
  notConfiguredText?: string;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit() {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(
          j.error === "not_configured"
            ? notConfiguredText
            : j.error === "forbidden"
              ? "현재 로그인 상태에서는 이 기능을 사용할 수 없습니다. 정식 로그인 후 다시 시도하세요."
              : "암호가 올바르지 않습니다.",
        );
        return;
      }
      resetDirectScanApiConfig();
      setInput("");
      onUnlocked();
    } catch {
      setError("확인 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wq-ipms-unlock-overlay" role="presentation">
      <div className="panel wq-ipms-unlock-dialog" role="dialog" aria-labelledby="ipms-unlock-title">
        <h2 id="ipms-unlock-title">{title}</h2>
        <p className="hint">
          {description ?? (
            <>
              <strong>IPMS</strong> 기능을 사용하려면 추가 암호를 입력하세요.
            </>
          )}
        </p>
        <label className="login-label">
          암호
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") onClose();
            }}
            autoFocus
            disabled={busy}
          />
        </label>
        {error ? <p className="msg err">{error}</p> : null}
        <div className="source-scan-actions-primary">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !input.trim()}
            onClick={() => void submit()}
          >
            {busy ? "확인 중…" : "확인"}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              setInput("");
              onClose();
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
