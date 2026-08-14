"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filesFor,
  loadCatalog,
  loadShellBody,
  type Catalog,
  type CatalogItem,
  type Kind,
  type ShellFile,
  type Tab,
} from "./catalog";
import {
  WORK_STATUS_LABEL,
  cycleWorkStatus,
  loadWorkStatusMap,
  saveWorkStatusMap,
  type WorkStatus,
} from "./status";

const TABS: { id: Tab; label: string }[] = [
  { id: "biz", label: "사업관리" },
  { id: "dev", label: "개발관리" },
];

const KIND_ORDER: Kind[] = ["deliverable", "template", "reference"];
const KIND_SHORT: Record<Kind, string> = {
  deliverable: "산출물",
  template: "양식",
  reference: "참고",
};

function MoBadge({ value }: { value: string | null }) {
  if (!value) return <span className="dm-mo empty">-</span>;
  const mark = value.toUpperCase() === "M" ? "M" : value.toUpperCase() === "O" ? "O" : value;
  return (
    <span className={`dm-mo ${mark === "M" ? "mandatory" : "optional"}`} title={mark === "M" ? "필수" : "선택"}>
      {mark}
    </span>
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DeliverableApp() {
  const [tab, setTab] = useState<Tab>("biz");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkStatus>("all");
  const [statusMap, setStatusMap] = useState<Record<string, WorkStatus>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [picker, setPicker] = useState<{
    item: CatalogItem;
    kind: Kind;
    files: ShellFile[];
    title: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    item: CatalogItem;
    file: ShellFile;
    text: string;
    missing: boolean;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadCatalog();
      setCatalog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setStatusMap(loadWorkStatusMap());
    void refreshCatalog();
  }, [refreshCatalog]);

  const items = catalog?.tabs?.[tab] ?? [];
  const phases = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.phase) set.add(item.phase);
    });
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (phaseFilter !== "all" && item.phase !== phaseFilter) return false;
      const st = statusMap[item.id] ?? "none";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!q) return true;
      const hay = [item.phase, item.code, item.activity, item.task, item.output]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, phaseFilter, statusFilter, statusMap]);

  function setItemStatus(id: string, next: WorkStatus) {
    setStatusMap((prev) => {
      const map = { ...prev, [id]: next };
      saveWorkStatusMap(map);
      return map;
    });
  }

  async function openFile(item: CatalogItem, file: ShellFile) {
    setPreviewBusy(true);
    setPicker(null);
    try {
      const body = await loadShellBody(item, file);
      setPreview({ item, file, text: body.text, missing: false });
    } catch {
      setPreview({ item, file, text: "", missing: true });
    } finally {
      setPreviewBusy(false);
    }
  }

  function openKind(item: CatalogItem, kind: Kind, kindLabel: string) {
    const files = filesFor(item, kind);
    if (files.length === 0) return;
    if (files.length === 1) {
      void openFile(item, files[0]);
      return;
    }
    setPicker({
      item,
      kind,
      files,
      title: `${item.output} — ${kindLabel}`,
    });
  }

  const siteHint =
    catalog?.reference_sites?.map((s) => s.label).join(" / ") || "참고 사이트";

  if (error) {
    return (
      <div className="dm">
        <p className="dm-error">목록을 불러오지 못했습니다. {error}</p>
        <button className="dm-tab" type="button" onClick={() => void refreshCatalog()}>
          다시 시도
        </button>
      </div>
    );
  }
  if (loading || !catalog) {
    return <p className="dm-muted">목록 불러오는 중…</p>;
  }

  return (
    <div className="dm">
      <p className="dm-banner">
        공개 테스트용 빈 파일입니다. 실제 보안문서는 회사 PC에만 있습니다. 참고자료는{" "}
        {siteHint} 중 고릅니다. 작성 상태는 이 브라우저에만 저장됩니다.
      </p>
      <div className="dm-toolbar">
        <div className="dm-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "dm-tab active" : "dm-tab"}
              onClick={() => {
                setTab(t.id);
                setPhaseFilter("all");
                setQuery("");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          className="dm-select"
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value)}
        >
          <option value="all">전체 단계</option>
          {phases.map((phase) => (
            <option key={phase} value={phase}>
              {phase}
            </option>
          ))}
        </select>
        <select
          className="dm-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | WorkStatus)}
        >
          <option value="all">전체 상태</option>
          <option value="none">미착수</option>
          <option value="wip">작성중</option>
          <option value="done">완료</option>
        </select>
        <input
          className="dm-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="산출물·코드·활동 검색"
        />
        <button className="dm-tab" type="button" onClick={() => void refreshCatalog()}>
          목록 새로고침
        </button>
        <button className="dm-tab" type="button" onClick={() => setHelpOpen((v) => !v)}>
          목록 갱신 방법
        </button>
      </div>
      {helpOpen ? (
        <div className="dm-help">
          <p>
            산출물목록 Excel이 바뀌면 회사 PC에서 catalog를 다시 만든 뒤 Storage에 올립니다.
            실문서는 올리지 않습니다.
          </p>
          <ol>
            <li>
              원본에서 매칭 재생성:{" "}
              <code>python -m app.build_manifest</code>
            </li>
            <li>
              <code>cd C:\Mywork\MyPlatform\supabase\seed\deliverable-manager</code>
            </li>
            <li>
              <code>python build_placeholders.py</code>
            </li>
            <li>
              <code>python upload_placeholders.py</code> (또는 Dashboard에{" "}
              <code>out/</code> ASCII 경로만 업로드)
            </li>
            <li>이 화면에서 「목록 새로고침」</li>
          </ol>
        </div>
      ) : null}
      <p className="dm-count">
        {filtered.length}건
        {query || phaseFilter !== "all" || statusFilter !== "all"
          ? ` (전체 ${items.length}건 중)`
          : ""}
        {previewBusy ? " · 파일 여는 중…" : ""}
      </p>
      <div className="dm-table-wrap dm-desktop">
        <table className="dm-table">
          <thead>
            <tr>
              <th>단계</th>
              <th>코드</th>
              <th>활동</th>
              <th>작업</th>
              <th>산출물</th>
              <th>대</th>
              <th>중</th>
              <th>소</th>
              <th>상태</th>
              <th>문서</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                catalog={catalog}
                status={statusMap[item.id] ?? "none"}
                onStatus={() =>
                  setItemStatus(item.id, cycleWorkStatus(statusMap[item.id] ?? "none"))
                }
                onOpen={openKind}
              />
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="dm-empty">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ul className="dm-cards dm-mobile">
        {filtered.map((item) => (
          <li key={item.id} className="dm-card">
            <div className="dm-card-top">
              <strong>{item.output}</strong>
              <span className="dm-code">{item.code || "-"}</span>
            </div>
            <p className="dm-card-meta">
              {item.phase}
              {item.activity ? ` · ${item.activity}` : ""}
              {item.task ? ` · ${item.task}` : ""}
            </p>
            <div className="dm-card-mo">
              대 <MoBadge value={item.size_large} /> 중{" "}
              <MoBadge value={item.size_medium} /> 소{" "}
              <MoBadge value={item.size_small} />
            </div>
            <button
              type="button"
              className={`dm-status dm-${statusMap[item.id] ?? "none"}`}
              onClick={() =>
                setItemStatus(item.id, cycleWorkStatus(statusMap[item.id] ?? "none"))
              }
            >
              {WORK_STATUS_LABEL[statusMap[item.id] ?? "none"]}
            </button>
            <div className="dm-actions">
              {KIND_ORDER.map((kind) => (
                <KindBtn
                  key={kind}
                  item={item}
                  kind={kind}
                  label={KIND_SHORT[kind]}
                  full={catalog.kinds[kind]}
                  onOpen={openKind}
                />
              ))}
            </div>
          </li>
        ))}
        {filtered.length === 0 ? <li className="dm-empty">검색 결과가 없습니다.</li> : null}
      </ul>

      {picker ? (
        <div
          className="dm-modal-backdrop"
          onClick={() => setPicker(null)}
          role="presentation"
        >
          <div
            className="dm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="dm-modal-header">
              <h2 id="dm-picker-title">{picker.title}</h2>
              <button
                type="button"
                className="dm-modal-close"
                onClick={() => setPicker(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </header>
            <p className="dm-modal-hint">
              참고 사이트입니다. 하나를 고르면 미리봅니다. ({siteHint})
            </p>
            <ul className="dm-file-list">
              {picker.files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className="dm-file-link"
                    onClick={() => void openFile(picker.item, file)}
                  >
                    <span className="dm-file-name">{file.label || file.name}</span>
                    <span className="dm-file-path">{file.folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div
          className="dm-modal-backdrop"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="dm-modal dm-modal-wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="dm-modal-header">
              <h2>{preview.item.output}</h2>
              <button
                type="button"
                className="dm-modal-close"
                onClick={() => setPreview(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </header>
            <p className="dm-modal-hint">
              {preview.file.label || preview.file.name}
              <br />
              {preview.file.folder}
            </p>
            {preview.missing ? (
              <p className="dm-error">파일이 없습니다. Storage에 아직 없거나 경로가 다릅니다.</p>
            ) : (
              <pre className="dm-preview">{preview.text || "(빈 파일)"}</pre>
            )}
            <div className="dm-modal-actions">
              <button
                type="button"
                className="dm-tab active"
                disabled={preview.missing}
                onClick={() =>
                  downloadText(preview.file.name || `${preview.item.output}.txt`, preview.text)
                }
              >
                다운로드
              </button>
              <button type="button" className="dm-tab" onClick={() => setPreview(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KindBtn({
  item,
  kind,
  label,
  full,
  onOpen,
}: {
  item: CatalogItem;
  kind: Kind;
  label: string;
  full: string;
  onOpen: (item: CatalogItem, kind: Kind, kindLabel: string) => void;
}) {
  const count = filesFor(item, kind).length;
  const missing = count === 0;
  return (
    <button
      type="button"
      className={`dm-kind dm-${kind}${missing ? " dm-kind-missing" : ""}`}
      disabled={missing}
      onClick={() => onOpen(item, kind, full)}
      title={missing ? "매칭된 문서 없음" : full}
    >
      {label}
      {count > 1 ? <span className="dm-count-badge">{count}</span> : null}
      {missing ? <span className="dm-missing-mark">없음</span> : null}
    </button>
  );
}

function ItemRow({
  item,
  catalog,
  status,
  onStatus,
  onOpen,
}: {
  item: CatalogItem;
  catalog: Catalog;
  status: WorkStatus;
  onStatus: () => void;
  onOpen: (item: CatalogItem, kind: Kind, kindLabel: string) => void;
}) {
  return (
    <tr>
      <td>{item.phase}</td>
      <td className="dm-code">{item.code || "-"}</td>
      <td>{item.activity}</td>
      <td>{item.task}</td>
      <td>
        <strong>{item.output}</strong>
      </td>
      <td>
        <MoBadge value={item.size_large} />
      </td>
      <td>
        <MoBadge value={item.size_medium} />
      </td>
      <td>
        <MoBadge value={item.size_small} />
      </td>
      <td>
        <button type="button" className={`dm-status dm-${status}`} onClick={onStatus}>
          {WORK_STATUS_LABEL[status]}
        </button>
      </td>
      <td className="dm-actions">
        {KIND_ORDER.map((kind) => (
          <KindBtn
            key={kind}
            item={item}
            kind={kind}
            label={KIND_SHORT[kind]}
            full={catalog.kinds[kind]}
            onOpen={onOpen}
          />
        ))}
      </td>
    </tr>
  );
}
