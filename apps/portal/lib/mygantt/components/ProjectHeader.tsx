import type { LibraryItem } from "../storage";
import type { Project } from "../types";

interface Props {
  project: Project;
  savedAt: string | null;
  shareId: string | null;
  canEditShare: boolean;
  shareStatus: string | null;
  shareBusy: boolean;
  shareConfigured: boolean;
  libraryItems: LibraryItem[];
  activeId: string;
  readOnly: boolean;
  onChange: (patch: Partial<Project>) => void;
  onImportFile: (file: File) => void;
  onExportExcel: () => void;
  onExportJson: () => void;
  onOpenHolidays: () => void;
  onReset: () => void;
  onCreateShare: () => void;
  onCopyShareLink: (kind: "view" | "edit") => void;
  onLeaveShare: () => void;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: () => void;
  onAsOfToday: () => void;
  onPrint: () => void;
}

export function ProjectHeader({
  project,
  savedAt,
  shareId,
  canEditShare,
  shareStatus,
  shareBusy,
  shareConfigured,
  libraryItems,
  activeId,
  readOnly,
  onChange,
  onImportFile,
  onExportExcel,
  onExportJson,
  onOpenHolidays,
  onReset,
  onCreateShare,
  onCopyShareLink,
  onLeaveShare,
  onSwitchProject,
  onNewProject,
  onDuplicateProject,
  onDeleteProject,
  onAsOfToday,
  onPrint,
}: Props) {
  const saveHint = shareId
    ? canEditShare
      ? "이 브라우저 + 클라우드(편집 링크)"
      : "읽기 전용 공유 · 이 브라우저에는 복사본만 둡니다"
    : "이 브라우저에만 저장 · 다른 PC는 JSON/엑셀/공유 필요";

  return (
    <header className="project-header">
      <div className="brand-block">
        <h1 className="brand">MyGantt</h1>
        <input
          className="project-title"
          value={project.name}
          disabled={readOnly}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="프로젝트명"
        />
        <div className="share-badge">
          {shareId ? (
            <span className={canEditShare ? "share-on" : "share-view"}>
              {canEditShare ? `공유 편집 · ${shareId}` : `공유 보기 · ${shareId}`}
            </span>
          ) : (
            <span className="share-off">로컬만 저장</span>
          )}
          {shareStatus && <span className="share-msg">{shareStatus}</span>}
        </div>
        <p className="save-hint">{saveHint}</p>
        <label className="lib-select">
          <span>프로젝트</span>
          <select
            value={activeId}
            onChange={(e) => onSwitchProject(e.target.value)}
            disabled={Boolean(shareId)}
            title={shareId ? "공유 중에는 로컬 목록을 바꾸지 않습니다" : "이 브라우저에 저장된 프로젝트"}
          >
            {libraryItems.map((it) => (
              <option key={it.id} value={it.id}>
                {it.project.name || "이름 없음"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="meta-grid">
        <label>
          <span>업체명</span>
          <input
            value={project.company}
            disabled={readOnly}
            onChange={(e) => onChange({ company: e.target.value })}
          />
        </label>
        <label>
          <span>Project Manager</span>
          <input
            value={project.manager}
            disabled={readOnly}
            onChange={(e) => onChange({ manager: e.target.value })}
          />
        </label>
        <label>
          <span>Project Start Date</span>
          <input
            type="date"
            value={project.startDate}
            disabled={readOnly}
            onChange={(e) => {
              const startDate = e.target.value;
              const patch: Partial<Project> = { startDate };
              if (project.endDate && startDate && project.endDate < startDate) {
                patch.endDate = startDate;
              }
              onChange(patch);
            }}
          />
        </label>
        <label>
          <span>Project End Date</span>
          <input
            type="date"
            value={project.endDate}
            min={project.startDate}
            disabled={readOnly}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </label>
        <label>
          <span>기준일 (오늘/시뮬레이션)</span>
          <span className="asof-row">
            <input
              type="date"
              value={project.asOfDate}
              disabled={readOnly}
              onChange={(e) =>
                onChange({ asOfDate: e.target.value || project.startDate })
              }
            />
            <button
              type="button"
              className="btn btn-tiny"
              disabled={readOnly}
              onClick={onAsOfToday}
            >
              오늘
            </button>
          </span>
        </label>
        <label>
          <span>Display Week</span>
          <input
            type="number"
            min={1}
            value={project.displayWeek}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ displayWeek: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
      </div>

      <div className="header-actions">
        <button type="button" className="btn" onClick={onNewProject} disabled={Boolean(shareId)}>
          새 프로젝트
        </button>
        <button
          type="button"
          className="btn"
          onClick={onDuplicateProject}
          disabled={Boolean(shareId)}
        >
          복제
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onDeleteProject}
          disabled={Boolean(shareId)}
        >
          삭제
        </button>

        {!shareId ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={shareBusy}
            data-wq-target="share_create"
            onClick={onCreateShare}
            title={
              shareConfigured
                ? "서버에 저장하고 보기/편집 링크를 만듭니다"
                : "Supabase .env 설정이 필요합니다"
            }
          >
            {shareBusy ? "공유 생성 중…" : "공유 링크 만들기"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={shareBusy}
              title="읽기 전용 주소를 복사하거나 엽니다"
              data-wq-target="share_dialog"
              onClick={() => onCopyShareLink("view")}
            >
              보기 링크
            </button>
            {canEditShare && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={shareBusy}
                title="함께 수정할 수 있는 주소를 복사하거나 엽니다"
                onClick={() => onCopyShareLink("edit")}
              >
                편집 링크
              </button>
            )}
            <button type="button" className="btn" onClick={onLeaveShare}>
              로컬로 전환
            </button>
          </>
        )}
        <button
          type="button"
          className="btn"
          data-wq-target="holiday_dialog"
          onClick={onOpenHolidays}
        >
          휴일목록 ({project.holidays.length})
        </button>
        <a
          className="btn"
          href={encodeURI("/samples/my-gantt/일정계획_템플릿.xlsx")}
          download
        >
          템플릿
        </a>
        <label className="btn btn-file">
          가져오기
          <input
            type="file"
            accept=".xlsx,.xls,.json,application/json"
            hidden
            disabled={readOnly}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="btn" onClick={onExportExcel}>
          엑셀
        </button>
        <button type="button" className="btn" onClick={onExportJson}>
          JSON
        </button>
        <button type="button" className="btn" data-wq-target="print_dialog" onClick={onPrint}>
          인쇄
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={readOnly}
          onClick={onReset}
        >
          초기화
        </button>
        <span className="save-status">
          {savedAt ? `저장됨 ${savedAt}` : "저장 대기"}
        </span>
      </div>
    </header>
  );
}
