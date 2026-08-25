"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ProjectHeader } from "./components/ProjectHeader";
import { TaskTable } from "./components/TaskTable";
import { GanttChart } from "./components/GanttChart";
import { HolidayEditor } from "./components/HolidayEditor";
import { PrintDialog, type PrintMode } from "./components/PrintDialog";
import { PrintChartSheet } from "./components/PrintChartSheet";
import { ShareLinksDialog } from "./components/ShareLinksDialog";
import {
  clampTaskDates,
  computeProject,
  deleteSubtree,
  ganttDayCount,
  indentSubtree,
  moveSubtree,
  outdentSubtree,
} from "./compute";
import {
  buildShareUrl,
  createSharedProject,
  fetchSharedProject,
  getShareFromUrl,
  isShareConfigured,
  saveSharedProject,
  setShareInUrl,
} from "./share";
import {
  addProject,
  duplicateActive,
  getActive,
  loadLibrary,
  persistLibrary,
  removeActive,
  switchActive,
  upsertActive,
  type LibraryState,
} from "./storage";
import { koreanHolidaysInRange, mergeHolidays } from "./holidaysKr";
import { subtreeEnd } from "./wbs";
import {
  createEmptyProject,
  createEmptyTask,
  formatIso,
  normalizeTask,
  type Project,
  type Task,
} from "./types";

const SPLIT_KEY = "mygantt.splitRatio";
const SPLIT_MIN = 0.28;
const SPLIT_MAX = 0.78;

function loadSplitRatio(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX) return v;
  } catch {
    /* ignore */
  }
  return 0.58;
}

function nowLabel(): string {
  const t = new Date();
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
}

const SETUP_HINT = `공유 기능을 쓰려면 포털 Supabase 설정이 필요합니다.

1) apps/portal/.env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
2) Supabase SQL Editor에서 gantt_projects 마이그레이션(RPC 포함) 실행
3) 개발 서버 재시작`;

export default function GanttApp() {
  const [library, setLibrary] = useState<LibraryState>(() => loadLibrary());
  const [project, setProject] = useState<Project>(
    () => getActive(loadLibrary()).project,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [pane, setPane] = useState<"table" | "gantt">("table");
  const urlShare = getShareFromUrl();
  const [shareId, setShareId] = useState<string | null>(() => urlShare?.id ?? null);
  const [editKey, setEditKey] = useState<string | null>(
    () => urlShare?.editKey ?? null,
  );
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [bootLoading, setBootLoading] = useState(() => Boolean(urlShare?.id));
  const syncing = useRef(false);
  const skipCloudSave = useRef(true);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const shareConfigured = isShareConfigured();
  const canEditShare = Boolean(shareId && editKey);
  const readOnly = Boolean(shareId && !editKey);

  const metricsKey = useMemo(
    () =>
      [
        project.startDate,
        project.endDate,
        project.asOfDate,
        project.displayWeek,
        project.holidays.map((h) => h.date).join(","),
        project.tasks
          .map(
            (t) =>
              `${t.id}:${t.level}:${t.planStart}:${t.planEnd}:${t.actualStart}:${t.actualEnd}:${t.manDay}:${t.actualPct}`,
          )
          .join("|"),
      ].join("#"),
    [project],
  );

  const computedBundle = useMemo(() => {
    void metricsKey;
    return computeProject(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsKey]);

  const computed = useMemo(() => {
    return computedBundle.tasks.map((c, i) => {
      const t = project.tasks[i];
      if (!t || t.name === c.name) return c;
      return { ...c, name: t.name };
    });
  }, [computedBundle, project.tasks]);

  const totals = computedBundle.totals;
  const deferredComputed = useDeferredValue(computed);
  const dayCount = useMemo(() => ganttDayCount(project), [project]);

  useEffect(() => {
    const ref = getShareFromUrl();
    if (!ref) {
      const active = getActive(library);
      setShareId(active.shareId);
      setEditKey(active.editKey);
      setBootLoading(false);
      return;
    }
    if (!shareConfigured) {
      setShareStatus("공유 링크인데 Supabase 설정이 없습니다");
      setBootLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setShareBusy(true);
        setShareStatus("공유 프로젝트 불러오는 중…");
        const remote = await fetchSharedProject(ref.id);
        if (cancelled) return;
        skipCloudSave.current = true;
        setProject({
          ...remote,
          tasks: remote.tasks.map((t) => normalizeTask(t)),
          asOfDate: remote.asOfDate || createEmptyProject().asOfDate,
        });
        setShareId(ref.id);
        setEditKey(ref.editKey);
        setShareStatus(ref.editKey ? "공유 편집 모드" : "읽기 전용으로 열림");
        setSavedAt(nowLabel());
      } catch (err) {
        if (cancelled) return;
        setShareStatus(err instanceof Error ? err.message : "로드 실패");
      } finally {
        if (!cancelled) {
          setShareBusy(false);
          setBootLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareConfigured]);

  useEffect(() => {
    const localTimer = window.setTimeout(() => {
      if (!readOnly) {
        setLibrary((lib) =>
          upsertActive(lib, project, { shareId, editKey }),
        );
      }
      setSavedAt(nowLabel());
    }, 400);

    if (!shareId || !editKey || !shareConfigured) {
      return () => window.clearTimeout(localTimer);
    }
    if (skipCloudSave.current) {
      skipCloudSave.current = false;
      return () => window.clearTimeout(localTimer);
    }

    const cloudTimer = window.setTimeout(async () => {
      try {
        await saveSharedProject(shareId, editKey, project);
        setShareStatus("클라우드 저장됨");
        setSavedAt(nowLabel());
      } catch (err) {
        setShareStatus(
          err instanceof Error ? `저장 실패: ${err.message}` : "저장 실패",
        );
      }
    }, 800);

    return () => {
      window.clearTimeout(localTimer);
      window.clearTimeout(cloudTimer);
    };
  }, [project, shareId, editKey, shareConfigured, readOnly]);

  const selectedIndex = useMemo(() => {
    if (!selectedId) return -1;
    return project.tasks.findIndex((t) => t.id === selectedId);
  }, [project.tasks, selectedId]);

  const patchProject = useCallback((patch: Partial<Project>) => {
    if (readOnly) return;
    const soft = "name" in patch || "company" in patch || "manager" in patch;
    const apply = () => setProject((p) => ({ ...p, ...patch }));
    if (soft) apply();
    else startTransition(apply);
  }, [readOnly]);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    if (readOnly) return;
    const softOnly = Object.keys(patch).every(
      (k) => k === "name" || k === "lead" || k === "deliverable",
    );
    const apply = () =>
      setProject((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== id) return t;
          const clamped = clampTaskDates(t, p.startDate, patch);
          return { ...t, ...clamped };
        }),
      }));
    if (softOnly) apply();
    else startTransition(apply);
  }, [readOnly]);

  const onMovePlan = useCallback(
    (id: string, planStart: string, planEnd: string) => {
      updateTask(id, { planStart, planEnd });
    },
    [updateTask],
  );

  const onAdd = () => {
    if (readOnly) return;
    setProject((p) => {
      const level = selectedIndex >= 0 ? p.tasks[selectedIndex].level : 0;
      const task = createEmptyTask(level);
      if (selectedIndex < 0) {
        return { ...p, tasks: [...p.tasks, task] };
      }
      const end = subtreeEnd(p.tasks, selectedIndex);
      const tasks = [
        ...p.tasks.slice(0, end + 1),
        task,
        ...p.tasks.slice(end + 1),
      ];
      return { ...p, tasks };
    });
  };

  const onAddChild = () => {
    if (readOnly || selectedIndex < 0) return;
    setProject((p) => {
      const parent = p.tasks[selectedIndex];
      const task = createEmptyTask(parent.level + 1);
      const end = subtreeEnd(p.tasks, selectedIndex);
      const tasks = [
        ...p.tasks.slice(0, end + 1),
        task,
        ...p.tasks.slice(end + 1),
      ];
      return { ...p, tasks };
    });
  };

  const onDelete = () => {
    if (readOnly || selectedIndex < 0) return;
    setProject((p) => ({
      ...p,
      tasks: deleteSubtree(p.tasks, selectedIndex),
    }));
    setSelectedId(null);
  };

  const onIndent = () => {
    if (readOnly || selectedIndex < 0) return;
    setProject((p) => ({
      ...p,
      tasks: indentSubtree(p.tasks, selectedIndex),
    }));
  };

  const onOutdent = () => {
    if (readOnly || selectedIndex < 0) return;
    setProject((p) => ({
      ...p,
      tasks: outdentSubtree(p.tasks, selectedIndex),
    }));
  };

  const onMoveUp = () => {
    if (readOnly || selectedIndex < 0) return;
    setProject((p) => ({
      ...p,
      tasks: moveSubtree(p.tasks, selectedIndex, -1),
    }));
  };

  const onMoveDown = () => {
    if (readOnly || selectedIndex < 0) return;
    setProject((p) => ({
      ...p,
      tasks: moveSubtree(p.tasks, selectedIndex, 1),
    }));
  };

  const onImportFile = async (file: File) => {
    if (readOnly) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".json")) {
      const text = await file.text();
      const { importProjectFromJson } = await import("./jsonBackup");
      setProject(importProjectFromJson(text));
    } else {
      const buf = await file.arrayBuffer();
      const { importProjectFromExcel } = await import("./excelImport");
      setProject(importProjectFromExcel(buf));
    }
    setSelectedId(null);
  };

  const onExportExcel = async () => {
    const { exportProjectToExcel } = await import("./excelExport");
    exportProjectToExcel(project, computed, totals);
  };

  const onExportJson = async () => {
    const { exportProjectToJson } = await import("./jsonBackup");
    exportProjectToJson(project);
  };

  const onReset = () => {
    if (readOnly) return;
    if (!confirm("이 프로젝트를 비울까요? 목록의 다른 프로젝트는 유지됩니다.")) {
      return;
    }
    setProject(createEmptyProject());
    setSelectedId(null);
  };

  const onCreateShare = async () => {
    if (!shareConfigured) {
      alert(SETUP_HINT);
      return;
    }
    try {
      setShareBusy(true);
      setShareStatus("공유 링크 생성 중…");
      const created = await createSharedProject(project);
      skipCloudSave.current = true;
      setShareId(created.id);
      setEditKey(created.editKey);
      setShareInUrl({ id: created.id, editKey: created.editKey });
      setShareStatus("공유 링크가 만들어졌습니다. 보기/편집 링크를 복사해 보내세요.");
      setShareOpen(true);
    } catch (err) {
      setShareStatus(err instanceof Error ? err.message : "공유 생성 실패");
      alert(err instanceof Error ? err.message : "공유 생성 실패");
    } finally {
      setShareBusy(false);
    }
  };

  const onCopyShareLink = (_kind: "view" | "edit") => {
    if (!shareId) return;
    setShareOpen(true);
  };

  const onLeaveShare = () => {
    if (
      !confirm(
        "공유를 끊고 이 브라우저 로컬 전용으로 전환할까요?\n(서버 데이터는 삭제되지 않습니다)",
      )
    ) {
      return;
    }
    setShareId(null);
    setEditKey(null);
    setShareInUrl(null);
    setShareStatus("로컬 모드로 전환됨");
  };

  const flushCurrent = (lib: LibraryState) =>
    upsertActive(lib, project, { shareId, editKey });

  const onSwitchProject = (id: string) => {
    const nextLib = switchActive(flushCurrent(library), id);
    setLibrary(nextLib);
    const item = getActive(nextLib);
    setProject(item.project);
    setShareId(item.shareId);
    setEditKey(item.editKey);
    setShareInUrl(
      item.shareId
        ? { id: item.shareId, editKey: item.editKey }
        : null,
    );
    setSelectedId(null);
  };

  const onNewProject = () => {
    const nextLib = addProject(flushCurrent(library));
    setLibrary(nextLib);
    const item = getActive(nextLib);
    setProject(item.project);
    setShareId(null);
    setEditKey(null);
    setShareInUrl(null);
    setSelectedId(null);
  };

  const onDuplicateProject = () => {
    const nextLib = duplicateActive(flushCurrent(library));
    setLibrary(nextLib);
    const item = getActive(nextLib);
    setProject(item.project);
    setShareId(null);
    setEditKey(null);
    setShareInUrl(null);
    setSelectedId(null);
  };

  const onDeleteProject = () => {
    if (!confirm("이 프로젝트를 목록에서 삭제할까요?")) return;
    const nextLib = removeActive(library);
    persistLibrary(nextLib.items, nextLib.activeId);
    setLibrary(nextLib);
    const item = getActive(nextLib);
    setProject(item.project);
    setShareId(item.shareId);
    setEditKey(item.editKey);
    setSelectedId(null);
  };

  const syncScroll = (source: "table" | "gantt") => {
    if (syncing.current) return;
    syncing.current = true;
    const from =
      source === "table" ? tableScrollRef.current : ganttScrollRef.current;
    const to =
      source === "table" ? ganttScrollRef.current : tableScrollRef.current;
    if (from && to) to.scrollTop = from.scrollTop;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  const onSplitterPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("is-resizing");
  };

  const onSplitterPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = (e.clientX - rect.left) / rect.width;
    setSplitRatio(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, next)));
  };

  const onSplitterPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove("is-resizing");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    localStorage.setItem(SPLIT_KEY, String(splitRatio));
  }, [splitRatio]);

  const runPrint = useCallback((mode: PrintMode) => {
    setPrintOpen(false);
    const apply = () => {
      const root = document.documentElement;
      const shell = document.querySelector(".gantt-shell");
      root.classList.remove("print-mode-table", "print-mode-chart");
      shell?.classList.remove("print-mode-table", "print-mode-chart");
      const cls = mode === "table" ? "print-mode-table" : "print-mode-chart";
      root.classList.add(cls);
      shell?.classList.add(cls);

      let pageStyle = document.getElementById("mygantt-print-page");
      if (!pageStyle) {
        pageStyle = document.createElement("style");
        pageStyle.id = "mygantt-print-page";
        document.head.appendChild(pageStyle);
      }
      pageStyle.textContent = "@page { margin: 8mm; }";

      const cleanup = () => {
        root.classList.remove("print-mode-table", "print-mode-chart");
        shell?.classList.remove("print-mode-table", "print-mode-chart");
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
    };
    window.setTimeout(apply, 80);
  }, []);

  if (bootLoading) {
    return (
      <div className="app boot-loading">
        <p>공유 프로젝트를 불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className={`app${readOnly ? " is-readonly" : ""}`}>
      <ProjectHeader
        project={project}
        savedAt={savedAt}
        shareId={shareId}
        canEditShare={canEditShare}
        shareStatus={shareStatus}
        shareBusy={shareBusy}
        shareConfigured={shareConfigured}
        libraryItems={library.items}
        activeId={library.activeId}
        readOnly={readOnly}
        onChange={patchProject}
        onImportFile={onImportFile}
        onExportExcel={onExportExcel}
        onExportJson={onExportJson}
        onOpenHolidays={() => setHolidaysOpen(true)}
        onReset={onReset}
        onCreateShare={onCreateShare}
        onCopyShareLink={onCopyShareLink}
        onLeaveShare={onLeaveShare}
        onSwitchProject={onSwitchProject}
        onNewProject={onNewProject}
        onDuplicateProject={onDuplicateProject}
        onDeleteProject={onDeleteProject}
        onAsOfToday={() => patchProject({ asOfDate: formatIso(new Date()) })}
        onPrint={() => setPrintOpen(true)}
      />

      <div className="workspace-tabs" role="tablist" aria-label="보기">
        <button
          type="button"
          className={pane === "table" ? "active" : ""}
          data-wq-target="main_table_pane"
          onClick={() => setPane("table")}
        >
          표
        </button>
        <button
          type="button"
          className={pane === "gantt" ? "active" : ""}
          data-wq-target="gantt_pane"
          onClick={() => setPane("gantt")}
        >
          간트
        </button>
      </div>

      <div
        className={`workspace pane-${pane}`}
        ref={workspaceRef}
        data-wq-state={pane === "gantt" ? "gantt_pane" : "main_table_pane"}
      >
        <div className="workspace-left" style={{ width: `${splitRatio * 100}%` }}>
          <TaskTable
            tasks={project.tasks}
            computed={computed}
            totals={totals}
            projectStartDate={project.startDate}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdateTask={updateTask}
            onAdd={onAdd}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onIndent={onIndent}
            onOutdent={onOutdent}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            scrollRef={tableScrollRef}
            onScroll={() => syncScroll("table")}
            readOnly={readOnly}
          />
        </div>
        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="테이블과 간트 구분선"
          aria-valuenow={Math.round(splitRatio * 100)}
          tabIndex={0}
          onPointerDown={onSplitterPointerDown}
          onPointerMove={onSplitterPointerMove}
          onPointerUp={onSplitterPointerUp}
          onPointerCancel={onSplitterPointerUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              setSplitRatio((r) => Math.max(SPLIT_MIN, r - 0.02));
            } else if (e.key === "ArrowRight") {
              setSplitRatio((r) => Math.min(SPLIT_MAX, r + 0.02));
            }
          }}
        />
        <div className="workspace-right">
          <GanttChart
            projectStart={project.startDate}
            projectEnd={project.endDate}
            asOfDate={project.asOfDate}
            displayWeek={project.displayWeek}
            holidays={project.holidays}
            computed={deferredComputed}
            dayCount={dayCount}
            scrollRef={ganttScrollRef}
            onScroll={() => syncScroll("gantt")}
            readOnly={readOnly}
            onMovePlan={onMovePlan}
          />
        </div>
      </div>

      <PrintChartSheet
        project={project}
        computed={deferredComputed}
        totals={totals}
        dayCount={dayCount}
      />

      {shareOpen && shareId && (
        <ShareLinksDialog
          viewUrl={buildShareUrl(shareId, "view")}
          editUrl={editKey ? buildShareUrl(shareId, "edit", editKey) : null}
          onClose={() => setShareOpen(false)}
        />
      )}

      {printOpen && (
        <PrintDialog onPick={runPrint} onClose={() => setPrintOpen(false)} />
      )}

      {holidaysOpen && (
        <HolidayEditor
          holidays={project.holidays}
          readOnly={readOnly}
          onChange={(holidays) => patchProject({ holidays })}
          onFillKorean={() =>
            patchProject({
              holidays: mergeHolidays(
                project.holidays,
                koreanHolidaysInRange(project.startDate, project.endDate),
              ),
            })
          }
          onClose={() => setHolidaysOpen(false)}
        />
      )}
    </div>
  );
}
