"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export default function ChkDbStdPage() {
  const [kind, setKind] = useState<"word" | "term" | "domain" | "code">("word");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function runCheck() {
    if (!file) {
      setMsg("설계서(또는 코드정의서) Excel을 선택하세요.");
      return;
    }
    setBusy(true);
    setMsg("점검 중… (결과는 기기에 다운로드됩니다)");
    try {
      const fd = new FormData();
      fd.append("design", file);
      fd.append("kind", kind);
      const res = await fetch(`${API_BASE}/v1/chk-db-std/run`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        let detail = "실행 실패";
        try {
          const j = await res.json();
          detail = j.detail || j.error || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const m = /filename=\"?([^\";]+)\"?/.exec(disp);
      const fname = m?.[1] || `chkdbstd_${kind}_result.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg("완료 — 결과 파일을 기기에 저장했습니다.");
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Link className="back" href="/">
        ← MyPlatform
      </Link>
      <section className="hero">
        <h1>ChkDBStd</h1>
        <p>
          모바일/웹에서 설계서를 올려 점검을 실행하고, 결과 Excel만 기기에
          받습니다. 공통 표준 파일은 API 서버(또는 Supabase Storage)에 둡니다.
        </p>
      </section>

      <section className="panel">
        <h3>점검 실행</h3>
        <p className="hint">
          API: <code>{API_BASE}</code>
          <br />
          로컬 API:{" "}
          <code>cd C:\Mywork\MyPlatform\apps\api && uvicorn main:app --reload</code>
        </p>
        <div className="row">
          <label>
            종류{" "}
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "word" | "term" | "domain" | "code")
              }
            >
              <option value="word">표준단어</option>
              <option value="term">표준용어</option>
              <option value="domain">표준도메인</option>
              <option value="code">표준코드</option>
            </select>
          </label>
        </div>
        <div className="row">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={runCheck}
          >
            {busy ? "실행 중…" : "점검 후 결과 다운로드"}
          </button>
        </div>
        <p className={`msg ${msg.includes("완료") ? "ok" : msg.includes("실패") || msg.includes("Error") ? "err" : ""}`}>
          {msg}
        </p>
      </section>
    </main>
  );
}
