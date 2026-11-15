/**
 * Server-side data access for the private blog manager.
 * Import only from server components and authenticated route handlers.
 */
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import { createHash } from "node:crypto";
import {
  BlogValidationError,
  isBlogScheduleTransitionAllowed,
  isUuid,
  validateCreateBlogAccount,
  validateCreateBlogAsset,
  validateCreateBlogCategory,
  validateCreateBlogMetric,
  validateCreateBlogPost,
  validateCreateBlogPublishHistory,
  validateCreateBlogSchedule,
  validateCreateBlogTarget,
  validateCreateBlogTopic,
  validateUpdateBlogAccount,
  validateUpdateBlogCategory,
  validateUpdateBlogPlatform,
  validateUpdateBlogPost,
  validateUpdateBlogSchedule,
  validateUpdateBlogTarget,
  validateUpdateBlogTopic,
  type BlogAccount,
  type BlogAsset,
  type BlogCategory,
  type BlogMetric,
  type BlogImportRecord,
  type BlogImportCleanup,
  type BlogPlatform,
  type BlogPost,
  type BlogPostAsset,
  type BlogPostTargetCategory,
  type BlogPostTopic,
  type BlogPostTarget,
  type BlogPublishHistory,
  type BlogPublishRecordResult,
  type BlogSchedule,
  type BlogStorageCleanup,
  type BlogTopic,
  type CreateBlogAccountInput,
  type CreateBlogAssetInput,
  type CreateBlogCategoryInput,
  type CreateBlogMetricInput,
  type CreateBlogPostInput,
  type CreateBlogScheduleInput,
  type CreateBlogTargetInput,
  type CreateBlogTopicInput,
  type UpdateBlogAccountInput,
  type UpdateBlogCategoryInput,
  type UpdateBlogPlatformInput,
  type UpdateBlogPostInput,
  type UpdateBlogScheduleInput,
  type UpdateBlogTargetInput,
  type UpdateBlogTopicInput,
} from "@/lib/blogShared";

if (typeof window !== "undefined") {
  throw new Error("@/lib/blog is server-only and must not be imported by client components.");
}

export type BlogDataErrorCode = "not_configured" | "not_found" | "conflict" | "invalid_data" | "database";

export class BlogDataError extends Error {
  constructor(
    readonly code: BlogDataErrorCode,
    message: string,
    readonly databaseCode?: string,
  ) {
    super(message);
    this.name = "BlogDataError";
  }
}

type DatabaseError = { code?: string };
type DatabaseResponse<T> = { data: T | null; error: DatabaseError | null; count?: number | null };

const TABLES = {
  platforms: "blog_platforms",
  accounts: "blog_accounts",
  topics: "blog_topics",
  imports: "blog_imports",
  categories: "blog_categories",
  assets: "blog_assets",
  posts: "blog_posts",
  targets: "blog_post_targets",
  schedules: "blog_schedules",
  history: "blog_publish_history",
  metrics: "blog_metrics",
  storageCleanup: "blog_storage_cleanup",
  importCleanup: "blog_import_cleanup",
} as const;

function requireConfigured(): void {
  if (!isSupabaseAdminConfigured()) {
    throw new BlogDataError("not_configured", "블로그 데이터 저장소가 설정되지 않았습니다.");
  }
}

function validateId(id: string, field = "id"): void {
  if (!isUuid(id)) throw new BlogValidationError("유효한 UUID가 필요합니다.", field);
}

function mapDatabaseError(error: DatabaseError): BlogDataError {
  const code = error.code ?? "";
  if (code === "PGRST116" || code === "P0002") return new BlogDataError("not_found", "요청한 블로그 데이터를 찾을 수 없습니다.", code);
  if (code === "23505" || code === "23503" || code === "55000") {
    if (code === "55000") return new BlogDataError("conflict", "가져오기 처리권을 잃었습니다.", code);
    return new BlogDataError("conflict", "중복되거나 다른 데이터에서 참조 중인 항목입니다.", code);
  }
  if (code === "23514" || code === "22P02" || code === "22001" || code === "22023") {
    return new BlogDataError("invalid_data", "저장할 값이 데이터 규칙에 맞지 않습니다.", code);
  }
  return new BlogDataError("database", "블로그 데이터 저장소 요청을 처리하지 못했습니다.", code || undefined);
}

async function request<T>(request: PromiseLike<DatabaseResponse<T>>): Promise<DatabaseResponse<T>> {
  requireConfigured();
  try {
    return await request;
  } catch {
    throw new BlogDataError("database", "블로그 데이터 저장소 요청을 처리하지 못했습니다.");
  }
}

async function unwrap<T>(
  requestPromise: PromiseLike<DatabaseResponse<T>>,
  missingMessage = "요청한 블로그 데이터를 찾을 수 없습니다.",
): Promise<T> {
  const result = await request(requestPromise);
  if (result.error) throw mapDatabaseError(result.error);
  if (result.data === null) throw new BlogDataError("not_found", missingMessage);
  return result.data;
}

async function listRows<T>(table: string, options?: {
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
}): Promise<T[]> {
  requireConfigured();
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const offset = Math.max(0, options?.offset ?? 0);
  const orderBy = options?.orderBy ?? "created_at";
  const result = await unwrap<T[]>(
    getSupabaseAdmin().from(table).select("*").order(orderBy, { ascending: options?.ascending ?? false }).range(offset, offset + limit - 1),
  );
  return result;
}

async function getRow<T>(table: string, id: string): Promise<T | null> {
  validateId(id);
  requireConfigured();
  const result = await request(getSupabaseAdmin().from(table).select("*").eq("id", id).maybeSingle());
  if (result.error) throw mapDatabaseError(result.error);
  return (result.data as T | null) ?? null;
}

async function insertRow<T>(table: string, input: Record<string, unknown>): Promise<T> {
  requireConfigured();
  return unwrap<T>(getSupabaseAdmin().from(table).insert(input).select("*").single());
}

async function updateRow<T>(table: string, id: string, input: Record<string, unknown>): Promise<T> {
  validateId(id);
  requireConfigured();
  return unwrap<T>(getSupabaseAdmin().from(table).update(input).eq("id", id).select("*").maybeSingle());
}

async function deleteRow(table: string, id: string): Promise<void> {
  validateId(id);
  requireConfigured();
  const result = await request(getSupabaseAdmin().from(table).delete().eq("id", id).select("id").maybeSingle());
  if (result.error) throw mapDatabaseError(result.error);
  if (!result.data) throw new BlogDataError("not_found", "삭제할 블로그 데이터를 찾을 수 없습니다.");
}

function record<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
}

async function countRows(table: string, column?: string, value?: string): Promise<number> {
  requireConfigured();
  let query = getSupabaseAdmin().from(table).select("id", { count: "exact", head: true });
  if (column && value !== undefined) query = query.eq(column, value);
  const result = await request(query);
  if (result.error) throw mapDatabaseError(result.error);
  return result.count ?? 0;
}

export async function getBlogDashboardSummary(): Promise<{
  posts: { total: number; draft: number; ready: number; archived: number };
  activeAccounts: number;
  plannedSchedules: number;
  upcomingSchedules: BlogSchedule[];
  recentHistory: BlogPublishHistory[];
}> {
  const [total, draft, ready, archived, activeAccounts, plannedSchedules, upcomingSchedules, recentHistory] = await Promise.all([
    countRows(TABLES.posts),
    countRows(TABLES.posts, "edit_status", "draft"),
    countRows(TABLES.posts, "edit_status", "ready"),
    countRows(TABLES.posts, "edit_status", "archived"),
    countRows(TABLES.accounts, "active", "true"),
    countRows(TABLES.schedules, "status", "planned"),
    listBlogSchedules({ status: "planned", limit: 10 }),
    listBlogPublishHistory({ limit: 10 }),
  ]);
  return {
    posts: { total, draft, ready, archived },
    activeAccounts,
    plannedSchedules,
    upcomingSchedules,
    recentHistory,
  };
}

export async function listBlogPlatforms(): Promise<BlogPlatform[]> {
  return listRows<BlogPlatform>(TABLES.platforms, { orderBy: "name", ascending: true });
}

export async function updateBlogPlatform(id: string, input: UpdateBlogPlatformInput): Promise<BlogPlatform> {
  const patch = record(validateUpdateBlogPlatform(input));
  patch.updated_at = new Date().toISOString();
  return updateRow(TABLES.platforms, id, patch);
}

export async function listBlogAccounts(platformId?: string): Promise<BlogAccount[]> {
  if (platformId) validateId(platformId, "platform_id");
  requireConfigured();
  let query = getSupabaseAdmin().from(TABLES.accounts).select("*").order("account_name", { ascending: true });
  if (platformId) query = query.eq("platform_id", platformId);
  return unwrap<BlogAccount[]>(query);
}

export async function getBlogAccount(id: string): Promise<BlogAccount | null> {
  return getRow(TABLES.accounts, id);
}

export async function createBlogAccount(input: CreateBlogAccountInput): Promise<BlogAccount> {
  return insertRow(TABLES.accounts, record(validateCreateBlogAccount(input)));
}

export async function updateBlogAccount(id: string, input: UpdateBlogAccountInput): Promise<BlogAccount> {
  const patch = record(validateUpdateBlogAccount(input));
  patch.updated_at = new Date().toISOString();
  return updateRow(TABLES.accounts, id, patch);
}

export async function deleteBlogAccount(id: string): Promise<void> {
  await deleteRow(TABLES.accounts, id);
}

export async function listBlogTopics(activeOnly = false): Promise<BlogTopic[]> {
  requireConfigured();
  let query = getSupabaseAdmin().from(TABLES.topics).select("*").order("sort_order", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  return unwrap<BlogTopic[]>(query);
}

export async function createBlogTopic(input: CreateBlogTopicInput): Promise<BlogTopic> {
  return insertRow(TABLES.topics, record(validateCreateBlogTopic(input)));
}

export async function updateBlogTopic(id: string, input: UpdateBlogTopicInput): Promise<BlogTopic> {
  const patch = record(validateUpdateBlogTopic(input));
  patch.updated_at = new Date().toISOString();
  return updateRow(TABLES.topics, id, patch);
}

export async function deleteBlogTopic(id: string): Promise<void> {
  await deleteRow(TABLES.topics, id);
}

export async function listBlogCategories(accountId: string): Promise<BlogCategory[]> {
  validateId(accountId, "account_id");
  requireConfigured();
  const query = getSupabaseAdmin().from(TABLES.categories).select("*").eq("account_id", accountId).order("sort_order", { ascending: true });
  return unwrap<BlogCategory[]>(query);
}

export async function createBlogCategory(input: CreateBlogCategoryInput): Promise<BlogCategory> {
  return insertRow(TABLES.categories, record(validateCreateBlogCategory(input)));
}

export async function updateBlogCategory(id: string, input: UpdateBlogCategoryInput): Promise<BlogCategory> {
  const patch = record(validateUpdateBlogCategory(input));
  patch.updated_at = new Date().toISOString();
  return updateRow(TABLES.categories, id, patch);
}

export async function deleteBlogCategory(id: string): Promise<void> {
  await deleteRow(TABLES.categories, id);
}

export async function listBlogPosts(options?: {
  editStatus?: BlogPost["edit_status"];
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<BlogPost[]> {
  if (options?.editStatus && !["draft", "ready", "archived"].includes(options.editStatus)) {
    throw new BlogValidationError("허용되지 않은 원고 편집 상태입니다.", "edit_status");
  }
  requireConfigured();
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
  const offset = Math.max(0, options?.offset ?? 0);
  let query = getSupabaseAdmin().from(TABLES.posts).select("*").order("updated_at", { ascending: false });
  if (options?.editStatus) query = query.eq("edit_status", options.editStatus);
  const search = options?.search?.trim().slice(0, 120);
  if (search) query = query.ilike("title", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  return unwrap<BlogPost[]>(query.range(offset, offset + limit - 1));
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
  return getRow(TABLES.posts, id);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  if (typeof slug !== "string" || slug.length < 1 || slug.length > 180) {
    throw new BlogValidationError("유효한 원고 식별자가 필요합니다.", "slug");
  }
  requireConfigured();
  const result = await request(getSupabaseAdmin().from(TABLES.posts).select("*").eq("slug", slug).maybeSingle());
  if (result.error) throw mapDatabaseError(result.error);
  return (result.data as BlogPost | null) ?? null;
}

export async function getBlogImportByChecksum(checksum: string): Promise<BlogImportRecord | null> {
  if (typeof checksum !== "string" || !/^[a-f0-9]{32,128}$/i.test(checksum)) throw new BlogValidationError("가져오기 checksum이 올바르지 않습니다.", "checksum");
  requireConfigured();
  const result = await request(getSupabaseAdmin().from(TABLES.imports).select("*").eq("checksum", checksum).maybeSingle());
  if (result.error) throw mapDatabaseError(result.error);
  return (result.data as BlogImportRecord | null) ?? null;
}

export async function getBlogImportByDedupeKey(dedupeKey: string): Promise<BlogImportRecord | null> {
  if (typeof dedupeKey !== "string" || dedupeKey.length < 1 || dedupeKey.length > 256) throw new BlogValidationError("가져오기 dedupe_key가 올바르지 않습니다.", "dedupe_key");
  requireConfigured();
  const result = await request(getSupabaseAdmin().from(TABLES.imports).select("*").eq("dedupe_key", dedupeKey).maybeSingle());
  if (result.error) throw mapDatabaseError(result.error);
  return (result.data as BlogImportRecord | null) ?? null;
}

export async function claimBlogImport(input: {
  source_type: BlogImportRecord["source_type"];
  original_file_name: string | null;
  external_id: string | null;
  platform_code: "naver" | "tistory" | null;
  account_id: string | null;
  checksum: string;
  dedupe_key: string;
  source_metadata: Record<string, unknown>;
  manual_retry?: boolean;
}): Promise<{ state: "claimed" | "completed" | "processing" | "retry_wait" | "retry_blocked" | "manual_approval_required"; record: BlogImportRecord }> {
  requireConfigured();
  const result = await request(getSupabaseAdmin().rpc("blog_claim_import", {
    p_source_type: input.source_type,
    p_original_file_name: input.original_file_name,
    p_external_id: input.external_id,
    p_platform_code: input.platform_code,
    p_account_id: input.account_id,
    p_checksum: input.checksum,
    p_dedupe_key: input.dedupe_key,
    p_source_metadata: input.source_metadata,
    p_lease_seconds: 900,
    p_manual_retry: input.manual_retry ?? false,
    p_manual_approval_by: null,
    p_manual_approval_reason: null,
  }));
  if (result.error) throw mapDatabaseError(result.error);
  if (!result.data || typeof result.data !== "object" || !("record" in result.data) || !("state" in result.data)) {
    throw new BlogDataError("database", "가져오기 잠금 결과를 확인할 수 없습니다.");
  }
  const value = result.data as { state: "claimed" | "completed" | "processing" | "retry_wait" | "retry_blocked" | "manual_approval_required"; record: BlogImportRecord };
  return value;
}

export async function renewBlogImportLease(importId: string, leaseToken: string): Promise<BlogImportRecord> {
  validateId(importId, "import_id");
  if (!isUuid(leaseToken)) throw new BlogValidationError("유효한 lease token이 필요합니다.", "lease_token");
  return unwrap<BlogImportRecord>(getSupabaseAdmin().rpc("blog_renew_import_lease", { p_import_id: importId, p_lease_token: leaseToken, p_lease_seconds: 900 }));
}

export async function completeBlogImport(importId: string, leaseToken: string, postId: string, cleanupStatus: "completed" | "pending" | "failed" = "completed", cleanupErrorCode: string | null = null): Promise<BlogImportRecord> {
  validateId(importId, "import_id");
  validateId(postId, "post_id");
  if (!isUuid(leaseToken)) throw new BlogValidationError("유효한 lease token이 필요합니다.", "lease_token");
  return unwrap<BlogImportRecord>(getSupabaseAdmin().rpc("blog_complete_import", { p_import_id: importId, p_lease_token: leaseToken, p_post_id: postId, p_cleanup_status: cleanupStatus, p_cleanup_error_code: cleanupErrorCode }));
}

export async function failBlogImport(importId: string, leaseToken: string, errorCode: string, cleanupStatus: "completed" | "pending" | "failed", cleanupErrorCode: string | null, cleanupAttempts: number): Promise<BlogImportRecord> {
  validateId(importId, "import_id");
  if (!isUuid(leaseToken)) throw new BlogValidationError("유효한 lease token이 필요합니다.", "lease_token");
  return unwrap<BlogImportRecord>(getSupabaseAdmin().rpc("blog_fail_import", { p_import_id: importId, p_lease_token: leaseToken, p_error_code: errorCode, p_cleanup_status: cleanupStatus, p_cleanup_error_code: cleanupErrorCode, p_cleanup_attempts: cleanupAttempts }));
}

export async function recordBlogImportCleanup(input: Pick<BlogImportCleanup, "import_id" | "idempotency_key" | "target_type" | "target_id"> & Partial<Pick<BlogImportCleanup, "status" | "error_code" | "attempts" | "next_attempt_at">>): Promise<BlogImportCleanup> {
  validateId(input.import_id, "import_id");
  validateId(input.target_id, "target_id");
  requireConfigured();
  const existing = await request(getSupabaseAdmin().from(TABLES.importCleanup).select("*").eq("idempotency_key", input.idempotency_key).maybeSingle());
  if (existing.error) throw mapDatabaseError(existing.error);
  if (existing.data) return existing.data as BlogImportCleanup;
  const result = await request(getSupabaseAdmin().from(TABLES.importCleanup).insert({
    ...input, status: input.status ?? "pending", attempts: input.attempts ?? 0,
    next_attempt_at: input.next_attempt_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
  }).select("*").single());
  if (result.error) {
    if (result.error.code === "23505") {
      const raced = await request(getSupabaseAdmin().from(TABLES.importCleanup).select("*").eq("idempotency_key", input.idempotency_key).single());
      if (!raced.error && raced.data) return raced.data as BlogImportCleanup;
    }
    throw mapDatabaseError(result.error);
  }
  if (!result.data) throw new BlogDataError("database", "cleanup 기록을 저장하지 못했습니다.");
  return result.data as BlogImportCleanup;
}

export async function claimBlogImportCleanup(id: string): Promise<BlogImportCleanup> {
  validateId(id, "cleanup_id");
  return unwrap<BlogImportCleanup>(getSupabaseAdmin().rpc("blog_claim_import_cleanup", { p_cleanup_id: id, p_lease_seconds: 300 }));
}

export async function finishBlogImportCleanup(id: string, leaseToken: string, success: boolean, errorCode: string | null = null): Promise<BlogImportCleanup> {
  validateId(id, "cleanup_id");
  if (!isUuid(leaseToken)) throw new BlogValidationError("유효한 cleanup lease token이 필요합니다.", "lease_token");
  return unwrap<BlogImportCleanup>(getSupabaseAdmin().rpc("blog_finish_import_cleanup", { p_cleanup_id: id, p_lease_token: leaseToken, p_success: success, p_error_code: errorCode }));
}

export async function approveBlogImportRetry(importId: string, principal: string, reason: string): Promise<BlogImportRecord> {
  validateId(importId, "import_id");
  if (!principal.trim() || !reason.trim()) throw new BlogValidationError("승인자와 승인 사유가 필요합니다.", "approval");
  return unwrap<BlogImportRecord>(getSupabaseAdmin().rpc("blog_approve_import_retry", { p_import_id: importId, p_approved_by: principal, p_reason: reason }));
}

export async function listPendingBlogImportCleanup(limit = 50): Promise<BlogImportCleanup[]> {
  requireConfigured();
  return unwrap<BlogImportCleanup[]>(getSupabaseAdmin().from(TABLES.importCleanup).select("*").in("status", ["pending", "failed"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at", { ascending: true }).limit(Math.max(1, Math.min(limit, 100))));
}

export async function createBlogImport(input: Omit<BlogImportRecord, "id" | "created_at" | "completed_at"> & { completed_at?: string | null }): Promise<BlogImportRecord> {
  requireConfigured();
  return insertRow(TABLES.imports, record(input));
}

export async function updateBlogImport(id: string, input: Partial<Pick<BlogImportRecord, "post_id" | "status" | "error_code" | "lease_expires_at" | "next_retry_at" | "cleanup_status" | "cleanup_error_code" | "cleanup_attempts" | "cleanup_next_retry_at" | "completed_at">>): Promise<BlogImportRecord> {
  validateId(id, "import_id");
  if (input.status !== undefined || input.lease_expires_at !== undefined || input.next_retry_at !== undefined || input.completed_at !== undefined) {
    throw new BlogDataError("conflict", "가져오기 상태는 lease 소유권 RPC를 통해서만 변경할 수 있습니다.");
  }
  requireConfigured();
  return updateRow(TABLES.imports, id, record(input));
}

export async function createBlogPost(input: CreateBlogPostInput): Promise<BlogPost> {
  return insertRow(TABLES.posts, record(validateCreateBlogPost(input)));
}

export async function updateBlogPost(id: string, input: UpdateBlogPostInput): Promise<BlogPost> {
  const patch = record(validateUpdateBlogPost(input));
  patch.updated_at = new Date().toISOString();
  return updateRow(TABLES.posts, id, patch);
}

/** Deleting a post cascades editor-only target/schedule links but preserves publish history snapshots. */
export async function deleteBlogPost(id: string): Promise<void> {
  await deleteRow(TABLES.posts, id);
}

export async function listBlogPostTargets(postId: string): Promise<BlogPostTarget[]> {
  validateId(postId, "post_id");
  requireConfigured();
  return unwrap<BlogPostTarget[]>(
    getSupabaseAdmin().from(TABLES.targets).select("*").eq("post_id", postId).order("created_at", { ascending: true }),
  );
}

export async function createBlogPostTarget(input: CreateBlogTargetInput): Promise<BlogPostTarget> {
  return insertRow(TABLES.targets, record(validateCreateBlogTarget(input)));
}

export async function updateBlogPostTarget(id: string, input: UpdateBlogTargetInput): Promise<BlogPostTarget> {
  const patch = record(validateUpdateBlogTarget(input));
  patch.updated_at = new Date().toISOString();
  return updateRow(TABLES.targets, id, patch);
}

export async function deleteBlogPostTarget(id: string): Promise<void> {
  await deleteRow(TABLES.targets, id);
}

export async function listBlogPostTopics(postId: string): Promise<BlogPostTopic[]> {
  validateId(postId, "post_id");
  requireConfigured();
  return unwrap<BlogPostTopic[]>(
    getSupabaseAdmin().from("blog_post_topics").select("*").eq("post_id", postId),
  );
}

export async function attachBlogTopic(postId: string, topicId: string): Promise<void> {
  validateId(postId, "post_id");
  validateId(topicId, "topic_id");
  requireConfigured();
  const result = await request(getSupabaseAdmin()
    .from("blog_post_topics")
    .upsert({ post_id: postId, topic_id: topicId }, { onConflict: "post_id,topic_id", ignoreDuplicates: true }));
  if (result.error) throw mapDatabaseError(result.error);
}

export async function detachBlogTopic(postId: string, topicId: string): Promise<void> {
  validateId(postId, "post_id");
  validateId(topicId, "topic_id");
  requireConfigured();
  const result = await request(getSupabaseAdmin().from("blog_post_topics").delete().eq("post_id", postId).eq("topic_id", topicId));
  if (result.error) throw mapDatabaseError(result.error);
}

export async function listBlogPostTargetCategories(targetId: string): Promise<BlogPostTargetCategory[]> {
  validateId(targetId, "target_id");
  requireConfigured();
  return unwrap<BlogPostTargetCategory[]>(
    getSupabaseAdmin().from("blog_post_target_categories").select("*").eq("target_id", targetId),
  );
}

export async function attachBlogCategory(targetId: string, categoryId: string): Promise<void> {
  validateId(targetId, "target_id");
  validateId(categoryId, "category_id");
  requireConfigured();
  const target = await getRow<BlogPostTarget>(TABLES.targets, targetId);
  const category = await getRow<BlogCategory>(TABLES.categories, categoryId);
  if (!target || !category) throw new BlogDataError("not_found", "게시 대상 또는 카테고리를 찾을 수 없습니다.");
  if (target.account_id !== category.account_id) {
    throw new BlogDataError("conflict", "카테고리는 같은 블로그 계정의 게시 대상에만 연결할 수 있습니다.");
  }
  const result = await request(getSupabaseAdmin()
    .from("blog_post_target_categories")
    .upsert({ target_id: targetId, category_id: categoryId, account_id: target.account_id }, { onConflict: "target_id,category_id", ignoreDuplicates: true }));
  if (result.error) throw mapDatabaseError(result.error);
}

export async function detachBlogCategory(targetId: string, categoryId: string): Promise<void> {
  validateId(targetId, "target_id");
  validateId(categoryId, "category_id");
  requireConfigured();
  const result = await request(getSupabaseAdmin().from("blog_post_target_categories").delete().eq("target_id", targetId).eq("category_id", categoryId));
  if (result.error) throw mapDatabaseError(result.error);
}

export async function listBlogAssets(limit = 100, offset = 0): Promise<BlogAsset[]> {
  return listRows<BlogAsset>(TABLES.assets, { orderBy: "created_at", limit, offset });
}

export async function getBlogAsset(id: string): Promise<BlogAsset | null> {
  return getRow(TABLES.assets, id);
}

export async function getBlogAssetUsage(id: string): Promise<{ coverReferences: number; inlineReferences: number }> {
  validateId(id, "asset_id");
  requireConfigured();
  const [cover, attached] = await Promise.all([
    request(getSupabaseAdmin().from(TABLES.posts).select("id", { count: "exact", head: true }).eq("cover_asset_id", id)),
    request(getSupabaseAdmin().from("blog_post_assets").select("post_id", { count: "exact", head: true }).eq("asset_id", id)),
  ]);
  if (cover.error) throw mapDatabaseError(cover.error);
  if (attached.error) throw mapDatabaseError(attached.error);
  return { coverReferences: cover.count ?? 0, inlineReferences: attached.count ?? 0 };
}

export async function createBlogAsset(
  input: CreateBlogAssetInput,
  dimensions: { width: number; height: number },
): Promise<BlogAsset> {
  if (!Number.isSafeInteger(dimensions.width) || dimensions.width < 1 || !Number.isSafeInteger(dimensions.height) || dimensions.height < 1) {
    throw new BlogValidationError("서버에서 확인한 이미지 크기가 올바르지 않습니다.", "dimensions");
  }
  return insertRow(TABLES.assets, { ...record(validateCreateBlogAsset(input)), width: dimensions.width, height: dimensions.height });
}

export async function getBlogStorageCleanupByAsset(assetId: string): Promise<BlogStorageCleanup | null> {
  validateId(assetId, "asset_id");
  requireConfigured();
  const result = await request(getSupabaseAdmin().from(TABLES.storageCleanup).select("*").eq("asset_id", assetId).maybeSingle());
  if (result.error) throw mapDatabaseError(result.error);
  return (result.data as BlogStorageCleanup | null) ?? null;
}

export async function getBlogStorageCleanupById(id: string): Promise<BlogStorageCleanup | null> {
  return getRow<BlogStorageCleanup>(TABLES.storageCleanup, id);
}

export async function listBlogStorageCleanup(limit = 100): Promise<BlogStorageCleanup[]> {
  requireConfigured();
  return unwrap<BlogStorageCleanup[]>(getSupabaseAdmin().from(TABLES.storageCleanup).select("*")
    .neq("status", "completed").order("next_attempt_at", { ascending: true }).limit(Math.max(1, Math.min(limit, 200))));
}

export async function createBlogOrphanCleanup(storagePath: string): Promise<BlogStorageCleanup> {
  return insertRow(TABLES.storageCleanup, {
    action: "delete_orphan", storage_path: storagePath, status: "pending", attempts: 0,
    next_attempt_at: new Date().toISOString(),
  });
}

export async function prepareBlogAssetCleanup(assetId: string, backupPath: string): Promise<BlogStorageCleanup> {
  validateId(assetId, "asset_id");
  requireConfigured();
  return unwrap<BlogStorageCleanup>(getSupabaseAdmin().rpc("blog_prepare_asset_cleanup", {
    p_asset_id: assetId,
    p_backup_path: backupPath,
  }));
}

export async function updateBlogStorageCleanup(
  id: string,
  update: Pick<BlogStorageCleanup, "status"> & Partial<Pick<BlogStorageCleanup, "last_error_code" | "attempts" | "next_attempt_at">>,
): Promise<BlogStorageCleanup> {
  validateId(id, "cleanup_id");
  const patch = record(update);
  patch.completed_at = update.status === "completed" ? new Date().toISOString() : null;
  patch.updated_at = new Date().toISOString();
  patch.next_attempt_at = update.next_attempt_at ?? (update.status === "completed" ? new Date().toISOString() : new Date(Date.now() + 60_000).toISOString());
  return updateRow(TABLES.storageCleanup, id, {
    ...patch,
  });
}

export async function attachBlogAsset(
  postId: string,
  assetId: string,
  role: BlogPostAsset["role"] = "inline",
  sortOrder = 0,
): Promise<void> {
  validateId(postId, "post_id");
  validateId(assetId, "asset_id");
  if (role !== "cover" && role !== "inline") throw new BlogValidationError("이미지 역할 값이 올바르지 않습니다.", "role");
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) throw new BlogValidationError("이미지 순서 값이 올바르지 않습니다.", "sort_order");
  requireConfigured();
  const result = await request(getSupabaseAdmin()
    .from("blog_post_assets")
    .upsert({ post_id: postId, asset_id: assetId, role, sort_order: sortOrder }, { onConflict: "post_id,asset_id" }));
  if (result.error) throw mapDatabaseError(result.error);
}

export async function listBlogPostAssets(postId: string): Promise<BlogPostAsset[]> {
  validateId(postId, "post_id");
  requireConfigured();
  return unwrap<BlogPostAsset[]>(
    getSupabaseAdmin().from("blog_post_assets").select("*").eq("post_id", postId),
  );
}

export async function detachBlogAsset(postId: string, assetId: string): Promise<void> {
  validateId(postId, "post_id");
  validateId(assetId, "asset_id");
  requireConfigured();
  const result = await request(getSupabaseAdmin().from("blog_post_assets").delete().eq("post_id", postId).eq("asset_id", assetId));
  if (result.error) throw mapDatabaseError(result.error);
}

/** Deletes only metadata. The authenticated caller must remove the Storage object first. */
export async function deleteBlogAssetMetadata(id: string): Promise<void> {
  const usage = await getBlogAssetUsage(id);
  if (usage.coverReferences > 0 || usage.inlineReferences > 0) {
    throw new BlogDataError("conflict", "원고에서 사용 중인 이미지는 먼저 연결을 해제해야 합니다.");
  }
  await deleteRow(TABLES.assets, id);
}

export async function listBlogSchedules(options?: {
  status?: BlogSchedule["status"];
  from?: string;
  to?: string;
  limit?: number;
}): Promise<BlogSchedule[]> {
  if (options?.status && !["planned", "cancelled", "completed", "missed"].includes(options.status)) {
    throw new BlogValidationError("허용되지 않은 일정 상태입니다.", "status");
  }
  if (options?.from && !Number.isFinite(Date.parse(options.from))) {
    throw new BlogValidationError("유효한 시작 날짜/시간이 필요합니다.", "from");
  }
  if (options?.to && !Number.isFinite(Date.parse(options.to))) {
    throw new BlogValidationError("유효한 종료 날짜/시간이 필요합니다.", "to");
  }
  if (options?.from && options?.to && Date.parse(options.from) > Date.parse(options.to)) {
    throw new BlogValidationError("시작 날짜/시간은 종료 날짜/시간보다 늦을 수 없습니다.", "from");
  }
  requireConfigured();
  let query = getSupabaseAdmin().from(TABLES.schedules).select("*").order("planned_at", { ascending: true });
  if (options?.status) query = query.eq("status", options.status);
  if (options?.from) query = query.gte("planned_at", options.from);
  if (options?.to) query = query.lte("planned_at", options.to);
  return unwrap<BlogSchedule[]>(query.limit(Math.max(1, Math.min(options?.limit ?? 200, 500))));
}

export async function createBlogSchedule(input: CreateBlogScheduleInput): Promise<BlogSchedule> {
  return insertRow(TABLES.schedules, record(validateCreateBlogSchedule(input)));
}

export async function updateBlogSchedule(id: string, input: UpdateBlogScheduleInput): Promise<BlogSchedule> {
  const patch = record(validateUpdateBlogSchedule(input));
  const current = await getRow<BlogSchedule>(TABLES.schedules, id);
  if (!current) throw new BlogDataError("not_found", "수정할 일정을 찾을 수 없습니다.");
  if (current.status !== "planned" || !isBlogScheduleTransitionAllowed(current.status, (patch.status as BlogSchedule["status"] | undefined) ?? current.status)) {
    throw new BlogDataError("conflict", "완료·취소·누락된 일정은 수정할 수 없습니다.");
  }
  patch.updated_at = new Date().toISOString();
  return updateRow(TABLES.schedules, id, patch);
}

export async function deleteBlogSchedule(id: string): Promise<void> {
  await deleteRow(TABLES.schedules, id);
}

export async function recordBlogPublish(input: unknown, idempotencyKey: string): Promise<BlogPublishRecordResult> {
  if (!isUuid(idempotencyKey)) throw new BlogValidationError("유효한 Idempotency-Key UUID가 필요합니다.", "Idempotency-Key");
  const valid = validateCreateBlogPublishHistory(input);
  requireConfigured();
  const fingerprint = createHash("sha256").update(JSON.stringify({
    target_id: valid.target_id,
    result: valid.result,
    schedule_id: valid.schedule_id ?? null,
    published_at: valid.published_at ?? null,
    external_url: valid.external_url ?? null,
    note: valid.note ?? null,
  })).digest("hex");
  return unwrap<BlogPublishRecordResult>(
    getSupabaseAdmin().rpc("blog_record_publish_history", {
      p_target_id: valid.target_id,
      p_result: valid.result,
      p_published_at: valid.published_at ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_external_url: valid.external_url ?? null,
      p_note: valid.note ?? null,
      p_schedule_id: valid.schedule_id ?? null,
    }),
  );
}

export async function listBlogPublishHistory(options?: {
  postId?: string;
  accountId?: string;
  result?: BlogPublishHistory["result"];
  limit?: number;
  offset?: number;
}): Promise<BlogPublishHistory[]> {
  if (options?.postId) validateId(options.postId, "post_id");
  if (options?.accountId) validateId(options.accountId, "account_id");
  if (options?.result && options.result !== "success" && options.result !== "failed") {
    throw new BlogValidationError("허용되지 않은 게시 결과입니다.", "result");
  }
  requireConfigured();
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));
  const offset = Math.max(0, options?.offset ?? 0);
  let query = getSupabaseAdmin().from(TABLES.history).select("*").order("created_at", { ascending: false });
  if (options?.postId) query = query.eq("post_id", options.postId);
  if (options?.accountId) query = query.eq("account_id", options.accountId);
  if (options?.result) query = query.eq("result", options.result);
  return unwrap<BlogPublishHistory[]>(query.range(offset, offset + limit - 1));
}

export async function listBlogMetrics(historyId: string): Promise<BlogMetric[]> {
  validateId(historyId, "publish_history_id");
  requireConfigured();
  return unwrap<BlogMetric[]>(
    getSupabaseAdmin().from(TABLES.metrics).select("*").eq("publish_history_id", historyId).order("measured_at", { ascending: false }),
  );
}

export async function createBlogMetric(input: CreateBlogMetricInput): Promise<BlogMetric> {
  return insertRow(TABLES.metrics, record(validateCreateBlogMetric(input)));
}

export async function deleteBlogMetric(id: string): Promise<void> {
  await deleteRow(TABLES.metrics, id);
}
