"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { BlogAccount, BlogAsset, BlogPlatform, BlogPost, BlogPostEditStatus, BlogPostTarget, BlogPublishHistory, BlogSchedule } from "@/lib/blogShared";
import { createBlogCopyHtml, createBlogPreviewHtml, htmlToPlainText } from "@/lib/blogHtml";

type Dashboard = {
  posts: { total: number; draft: number; ready: number; archived: number };
  activeAccounts: number;
  plannedSchedules: number;
  upcomingSchedules: BlogSchedule[];
  recentHistory: BlogPublishHistory[];
};
type Tab = "dashboard" | "posts" | "images" | "support" | "settings";
type BlogImageRow = { asset: BlogAsset; signedUrl: string };
type ImportedPostInfo = {
  title: string;
  platformCode: "naver" | "tistory" | null;
  categoryName: string | null;
  originalFileName: string | null;
  importedAt: string | null;
};
type ImageCleanup = { id: string; action: string; status: string; attempts: number; last_error_code: string | null; next_attempt_at: string | null; created_at: string };
type ImportCleanup = { id: string; import_id: string; target_type: string; target_id: string; status: string; attempts: number; max_attempts: number; error_code: string | null; next_attempt_at: string | null; created_at: string };
type PostForm = { title: string; excerpt: string; body_markdown: string; body_html: string; edit_status: BlogPostEditStatus };
type AccountForm = { platform_id: string; account_name: string; blog_url: string; notes: string; active: boolean };

const MENU = [
  ["바로 게시하기", "support"], ["대시보드", "dashboard"], ["원고 관리", "posts"],
  ["게시 일정", "schedules"], ["이미지 관리", "images"], ["게시 이력", "history"], ["플랫폼·계정", "settings"],
] as const;
const SCHEDULE_STATUS: Record<BlogSchedule["status"], string> = {
  planned: "게시 예정", completed: "게시 완료", cancelled: "취소", missed: "누락",
};
const EMPTY_FORM: AccountForm = { platform_id: "", account_name: "", blog_url: "", notes: "", active: true };
const EMPTY_POST_FORM: PostForm = { title: "", excerpt: "", body_markdown: "", body_html: "", edit_status: "draft" };
const POST_STATUS: Record<BlogPostEditStatus, string> = { draft: "작성 중", ready: "게시 준비", archived: "보관" };

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ko-KR");
}
function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallback;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, "요청을 처리하지 못했습니다."));
  return (payload as { data: T }).data;
}

export function BlogWorkspace() {
  const [tab, setTab] = useState<Tab>("support");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [platforms, setPlatforms] = useState<BlogPlatform[]>([]);
  const [accounts, setAccounts] = useState<BlogAccount[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [images, setImages] = useState<BlogImageRow[]>([]);
  const [cleanupJobs, setCleanupJobs] = useState<ImageCleanup[]>([]);
  const [importCleanupJobs, setImportCleanupJobs] = useState<ImportCleanup[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [lastImportedInfo, setLastImportedInfo] = useState<ImportedPostInfo | null>(null);
  const [imageAltText, setImageAltText] = useState("");
  const [postForm, setPostForm] = useState<PostForm>(EMPTY_POST_FORM);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postSearch, setPostSearch] = useState("");
  const [postStatus, setPostStatus] = useState<"all" | BlogPostEditStatus>("all");
  const [supportPostId, setSupportPostId] = useState("");
  const [supportPlatformCode, setSupportPlatformCode] = useState<"naver" | "tistory">("naver");
  const [supportPlatformByPostId, setSupportPlatformByPostId] = useState<Record<string, "naver" | "tistory">>({});
  const [accountPlatformById, setAccountPlatformById] = useState<Record<string, "naver" | "tistory">>({});
  const [previewImage, setPreviewImage] = useState<BlogImageRow | null>(null);
  const supportPreviewRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError("");
    try { setDashboard(await api<Dashboard>("/api/admin/blog/dashboard")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "대시보드를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (postSearch.trim()) params.set("search", postSearch.trim());
      if (postStatus !== "all") params.set("editStatus", postStatus);
      setPosts(await api<BlogPost[]>(`/api/admin/blog/posts?${params.toString()}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "원고 목록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [postSearch, postStatus]);

  const loadSettings = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [platformRows, accountRows] = await Promise.all([
        api<BlogPlatform[]>("/api/admin/blog/platforms"), api<BlogAccount[]>("/api/admin/blog/accounts"),
      ]);
      setPlatforms(platformRows); setAccounts(accountRows);
      setForm((current) => ({ ...current, platform_id: current.platform_id || platformRows[0]?.id || "" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "플랫폼·계정 정보를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  const loadImages = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [imageRows, cleanupRows] = await Promise.all([
        api<BlogImageRow[]>("/api/admin/blog/images?limit=200"),
        api<ImageCleanup[]>("/api/admin/blog/images/cleanup?limit=100"),
      ]);
      setImages(imageRows); setCleanupJobs(cleanupRows);
      setImportCleanupJobs(await api<ImportCleanup[]>('/api/admin/blog/import-cleanup?limit=100'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "이미지 목록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  const processImportCleanup = useCallback(async () => {
    setSaving(true); setError("");
    try {
      await api<{ processed: number; failed: number }>("/api/admin/blog/import-cleanup?limit=20", { method: "POST" });
      setImportCleanupJobs(await api<ImportCleanup[]>("/api/admin/blog/import-cleanup?limit=100"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "가져오기 정리 작업을 처리하지 못했습니다."); }
    finally { setSaving(false); }
  }, []);

  const resolvePostPlatform = useCallback(async (
    postId: string,
    accountPlatformLookup: Record<string, "naver" | "tistory"> = accountPlatformById,
  ) => {
    const cached = supportPlatformByPostId[postId];
    if (cached) {
      setSupportPlatformCode(cached);
      return;
    }
    const targets = await api<BlogPostTarget[]>(`/api/admin/blog/posts/${postId}/targets`);
    const platformCodes = Array.from(new Set(
      targets.map((target) => accountPlatformLookup[target.account_id]).filter((code): code is "naver" | "tistory" => Boolean(code)),
    ));
    // 한 플랫폼에만 연결된 원고는 해당 플랫폼을 자동 선택한다.
    // 여러 플랫폼에 연결된 원고는 사용자가 직접 선택하도록 현재 선택을 유지한다.
    if (platformCodes.length === 1) {
      const code = platformCodes[0];
      setSupportPlatformCode(code);
      setSupportPlatformByPostId((current) => ({ ...current, [postId]: code }));
    }
  }, [accountPlatformById, supportPlatformByPostId]);

  const loadSupport = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [allPostRows, imageRows, accountRows, platformRows] = await Promise.all([
        api<BlogPost[]>("/api/admin/blog/posts?limit=200"),
        api<BlogImageRow[]>("/api/admin/blog/images?limit=200"),
        api<BlogAccount[]>("/api/admin/blog/accounts"),
        api<BlogPlatform[]>("/api/admin/blog/platforms"),
      ]);
      // 게시 지원은 작성 상태와 무관하게 보관되지 않은 가져온 원고를 바로 게시할 수 있게 한다.
      const postRows = allPostRows.filter((post) => post.edit_status !== "archived");
      const platformById = new Map(platformRows.map((platform) => [platform.id, platform.code]));
      const accountLookup: Record<string, "naver" | "tistory"> = {};
      for (const account of accountRows) {
        const platformCode = platformById.get(account.platform_id);
        if (platformCode) accountLookup[account.id] = platformCode;
      }
      setAccountPlatformById(accountLookup);
      setPosts(postRows); setImages(imageRows);
      const nextPostId = supportPostId && postRows.some((post) => post.id === supportPostId) ? supportPostId : (postRows[0]?.id ?? "");
      setSupportPostId(nextPostId);

      // 조회 함수 안에서 상태 의존적인 resolvePostPlatform 콜백을 호출하지 않습니다.
      // resolvePostPlatform의 참조가 바뀌어 useEffect가 반복 실행되는 로딩 루프를 방지합니다.
      if (nextPostId) {
        const targets = await api<BlogPostTarget[]>(`/api/admin/blog/posts/${nextPostId}/targets`);
        const platformCodes = Array.from(new Set(
          targets.map((target) => accountLookup[target.account_id]).filter((code): code is "naver" | "tistory" => Boolean(code)),
        ));
        if (platformCodes.length === 1) {
          const code = platformCodes[0];
          setSupportPlatformCode(code);
          setSupportPlatformByPostId((current) => ({ ...current, [nextPostId]: code }));
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "게시 지원 자료를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [supportPostId]);

  const refreshImageUrls = useCallback(async () => {
    try {
      const freshRows = await api<BlogImageRow[]>("/api/admin/blog/images?limit=200");
      setImages(freshRows);
      setPreviewImage((current) => current
        ? freshRows.find((row) => row.asset.id === current.asset.id) ?? null
        : null);
      setError("");
      setNotice("이미지 주소를 갱신했습니다. 다시 확인해 주세요.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지 주소를 갱신하지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    if (tab === "dashboard") void loadDashboard();
    else if (tab === "settings") void loadSettings();
    else if (tab === "images") void loadImages();
    else if (tab === "support") void loadSupport();
    else if (tab === "posts") void loadPosts();
  }, [tab, loadDashboard, loadSettings, loadImages, loadSupport, loadPosts]);

  const resetForm = () => { setEditingId(null); setForm({ ...EMPTY_FORM, platform_id: platforms[0]?.id ?? "" }); };
  const resetPostForm = () => { setEditingPostId(null); setPostForm(EMPTY_POST_FORM); };
  const savePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const body = { title: postForm.title.trim(), excerpt: postForm.excerpt.trim() || null, body_markdown: postForm.body_markdown, body_html: postForm.body_html, edit_status: postForm.edit_status };
      if (editingPostId) await api<BlogPost>(`/api/admin/blog/posts/${editingPostId}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api<BlogPost>("/api/admin/blog/posts", { method: "POST", body: JSON.stringify(body) });
      setNotice(editingPostId ? "원고를 수정했습니다." : "원고를 등록했습니다."); resetPostForm(); await loadPosts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "원고 저장에 실패했습니다."); }
    finally { setSaving(false); }
  };
  const editPost = (post: BlogPost) => {
    setEditingPostId(post.id); setPostForm({ title: post.title, excerpt: post.excerpt ?? "", body_markdown: post.body_markdown, body_html: post.body_html, edit_status: post.edit_status }); setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const removePost = async (post: BlogPost) => {
    if (!window.confirm(`'${post.title}' 원고를 삭제하시겠습니까? 게시 대상과 예약 일정도 함께 삭제될 수 있습니다.`)) return;
    setSaving(true); setError(""); setNotice("");
    try { await api<{ deleted: boolean }>(`/api/admin/blog/posts/${post.id}`, { method: "DELETE" }); setNotice("원고를 삭제했습니다."); if (editingPostId === post.id) resetPostForm(); await loadPosts(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "원고 삭제에 실패했습니다."); }
    finally { setSaving(false); }
  };
  const uploadImage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!imageFile) { setError("업로드할 이미지 파일을 선택하세요."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const params = new URLSearchParams({ fileName: imageFile.name });
      if (imageAltText.trim()) params.set("altText", imageAltText.trim());
      const response = await fetch(`/api/admin/blog/images?${params.toString()}`, {
        method: "POST", body: imageFile, cache: "no-store", headers: { "Content-Type": imageFile.type },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "이미지 업로드에 실패했습니다."));
      setImageFile(null); setImageAltText("");
      const fileInput = document.getElementById("blog-image-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      setNotice("이미지를 업로드했습니다."); await loadImages();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "이미지 업로드에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const importZip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!zipFile) { setError("가져올 ZIP 파일을 선택하세요."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/blog/import-zip", { method: "POST", body: zipFile, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/zip", "X-Blog-Original-File-Name": encodeURIComponent(zipFile.name) } });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "ZIP 원고 가져오기에 실패했습니다."));
      const result = (payload as { data?: {
        idempotent?: boolean;
        post?: { id?: string; title?: string };
        images?: unknown[];
        import_record?: {
          platform_code?: "naver" | "tistory" | null;
          category_name?: string | null;
          original_file_name?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
        };
      } }).data;
      setLastImportedInfo({
        title: result?.post?.title ?? zipFile.name,
        platformCode: result?.import_record?.platform_code ?? null,
        categoryName: result?.import_record?.category_name ?? null,
        originalFileName: result?.import_record?.original_file_name ?? zipFile.name,
        importedAt: result?.import_record?.completed_at ?? result?.import_record?.created_at ?? new Date().toISOString(),
      });
      if (result?.import_record?.platform_code) {
        setSupportPlatformCode(result.import_record.platform_code);
        if (result?.post?.id) {
          setSupportPlatformByPostId((current) => ({ ...current, [result.post!.id!]: result.import_record!.platform_code! }));
        }
      }
      setZipFile(null);
      const input = document.getElementById("blog-zip-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setNotice(result?.idempotent ? "이미 등록된 원고를 불러왔습니다. 기존 원고를 바로 게시할 수 있습니다." : `원고를 가져왔습니다. 이미지 ${result?.images?.length ?? 0}개가 함께 저장되었습니다. 바로 게시할 수 있습니다.`);
      setTab("support");
      await loadSupport();
      if (result?.post?.id) setSupportPostId(result.post.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ZIP 원고 가져오기에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const removeImage = async (row: BlogImageRow) => {
    if (!window.confirm(`'${row.asset.file_name}' 이미지를 삭제하시겠습니까? 원고 등에서 사용 중인 이미지는 삭제되지 않습니다.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api<{ deleted: boolean }>(`/api/admin/blog/images?id=${encodeURIComponent(row.asset.id)}`, { method: "DELETE" });
      setNotice("이미지 삭제 및 저장소 정리 요청을 처리했습니다."); await loadImages();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "이미지 삭제에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const retryImageCleanup = async (job: ImageCleanup) => {
    if (!window.confirm("이 이미지 정리 작업을 다시 실행하시겠습니까?")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api<{ retried: boolean }>("/api/admin/blog/images/cleanup", { method: "POST", body: JSON.stringify({ id: job.id }) });
      setNotice("이미지 정리 작업을 재시도했습니다."); await loadImages();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "정리 작업 재시도에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const body = { platform_id: form.platform_id, account_name: form.account_name.trim(), blog_url: form.blog_url.trim(), notes: form.notes.trim() || null, active: form.active };
      if (editingId) await api<BlogAccount>("/api/admin/blog/accounts", { method: "PATCH", body: JSON.stringify({ id: editingId, account_name: body.account_name, blog_url: body.blog_url, notes: body.notes, active: body.active }) });
      else await api<BlogAccount>("/api/admin/blog/accounts", { method: "POST", body: JSON.stringify(body) });
      setNotice(editingId ? "계정 정보를 수정했습니다." : "계정을 등록했습니다."); resetForm(); await loadSettings();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "계정 저장에 실패했습니다."); }
    finally { setSaving(false); }
  };
  const editAccount = (account: BlogAccount) => {
    setEditingId(account.id);
    setForm({ platform_id: account.platform_id, account_name: account.account_name, blog_url: account.blog_url, notes: account.notes ?? "", active: account.active });
    setNotice(""); setError("");
  };
  const removeAccount = async (account: BlogAccount) => {
    if (!window.confirm(`'${account.account_name}' 계정을 삭제하시겠습니까?\n다른 데이터에서 사용 중이면 삭제되지 않을 수 있습니다.`)) return;
    setSaving(true); setError(""); setNotice("");
    try { await api<{ deleted: boolean }>(`/api/admin/blog/accounts?id=${encodeURIComponent(account.id)}`, { method: "DELETE" }); setNotice("계정을 삭제했습니다."); if (editingId === account.id) resetForm(); await loadSettings(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "계정 삭제에 실패했습니다."); }
    finally { setSaving(false); }
  };
  const togglePlatform = async (platform: BlogPlatform) => {
    setSaving(true); setError(""); setNotice("");
    try { await api<BlogPlatform>("/api/admin/blog/platforms", { method: "PATCH", body: JSON.stringify({ id: platform.id, enabled: !platform.enabled }) }); setNotice(`${platform.name}을(를) ${platform.enabled ? "비활성화" : "활성화"}했습니다.`); await loadSettings(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "플랫폼 상태 변경에 실패했습니다."); }
    finally { setSaving(false); }
  };

  const copyRenderedSupport = async () => {
    const frameDocument = supportPreviewRef.current?.contentDocument;
    const body = frameDocument?.body;
    if (!frameDocument || !body || !selectedSupportPost) {
      setError("원고 미리보기를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
      return;
    }

    // 미리보기와 동일한 DOM에서 계산된 스타일을 인라인으로 복사해
    // 티스토리 편집기에서도 오른쪽 미리보기의 모양을 재현합니다.
    // 제목 제거 또는 이미지 안내 박스 치환을 먼저 하면 요소 인덱스가 어긋나
    // 표/문단/이미지에 다른 요소의 스타일이 적용되는 문제가 발생합니다.
    const clone = body.cloneNode(true) as HTMLElement;
    const sourceElements = [body, ...Array.from(body.querySelectorAll<HTMLElement>("*"))];
    const clonedElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
    const styleProperties = [
      "color", "background-color", "font-family", "font-size", "font-weight", "font-style",
      "text-decoration", "text-align", "line-height", "vertical-align",
      "margin-top", "margin-right", "margin-bottom", "margin-left",
      "padding-top", "padding-right", "padding-bottom", "padding-left",
      "border-top", "border-right", "border-bottom", "border-left",
      "border-radius", "display", "list-style-type", "width", "max-width", "height",
      "border-collapse", "table-layout",
    ];
    sourceElements.forEach((source, index) => {
      const target = clonedElements[index];
      if (!target) return;
      const computed = frameDocument.defaultView?.getComputedStyle(source);
      if (!computed) return;
      for (const property of styleProperties) {
        const value = computed.getPropertyValue(property);
        if (!value || value === "none" || value === "normal" || value === "rgba(0, 0, 0, 0)") continue;
        target.style.setProperty(property, value);
      }
    });

    // 제목은 미리보기에는 유지하되 클립보드 본문에서는 제외합니다.
    const title = selectedSupportPost.title.trim();
    const previewTitle = Array.from(clone.querySelectorAll("h1")).find(
      (heading) => (heading.textContent ?? "").replace(/\\s+/g, " ").trim() === title,
    );
    previewTitle?.remove();

    // 네이버는 이미지를 별도 복사하므로 본문 이미지 위치에 번호 안내 박스를 둡니다.
    // 티스토리는 HTML 본문에 실제 img 요소를 유지해 이미지까지 한 번에 복사합니다.
    if (supportPlatformCode === "naver") {
      const previewImages = Array.from(clone.querySelectorAll("img"));
      previewImages.forEach((image, index) => {
        const imageSrc = image.getAttribute("src");
        const matching = supportImages.find((item) => item.signedUrl === imageSrc);
        const marker = frameDocument.createElement("div");
        marker.setAttribute("data-blog-image-placeholder", String(index + 1));
        marker.setAttribute("style", "display:block;box-sizing:border-box;width:100%;max-width:680px;margin:18px 0;padding:22px 16px;border:2px dashed #60a5fa;border-radius:10px;background:#eff6ff;color:#1d4ed8;text-align:center;font-family:Arial,sans-serif;line-height:1.5;clear:both;");
        const number = frameDocument.createElement("strong");
        number.textContent = `이미지 ${index + 1}`;
        number.setAttribute("style", "display:block;font-size:18px;font-weight:700;color:#1d4ed8;");
        const filename = frameDocument.createElement("span");
        filename.textContent = matching?.asset.file_name ?? `본문 이미지 ${index + 1}`;
        filename.setAttribute("style", "display:block;margin-top:4px;font-size:13px;color:#475569;");
        const instruction = frameDocument.createElement("span");
        instruction.textContent = "이 위치에 오른쪽 이미지 복사 버튼으로 삽입하세요.";
        instruction.setAttribute("style", "display:block;margin-top:6px;font-size:12px;color:#475569;");
        marker.append(number, filename, instruction);
        image.replaceWith(marker);
      });
    }
    if (supportPlatformCode === "naver") {
      // 네이버 전용 인용문 처리: 스마트에디터에서 배경/테두리 보존을 위해 표로 변환합니다.
      const quoteCandidates = Array.from(clone.querySelectorAll<HTMLElement>("blockquote, [style*='border-left']"));
      quoteCandidates.forEach((quote) => {
        if (quote.closest("table") || quote.hasAttribute("data-blog-image-placeholder") || !quote.isConnected) return;
        if (!(quote.textContent ?? "").trim()) return;
        const quoteTable = frameDocument.createElement("table");
        quoteTable.setAttribute("role", "presentation");
        quoteTable.setAttribute("cellpadding", "0");
        quoteTable.setAttribute("cellspacing", "0");
        quoteTable.setAttribute("border", "0");
        quoteTable.setAttribute("style", "width:100%;border-collapse:collapse;margin:16px 0;background-color:#f1f5f9;table-layout:fixed;");
        const tbody = frameDocument.createElement("tbody");
        const tr = frameDocument.createElement("tr");
        const td = frameDocument.createElement("td");
        td.setAttribute("style", "padding:14px 18px;border-left:5px solid #64748b;background-color:#f1f5f9;color:#1e293b;font-family:inherit;font-size:inherit;line-height:1.7;text-align:left;vertical-align:middle;");
        while (quote.firstChild) td.appendChild(quote.firstChild);
        tr.appendChild(td);
        tbody.appendChild(tr);
        quoteTable.appendChild(tbody);
        quote.replaceWith(quoteTable);
      });
    } else {
      // 티스토리는 h2/h3에 적용된 border-bottom·색상 일부를 제거할 수 있습니다.
      // 미리보기의 계산 스타일을 일반 블록에 옮겨 제목 계층의 시각적 결과를 보존합니다.
      Array.from(clone.querySelectorAll<HTMLElement>("h2, h3")).forEach((heading) => {
        if (!heading.isConnected) return;
        const replacement = frameDocument.createElement("div");
        replacement.setAttribute("data-blog-heading-level", heading.tagName.toLowerCase());
        replacement.setAttribute("style", `${heading.getAttribute("style") ?? ""};display:block;width:100%;box-sizing:border-box;`);
        while (heading.firstChild) replacement.appendChild(heading.firstChild);
        heading.replaceWith(replacement);
      });

      // 티스토리는 1셀 표를 자체 인용문(blockquote)으로 재변환할 수 있습니다.
      // 따라서 의미상 인용 요소와 표를 모두 피하고, 일반 div에 미리보기의
      // 시각적 스타일만 직접 지정해 플랫폼 quote 장식의 재생성을 차단합니다.
      Array.from(clone.querySelectorAll<HTMLElement>("blockquote")).forEach((quote) => {
        if (!quote.isConnected || !(quote.textContent ?? "").trim()) return;
        const replacement = frameDocument.createElement("div");
        replacement.setAttribute("data-blog-quote-shell", "true");
        replacement.setAttribute("style", `${quote.getAttribute("style") ?? ""};display:block;width:100%;max-width:100%;box-sizing:border-box;quotes:none;overflow-wrap:anywhere;word-break:normal;`);
        while (quote.firstChild) replacement.appendChild(quote.firstChild);
        quote.replaceWith(replacement);
      });
    }

    // 티스토리는 비공개 Storage의 서명 URL을 외부 이미지 주소로 가져오는 과정에서
    // 로딩/검토 대기 화면이 남을 수 있으므로, 티스토리 복사본에는 이미지 바이트를
    // data URL로 내장해 외부 URL 만료나 서버 측 URL 재요청에 의존하지 않도록 합니다.
    if (supportPlatformCode === "tistory") {
      const originalImages = Array.from(body.querySelectorAll<HTMLImageElement>("img"));
      const copiedImages = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
      for (let index = 0; index < copiedImages.length; index += 1) {
        const original = originalImages[index];
        const target = copiedImages[index];
        if (!original || !target) continue;
        const source = target.currentSrc || target.src || original.currentSrc || original.src;
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error("티스토리용 이미지 데이터를 불러오지 못했습니다. 이미지 새로고침 후 다시 복사하세요.");
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지 데이터를 변환하지 못했습니다."));
          reader.onerror = () => reject(new Error("이미지 데이터를 변환하지 못했습니다."));
          reader.readAsDataURL(blob);
        });
        target.src = dataUrl;
        target.removeAttribute("srcset");
        target.removeAttribute("loading");
        target.style.maxWidth = "100%";
        target.style.height = "auto";
      }
    }

    const html = clone.innerHTML;
    const plain = clone.innerText || clone.textContent || "";
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        })]);
      } else {
        const selection = frameDocument.getSelection();
        if (!selection) throw new Error("이 브라우저에서는 서식 복사를 지원하지 않습니다.");
        const temporary = frameDocument.createElement("div");
        temporary.innerHTML = html;
        body.appendChild(temporary);
        const range = frameDocument.createRange();
        range.selectNodeContents(temporary);
        selection.removeAllRanges();
        selection.addRange(range);
        const copied = frameDocument.execCommand("copy");
        selection.removeAllRanges();
        temporary.remove();
        if (!copied) throw new Error("화면 복사에 실패했습니다. 기본 HTML 복사를 이용해 주세요.");
      }
      setError("");
      setNotice("본문만 복사했습니다. 제목은 원고 선택 옆의 제목 복사 버튼으로 따로 복사하세요.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "화면 복사에 실패했습니다.");
    }
  };

  const copySupportTitle = async () => {
    if (!selectedSupportPost) { setError("제목을 복사할 원고를 선택하세요."); return; }
    try {
      await navigator.clipboard.writeText(selectedSupportPost.title);
      setError("");
      setNotice("원고 제목을 복사했습니다. 네이버·티스토리 제목 입력란에 붙여 넣으세요.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "제목 복사에 실패했습니다.");
    }
  };

  const copySupportHtml = async () => {
    const post = posts.find((item) => item.id === supportPostId);
    if (!post) { setError("게시할 원고를 선택하세요."); return; }
    const html = createBlogCopyHtml(post, supportImages);
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([htmlToPlainText(html)], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setError(""); setNotice("기본 HTML 본문을 복사했습니다. 네이버·티스토리 본문에 붙여 넣으세요.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "HTML 본문 복사에 실패했습니다."); }
  };

  const copySupportImage = async (row: BlogImageRow) => {
    try {
      const response = await fetch(row.signedUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("이미지 파일을 불러오지 못했습니다.");
      const sourceBlob = await response.blob();
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("이 브라우저는 이미지 클립보드 복사를 지원하지 않습니다.");
      }

      // 클립보드는 PNG를 가장 폭넓게 지원하므로 원본 포맷을 PNG로 정규화합니다.
      const bitmap = await createImageBitmap(sourceBlob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이미지 변환을 시작하지 못했습니다.");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 이미지 변환에 실패했습니다.")), "image/png");
      });
      // 네이버 스마트에디터가 HTML(data URL)과 텍스트가 함께 든
      // 복합 클립보드를 거부할 수 있어 PNG 이미지 데이터만 기록합니다.
      if (typeof ClipboardItem.supports === "function" && !ClipboardItem.supports("image/png")) {
        throw new Error("현재 브라우저가 PNG 이미지 클립보드 복사를 지원하지 않습니다. Chrome 최신 버전에서 다시 시도하세요.");
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      setError("");
      setNotice(`${row.asset.file_name} 이미지 데이터를 PNG 형식으로 복사했습니다. 네이버 본문에서 Ctrl+V로 붙여 넣으세요. 이미지 다음 줄 이동은 네이버 편집기가 처리합니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지 복사에 실패했습니다.");
    }
  };

  const selectedSupportPost = posts.find((post) => post.id === supportPostId) ?? null;
  const supportImageIds = selectedSupportPost
    ? [...selectedSupportPost.body_html.matchAll(/\{\{image:([0-9a-f-]{36})\}\}/gi)].map((match) => match[1])
    : [];
  if (selectedSupportPost?.cover_asset_id && !supportImageIds.includes(selectedSupportPost.cover_asset_id)) {
    supportImageIds.unshift(selectedSupportPost.cover_asset_id);
  }
  const supportImageOrder = new Map(supportImageIds.map((id, index) => [id, index]));
  const supportImages = images
    .filter((row) => supportImageOrder.has(row.asset.id))
    .sort((a, b) => (supportImageOrder.get(a.asset.id) ?? 0) - (supportImageOrder.get(b.asset.id) ?? 0));

  return (
    <div className="blog-workspace">
      <header className="admin-header">
        <div><h1>블로그 관리</h1><p className="admin-hint">원고, 게시 일정, 이미지와 게시 이력을 한 곳에서 관리합니다.</p></div>
        <button className="btn ghost" type="button" onClick={() => tab === "dashboard" ? void loadDashboard() : tab === "settings" ? void loadSettings() : tab === "images" ? void loadImages() : tab === "support" ? void loadSupport() : void loadPosts()} disabled={loading || saving}>{loading ? "불러오는 중…" : "새로고침"}</button>
      </header>
      <nav className="admin-panel blog-nav" aria-label="블로그 관리 메뉴">
        {MENU.map(([label, target]) => {
          if (target === "dashboard" || target === "posts" || target === "images" || target === "support" || target === "settings") return <button type="button" key={target} className={`blog-nav-item${tab === target ? " active" : ""}`} aria-current={tab === target ? "page" : undefined} onClick={() => { setTab(target); setError(""); setNotice(""); }}>{label}</button>;
          return <span className="blog-nav-item disabled" key={target} aria-disabled="true" title="다음 UI 단계에서 연결됩니다.">{label}<small>준비 중</small></span>;
        })}
      </nav>
      {error ? <p className="msg err" role="alert">{error}</p> : null}
      {notice ? <p className="msg ok" role="status">{notice}</p> : null}
      {loading ? <section className="admin-panel"><p className="admin-hint">정보를 불러오는 중…</p></section> : null}

      {tab === "dashboard" && !loading && dashboard ? <>
        <section className="admin-stat-row blog-stat-row" aria-label="블로그 현황">
          {[{ label: "전체 원고", value: dashboard.posts.total }, { label: "작성 중", value: dashboard.posts.draft }, { label: "게시 준비", value: dashboard.posts.ready }, { label: "보관", value: dashboard.posts.archived }, { label: "활성 계정", value: dashboard.activeAccounts }, { label: "게시 예정", value: dashboard.plannedSchedules }].map(({ label, value }) => <article className="admin-stat-card" key={label}><div className="admin-stat-label">{label}</div><div className="admin-stat-value">{value}</div></article>)}
        </section>
        <div className="blog-dashboard-grid">
          <section className="admin-panel"><div className="admin-section-head"><h2>다가오는 게시 일정</h2><span className="admin-hint">최대 10건</span></div>
            {dashboard.upcomingSchedules.length === 0 ? <p className="admin-hint">예정된 일정이 없습니다.</p> : <div className="admin-table-wrap"><table className="admin-table compact"><thead><tr><th>게시 예정</th><th>상태</th><th>메모</th></tr></thead><tbody>{dashboard.upcomingSchedules.map((schedule) => <tr key={schedule.id}><td>{dateLabel(schedule.planned_at)}</td><td>{SCHEDULE_STATUS[schedule.status]}</td><td>{schedule.note || "—"}</td></tr>)}</tbody></table></div>}
          </section>
          <section className="admin-panel"><div className="admin-section-head"><h2>최근 게시 이력</h2><span className="admin-hint">최대 10건</span></div>
            {dashboard.recentHistory.length === 0 ? <p className="admin-hint">게시 이력이 없습니다.</p> : <div className="admin-table-wrap"><table className="admin-table compact"><thead><tr><th>플랫폼</th><th>제목</th><th>결과</th><th>게시 일시</th></tr></thead><tbody>{dashboard.recentHistory.map((history) => <tr key={history.id}><td>{history.platform_code_snapshot === "naver" ? "네이버" : "티스토리"}</td><td>{history.post_title_snapshot}</td><td className={history.result === "success" ? "blog-result-success" : "blog-result-failed"}>{history.result === "success" ? "성공" : "실패"}</td><td>{dateLabel(history.published_at ?? history.created_at)}</td></tr>)}</tbody></table></div>}
          </section>
        </div>
        <section className="admin-panel blog-next-step"><div className="admin-section-head"><h2>관리 기능</h2><Link className="btn ghost" href="/admin">관리자 홈</Link></div><p className="admin-hint">플랫폼·계정 설정은 상단 메뉴에서 관리할 수 있습니다. 원고·일정·이미지·게시 이력은 순차적으로 연결합니다.</p><div className="blog-capability-list">{MENU.slice(1, 5).map(([label]) => <span key={label}>{label} · 준비 중</span>)}</div></section>
      </> : null}

      {tab === "posts" && !loading ? <>
        <section className="admin-panel">
          <div className="admin-section-head"><h2>{editingPostId ? "원고 수정" : "새 원고 작성"}</h2>{editingPostId ? <button className="btn ghost" type="button" onClick={resetPostForm}>수정 취소</button> : null}</div>
          <p className="admin-hint">Markdown 원고와 게시용 HTML을 함께 저장합니다. HTML에서는 <code>{"{{image:이미지UUID}}"}</code> 토큰을 사용할 수 있으며 게시 지원 화면에서 실제 이미지로 치환합니다.</p>
          <form className="admin-form blog-post-form" onSubmit={(event) => void savePost(event)}>
            <label>제목<input value={postForm.title} onChange={(event) => setPostForm({ ...postForm, title: event.target.value })} maxLength={200} required placeholder="원고 제목" /></label>
            <label>요약<textarea value={postForm.excerpt} onChange={(event) => setPostForm({ ...postForm, excerpt: event.target.value })} maxLength={1000} rows={2} placeholder="검색 결과나 목록에 표시할 요약" /></label>
            <label>본문 (Markdown)<textarea className="blog-post-body" value={postForm.body_markdown} onChange={(event) => setPostForm({ ...postForm, body_markdown: event.target.value })} maxLength={200000} rows={16} placeholder="# 소제목

본문을 입력하세요." /></label>
            <label>게시용 본문 (HTML)<textarea className="blog-post-html" value={postForm.body_html} onChange={(event) => setPostForm({ ...postForm, body_html: event.target.value })} maxLength={200000} rows={14} placeholder="<p>본문을 입력하세요.</p>\n<table>...</table>" /></label>
            <label>원고 상태<select value={postForm.edit_status} onChange={(event) => setPostForm({ ...postForm, edit_status: event.target.value as BlogPostEditStatus })}><option value="draft">작성 중</option><option value="ready">게시 준비</option><option value="archived">보관</option></select></label>
            <div className="blog-form-actions"><button className="btn" type="submit" disabled={saving}>{saving ? "저장 중…" : editingPostId ? "변경사항 저장" : "원고 등록"}</button>{!editingPostId ? <button className="btn ghost" type="button" onClick={resetPostForm}>초기화</button> : null}</div>
          </form>
        </section>
        <section className="admin-panel">
          <div className="admin-section-head"><h2>등록된 원고</h2><span className="admin-hint">총 {posts.length}건</span></div>
          <div className="blog-post-filters">
            <input aria-label="원고 제목 검색" value={postSearch} onChange={(event) => setPostSearch(event.target.value)} placeholder="제목 검색" />
            <select aria-label="원고 상태 필터" value={postStatus} onChange={(event) => setPostStatus(event.target.value as "all" | BlogPostEditStatus)}><option value="all">전체 상태</option><option value="draft">작성 중</option><option value="ready">게시 준비</option><option value="archived">보관</option></select>
            <button className="btn ghost" type="button" disabled={loading} onClick={() => void loadPosts()}>검색</button>
          </div>
          {posts.length === 0 ? <p className="admin-hint">조건에 맞는 원고가 없습니다.</p> : <div className="admin-table-wrap"><table className="admin-table compact"><thead><tr><th>제목</th><th>상태</th><th>요약</th><th>최종 수정</th><th>관리</th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td>{post.title}</td><td>{POST_STATUS[post.edit_status]}</td><td>{post.excerpt || "—"}</td><td>{dateLabel(post.updated_at)}</td><td><div className="blog-row-actions"><button className="btn ghost" type="button" disabled={saving} onClick={() => editPost(post)}>수정</button><button className="btn ghost blog-delete-btn" type="button" disabled={saving} onClick={() => void removePost(post)}>삭제</button></div></td></tr>)}</tbody></table></div>}
        </section>
      </> : null}

      {tab === "images" && !loading ? <>
        <section className="admin-panel">
          <div className="admin-section-head"><h2>이미지 업로드</h2><span className="admin-hint">최대 10MiB</span></div>
          <p className="admin-hint">JPEG, PNG, WebP, GIF 이미지를 등록할 수 있습니다. 파일 내용과 이미지 형식은 서버에서 검증합니다.</p>
          <form className="admin-form blog-image-upload-form" onSubmit={(event) => void uploadImage(event)}>
            <label>이미지 파일<input id="blog-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required disabled={saving} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></label>
            <label>대체 텍스트(선택)<input value={imageAltText} onChange={(event) => setImageAltText(event.target.value)} maxLength={1000} placeholder="이미지 내용을 설명하는 문구" disabled={saving} /></label>
            <div className="blog-form-actions"><button className="btn" type="submit" disabled={saving || !imageFile}>{saving ? "처리 중…" : "이미지 업로드"}</button></div>
          </form>
        </section>
        <section className="admin-panel">
          <div className="admin-section-head"><h2>등록된 이미지</h2><span className="admin-hint">총 {images.length}개</span></div>
          {images.length === 0 ? <p className="admin-hint">등록된 이미지가 없습니다.</p> : <div className="blog-image-grid">{images.map(({ asset, signedUrl }) => <article className="blog-image-card" key={asset.id}>
            <a className="blog-image-preview" href={signedUrl} target="_blank" rel="noreferrer" aria-label={`${asset.file_name} 원본 이미지 열기`}><img src={signedUrl} alt={asset.alt_text || asset.file_name} loading="lazy" /></a>
            <div className="blog-image-info"><strong title={asset.file_name}>{asset.file_name}</strong><span>{asset.width ?? "—"} × {asset.height ?? "—"} px · {(asset.size_bytes / 1024 / 1024).toFixed(2)} MiB</span><span>{asset.mime_type}</span><span>{asset.alt_text || "대체 텍스트 없음"}</span><span>{dateLabel(asset.created_at)}</span></div>
            <div className="blog-form-actions"><button className="btn ghost blog-delete-btn" type="button" disabled={saving} onClick={() => void removeImage({ asset, signedUrl })}>삭제</button></div>
          </article>)}</div>}
        </section>
        <section className="admin-panel">
          <div className="admin-section-head"><h2>이미지 저장소 정리 작업</h2><span className="admin-hint">최근 {cleanupJobs.length}건</span></div>
          {cleanupJobs.length === 0 ? <p className="admin-hint">정리 대기 또는 실패 작업이 없습니다.</p> : <div className="admin-table-wrap"><table className="admin-table compact"><thead><tr><th>작업 유형</th><th>상태</th><th>시도 횟수</th><th>최근 오류</th><th>등록 일시</th><th>관리</th></tr></thead><tbody>{cleanupJobs.map((job) => <tr key={job.id}><td>{job.action === "delete_asset" ? "이미지 삭제" : job.action === "delete_orphan" ? "고아 파일 정리" : job.action}</td><td>{job.status}</td><td>{job.attempts}</td><td>{job.last_error_code || "—"}</td><td>{dateLabel(job.created_at)}</td><td><button className="btn ghost" type="button" disabled={saving || job.status === "completed"} onClick={() => void retryImageCleanup(job)}>재시도</button></td></tr>)}</tbody></table></div>}
        </section>
        <section className="admin-panel">
          <div className="admin-section-head"><h2>가져오기 보상 정리</h2><div className="blog-form-actions"><span className="admin-hint">대기·실패 {importCleanupJobs.length}건</span><button className="btn ghost" type="button" disabled={saving || importCleanupJobs.length === 0} onClick={() => void processImportCleanup()}>정리 재처리</button></div></div>
          {importCleanupJobs.length === 0 ? <p className="admin-hint">대기 중인 가져오기 정리 작업이 없습니다.</p> : <div className="admin-table-wrap"><table className="admin-table compact"><thead><tr><th>대상</th><th>상태</th><th>시도</th><th>최근 오류</th><th>다음 재시도</th></tr></thead><tbody>{importCleanupJobs.map((job) => <tr key={job.id}><td>{job.target_type} · {job.target_id}</td><td>{job.status === "failed" && job.attempts >= job.max_attempts ? "최종 실패(관리자 조치 필요)" : job.status}</td><td>{job.attempts}/{job.max_attempts}</td><td>{job.error_code || "—"}</td><td>{dateLabel(job.next_attempt_at)}</td></tr>)}</tbody></table></div>}
        </section>
      </> : null}

      {tab === "support" && !loading ? <>
        <section className="admin-panel blog-support-panel">
          <div className="admin-section-head"><h2>블로그 게시 지원</h2><span className="admin-hint">네이버·티스토리 수동 게시용</span></div>
          <p className="admin-hint">ChatGPT에서 승인한 원고 ZIP을 가져오면 바로 아래에 표시됩니다. 본문과 이미지를 복사해 네이버·티스토리에 붙여 넣고 직접 게시하면 됩니다.</p>
          <div className="blog-import-guide">
            <strong>원고 가져오기</strong>
            <p>연동 주소: <code>/api/integrations/blog/import</code></p>
            <p>HTML·이미지 ZIP 연동: <code>/api/integrations/blog/import-zip</code> <span className="admin-hint">(blog_post.html + metadata.json + images/)</span></p>
            <p>승인된 원고를 가져오면 별도의 원고 상태 변경 없이 즉시 게시 지원 화면에서 사용할 수 있습니다. 이미지는 비공개 저장소에 등록되며 본문과 연결됩니다.</p>
            <span className="admin-hint">네이버·티스토리 자동 로그인/자동 게시, 비밀번호·쿠키 저장은 지원하지 않습니다.</span>
          </div>
          <form className="blog-zip-import-form" onSubmit={(event) => void importZip(event)}>
            <label>HTML·이미지 ZIP 파일<input id="blog-zip-file" type="file" accept=".zip,application/zip" disabled={saving} onChange={(event) => setZipFile(event.target.files?.[0] ?? null)} /></label>
            <span className="admin-hint">ZIP 안에 HTML 1개, 선택적으로 metadata.json과 images/ 폴더를 넣으세요. 최대 50MiB입니다.</span>
            <button className="btn" type="submit" disabled={saving || !zipFile}>{saving ? "가져오는 중…" : "ZIP 원고 가져오기"}</button>
          </form>
          {lastImportedInfo ? <section className="blog-imported-metadata" aria-label="가져온 원고 정보">
            <div className="blog-imported-metadata-head">
              <strong>가져온 원고 정보</strong>
              <span className="admin-hint">최종 발행 시 참고하세요</span>
            </div>
            <h3>{lastImportedInfo.title}</h3>
            <div className="blog-imported-badges">
              {lastImportedInfo.platformCode === "naver" ? <span className="blog-platform-chip naver">네이버용</span> : null}
              {lastImportedInfo.platformCode === "tistory" ? <span className="blog-platform-chip tistory">티스토리용</span> : null}
              {!lastImportedInfo.platformCode ? <span className="blog-platform-chip unknown">게시 플랫폼 미지정</span> : null}
            </div>
            <dl>
              <div><dt>카테고리</dt><dd>{lastImportedInfo.categoryName || "미지정 — 발행 시 블로그에서 선택"}</dd></div>
              <div><dt>ZIP 파일</dt><dd>{lastImportedInfo.originalFileName || "—"}</dd></div>
              <div><dt>가져온 일시</dt><dd>{dateLabel(lastImportedInfo.importedAt)}</dd></div>
            </dl>
          </section> : null}
          <div className="blog-support-select-row">
            <label className="blog-support-select">게시할 원고<select value={supportPostId} onChange={(event) => {
              const nextPostId = event.target.value;
              setSupportPostId(nextPostId);
              const importedPlatform = supportPlatformByPostId[nextPostId];
              if (importedPlatform) setSupportPlatformCode(importedPlatform);
              else if (nextPostId) void resolvePostPlatform(nextPostId);
            }} disabled={!posts.length}><option value="">원고 선택</option>{posts.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}</select></label>
            <button className="btn ghost blog-copy-title-btn" type="button" onClick={() => void copySupportTitle()} disabled={!selectedSupportPost}>제목 복사</button>
          </div>
          <label className="blog-support-platform-select">게시 플랫폼
            <select value={supportPlatformCode} onChange={(event) => {
              const nextPlatform = event.target.value === "tistory" ? "tistory" : "naver";
              setSupportPlatformCode(nextPlatform);
              if (supportPostId) setSupportPlatformByPostId((current) => ({ ...current, [supportPostId]: nextPlatform }));
            }}>
              <option value="naver">네이버 (이미지 개별 복사)</option>
              <option value="tistory">티스토리 (본문에 이미지 포함)</option>
            </select>
          </label>
          {selectedSupportPost ? <>
            {/* 미리보기는 원본 body_html 서식을 그대로 보여줍니다. 플랫폼별 보정은 복사본에만 적용합니다. */}
            <iframe ref={supportPreviewRef} className="blog-support-preview" title="복사할 원고 미리보기" srcDoc={createBlogPreviewHtml(selectedSupportPost, supportImages)} />
            <div className="blog-form-actions blog-support-copy-actions">
              <button className="btn" type="button" onClick={() => void copyRenderedSupport()}>{supportPlatformCode === "naver" ? "본문 복사 (이미지 위치 표시)" : "본문+이미지 전체 복사"}</button>
              <button className="btn ghost" type="button" onClick={() => void copySupportHtml()}>기본 HTML 복사</button>
              <span className="admin-hint">{supportPlatformCode === "naver" ? "본문과 이미지 위치 안내를 복사합니다. 이미지는 아래 목록에서 개별 복사하세요." : "본문과 이미지를 함께 복사합니다. 별도 이미지 복사는 필요하지 않습니다."} 제목은 위의 제목 복사 버튼으로 복사하세요.</span>
            </div>
          </> : <p className="admin-hint">게시할 원고가 없습니다. 위에서 승인된 원고 ZIP을 가져오면 이곳에 자동으로 표시됩니다.</p>}
        </section>
        {supportPlatformCode === "naver" ? <section className="admin-panel">
          <div className="admin-section-head"><h2>이미지 순서 복사</h2><span className="admin-hint">현재 원고 이미지 {supportImages.length}개</span></div>
          <p className="admin-hint">선택한 원고 본문에 포함된 이미지만 표시합니다. 이미지 버튼을 눌러 네이버·티스토리 본문에서 원하는 위치에 붙여 넣으세요.</p>
          {!selectedSupportPost ? <p className="admin-hint">먼저 게시 준비 원고를 선택하세요.</p> : supportImages.length === 0 ? <p className="admin-hint">선택한 원고에 연결된 이미지가 없습니다.</p> : <div className="blog-support-image-list">{supportImages.map((row, index) => <article className="blog-support-image" key={row.asset.id}><button className="blog-support-image-preview" type="button" onClick={() => setPreviewImage(row)} aria-label={`${row.asset.file_name} 크게 보기`} title="클릭하면 크게 볼 수 있습니다"><img src={row.signedUrl} alt={row.asset.alt_text || row.asset.file_name} loading="lazy" onError={(event) => { if (event.currentTarget.dataset.retried === "1") return; event.currentTarget.dataset.retried = "1"; void refreshImageUrls(); }} /></button><div><strong>{index + 1}. {row.asset.file_name}</strong><span>{row.asset.width ?? "—"} × {row.asset.height ?? "—"} px</span><button className="btn ghost" type="button" onClick={() => void copySupportImage(row)}>이미지 복사</button></div></article>)}</div>}
        </section> : null}
        {supportPlatformCode === "naver" && previewImage ? <div className="blog-image-lightbox" role="presentation" onClick={() => setPreviewImage(null)}>
          <div className="blog-image-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`${previewImage.asset.file_name} 이미지 크게 보기`} onClick={(event) => event.stopPropagation()}>
            <div className="blog-image-lightbox-head"><strong>{previewImage.asset.file_name}</strong><button className="btn ghost" type="button" onClick={() => setPreviewImage(null)}>닫기 ✕</button></div>
            <img src={previewImage.signedUrl} alt={previewImage.asset.alt_text || previewImage.asset.file_name} onError={(event) => { if (event.currentTarget.dataset.retried === "1") return; event.currentTarget.dataset.retried = "1"; void refreshImageUrls(); }} />
            <p>{previewImage.asset.width ?? "—"} × {previewImage.asset.height ?? "—"} px · 바깥 영역을 클릭하면 닫힙니다.</p>
          </div>
        </div> : null}
      </> : null}

      {tab === "settings" && !loading ? <>
        <section className="admin-panel"><div className="admin-section-head"><h2>플랫폼 설정</h2><span className="admin-hint">게시 플랫폼 사용 여부</span></div>
          <div className="blog-platform-list">{platforms.map((platform) => <div className="blog-platform-row" key={platform.id}><div><strong>{platform.name}</strong><span className="blog-platform-code">{platform.code}</span><span className={platform.enabled ? "blog-state-on" : "blog-state-off"}>{platform.enabled ? "사용" : "중지"}</span></div><button className="btn ghost" type="button" disabled={saving} onClick={() => void togglePlatform(platform)}>{platform.enabled ? "비활성화" : "활성화"}</button></div>)}</div>
        </section>
        <section className="admin-panel"><div className="admin-section-head"><h2>{editingId ? "계정 수정" : "블로그 계정 등록"}</h2>{editingId ? <button className="btn ghost" type="button" onClick={resetForm}>수정 취소</button> : null}</div>
          <p className="admin-hint">블로그 계정명과 주소를 등록합니다. 로그인 비밀번호나 인증정보는 입력하지 마세요.</p>
          <form className="admin-form blog-account-form" onSubmit={(event) => void saveAccount(event)}>
            <label>플랫폼<select value={form.platform_id} onChange={(event) => setForm({ ...form, platform_id: event.target.value })} required disabled={!!editingId || platforms.length === 0}><option value="">플랫폼 선택</option>{platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}{platform.enabled ? "" : " (중지)"}</option>)}</select></label>
            <label>계정명<input value={form.account_name} onChange={(event) => setForm({ ...form, account_name: event.target.value })} maxLength={120} required placeholder="예: 개인 블로그" /></label>
            <label>블로그 주소<input type="url" value={form.blog_url} onChange={(event) => setForm({ ...form, blog_url: event.target.value })} required placeholder="https://blog.example.com" /></label>
            <label>메모<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={4000} rows={3} placeholder="운영 목적이나 참고사항" /></label>
            <label className="blog-checkbox-label"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> 계정 사용</label>
            <div className="blog-form-actions"><button className="btn" type="submit" disabled={saving || !form.platform_id}>{saving ? "저장 중…" : editingId ? "변경사항 저장" : "계정 등록"}</button>{!editingId ? <button className="btn ghost" type="button" onClick={resetForm}>초기화</button> : null}</div>
          </form>
        </section>
        <section className="admin-panel"><div className="admin-section-head"><h2>등록된 블로그 계정</h2><span className="admin-hint">총 {accounts.length}개</span></div>
          {accounts.length === 0 ? <p className="admin-hint">등록된 계정이 없습니다.</p> : <div className="admin-table-wrap"><table className="admin-table compact"><thead><tr><th>플랫폼</th><th>계정명</th><th>블로그 주소</th><th>상태</th><th>메모</th><th>관리</th></tr></thead><tbody>{accounts.map((account) => { const platform = platforms.find((item) => item.id === account.platform_id); return <tr key={account.id}><td>{platform?.name ?? "알 수 없음"}</td><td>{account.account_name}</td><td><a href={account.blog_url} target="_blank" rel="noreferrer">{account.blog_url}</a></td><td>{account.active ? "사용" : "중지"}</td><td>{account.notes || "—"}</td><td><div className="blog-row-actions"><button className="btn ghost" type="button" disabled={saving} onClick={() => editAccount(account)}>수정</button><button className="btn ghost blog-delete-btn" type="button" disabled={saving} onClick={() => void removeAccount(account)}>삭제</button></div></td></tr>; })}</tbody></table></div>}
        </section>
      </> : null}
    </div>
  );
}
