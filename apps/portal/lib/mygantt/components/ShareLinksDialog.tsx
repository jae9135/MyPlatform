import { useState } from "react";

interface Props {
  viewUrl: string;
  editUrl: string | null;
  onClose: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function LinkRow({
  label,
  hint,
  url,
}: {
  label: string;
  hint: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    if (!ok) window.prompt("링크를 복사하세요", url);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-link-row">
      <strong>{label}</strong>
      <span className="modal-hint">{hint}</span>
      <div className="share-link-bar">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={onCopy}>
          {copied ? "복사됨" : "복사"}
        </button>
        <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer">
          열기
        </a>
      </div>
    </div>
  );
}

export function ShareLinksDialog({ viewUrl, editUrl, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal share-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="share-title"
        data-wq-state="share_dialog"
      >
        <div className="modal-header">
          <h2 id="share-title">공유 링크</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="modal-hint">
          링크를 받은 사람은 포털 로그인 후 이 주소로 일정을 엽니다.
          주소만 알면 접근되므로 필요한 사람에게만 보내세요.
        </p>
        <LinkRow
          label="보기 링크"
          hint="일정·간트를 보기만 합니다. 수정·저장은 할 수 없습니다."
          url={viewUrl}
        />
        {editUrl ? (
          <LinkRow
            label="편집 링크"
            hint="같은 일정을 함께 고칠 수 있습니다. 키(k)가 들어 있으니 더 조심히 공유하세요."
            url={editUrl}
          />
        ) : (
          <p className="modal-hint">이 창은 보기 전용이라 편집 링크가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
