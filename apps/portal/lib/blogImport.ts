import { createHash } from "node:crypto";
import {
  attachBlogAsset,
  attachBlogCategory,
  claimBlogImport,
  claimBlogImportCleanup,
  completeBlogImport,
  createBlogPost,
  createBlogPostTarget,
  deleteBlogPost,
  failBlogImport,
  getBlogAccount,
  getBlogPost,
  getBlogAsset,
  getBlogAssetUsage,
  listBlogAccounts,
  listBlogCategories,
  listBlogPlatforms,
  listPendingBlogImportCleanup,
  finishBlogImportCleanup,
  recordBlogImportCleanup,
} from "@/lib/blog";
import { deleteBlogImage, uploadBlogImage } from "@/lib/blogStorage";
import { BlogDataError } from "@/lib/blog";
import { BlogValidationError, isUuid, type BlogImportRecord, type BlogImportSourceType, type BlogPost } from "@/lib/blogShared";

if (typeof window !== "undefined") throw new Error("@/lib/blogImport is server-only.");

export type BlogImportImageData = {
  source_id: string;
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  bytes: Uint8Array;
  alt_text?: string | null;
  sort_order?: number;
};

export type BlogImportDocument = {
  source_type: BlogImportSourceType;
  original_file_name?: string | null;
  checksum?: string;
  external_id?: string | null;
  title: string;
  excerpt?: string | null;
  body_markdown: string;
  body_html: string;
  images?: BlogImportImageData[];
  metadata?: Record<string, unknown>;
};

export type BlogImportResult = { created: boolean; idempotent: boolean; post: BlogPost; import_record: BlogImportRecord; images: string[] };
export type BlogImportPublicRecord = Pick<BlogImportRecord, "id" | "post_id" | "source_type" | "original_file_name" | "external_id" | "platform_code" | "account_id" | "status" | "attempt_count" | "error_code" | "created_at" | "updated_at" | "completed_at"> & {
  category_name: string | null;
};
export type BlogImportPublicResult = Omit<BlogImportResult, "import_record"> & { import_record: BlogImportPublicRecord };

export function toBlogImportPublicResult(result: BlogImportResult): BlogImportPublicResult {
  const { id, post_id, source_type, original_file_name, external_id, platform_code, account_id, status, attempt_count, error_code, created_at, updated_at, completed_at } = result.import_record;
  const categoryValue = result.import_record.source_metadata.category
    ?? result.import_record.source_metadata.category_name
    ?? result.import_record.source_metadata.catalog;
  const category_name = typeof categoryValue === "string" && categoryValue.trim() ? categoryValue.trim() : null;
  return { ...result, import_record: { id, post_id, source_type, original_file_name, external_id, platform_code, account_id, status, attempt_count, error_code, created_at, updated_at, completed_at, category_name } };
}

function checksumFor(input: BlogImportDocument): string {
  if (input.checksum && /^[a-f0-9]{32,128}$/i.test(input.checksum)) return input.checksum.toLowerCase();
  const images = (input.images ?? []).map((image) => ({
    source_id: image.source_id,
    mime_type: image.mime_type,
    sort_order: image.sort_order ?? 0,
    bytes: createHash("sha256").update(image.bytes).digest("hex"),
  }));
  return createHash("sha256").update(JSON.stringify({ source_type: input.source_type, external_id: input.external_id, title: input.title, body_html: input.body_html, metadata: input.metadata ?? {}, images })).digest("hex");
}

function dedupeKeyFor(input: BlogImportDocument, checksum: string, platformCode: "naver" | "tistory", accountId: string): string {
  const identity = input.external_id?.trim() ? `external:${input.external_id.trim()}` : `checksum:${checksum}`;
  return createHash("sha256").update(`${input.source_type}|${platformCode}|${accountId}|${identity}`).digest("hex");
}

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (!metadata) return;
  if (metadata.platform !== undefined && metadata.platform !== "naver" && metadata.platform !== "tistory") throw new BlogValidationError("지원하지 않는 블로그 플랫폼입니다.", "metadata.platform");
  if (metadata.tags !== undefined && (!Array.isArray(metadata.tags) || metadata.tags.some((tag) => typeof tag !== "string" || tag.length > 100))) throw new BlogValidationError("metadata.tags 형식이 올바르지 않습니다.", "metadata.tags");
  if (metadata.account_id !== undefined && (!isUuid(metadata.account_id) || typeof metadata.account_id !== "string")) throw new BlogValidationError("metadata.account_id가 올바르지 않습니다.", "metadata.account_id");
  if (metadata.category_id !== undefined && (!isUuid(metadata.category_id) || typeof metadata.category_id !== "string")) throw new BlogValidationError("metadata.category_id가 올바르지 않습니다.", "metadata.category_id");
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const normalized = { ...metadata };
  if (typeof normalized.platform === "string") normalized.platform = normalized.platform.trim().toLowerCase();
  return normalized;
}

export async function registerBlogImport(input: BlogImportDocument): Promise<BlogImportResult> {
  const metadata = normalizeMetadata(input.metadata);
  validateMetadata(metadata);
  const externalId = typeof input.external_id === "string" ? input.external_id.trim() : null;
  if (externalId && externalId.length > 120) throw new BlogValidationError("external_id는 1~120자여야 합니다.", "external_id");
  const platformCode = metadata?.platform === "naver" || metadata?.platform === "tistory" ? metadata.platform : null;
  const requestedAccountId = typeof metadata?.account_id === "string" ? metadata.account_id : null;
  const platforms = await listBlogPlatforms();
  const platform = platformCode ? platforms.find((item) => item.code === platformCode) : undefined;
  if (!platform) throw new BlogValidationError("가져오기에는 유효한 platform이 필요합니다.", "metadata.platform");
  let accountId = requestedAccountId;
  let resolvedCategoryId: string | null = null;
  const requestedCategoryId = typeof metadata?.category_id === "string" ? metadata.category_id : null;
  const requestedCategoryName = typeof metadata?.category === "string" ? metadata.category.trim() : "";

  if (accountId) {
    // 계정과 카테고리는 독립 항목이다. account_id만 지정해도 카테고리 없이 가져올 수 있다.
    const account = await getBlogAccount(accountId);
    if (!account) throw new BlogDataError("not_found", "metadata.account_id에 해당하는 블로그 계정을 찾을 수 없습니다.");
    if (account.platform_id !== platform.id) throw new BlogDataError("conflict", "metadata.platform과 account_id의 플랫폼이 일치하지 않습니다.");

    const categories = await listBlogCategories(accountId);
    if (requestedCategoryId) {
      const category = categories.find((item) => item.id === requestedCategoryId);
      if (!category) throw new BlogDataError("not_found", "metadata.category_id에 해당하는 카테고리가 지정한 계정에 없습니다.");
      resolvedCategoryId = category.id;
    } else if (requestedCategoryName) {
      // 이름으로 카테고리를 지정한 기존 형식은 일치할 때만 연결한다.
      const matches = categories.filter((item) => item.name === requestedCategoryName);
      if (matches.length > 1) throw new BlogDataError("conflict", "동일한 이름의 카테고리가 여러 개입니다. category_id를 지정하세요.");
      resolvedCategoryId = matches[0]?.id ?? null;
    }
  } else {
    const accounts = (await listBlogAccounts(platform.id)).filter((item) => item.active);
    if (requestedCategoryId) {
      // category_id만 주어진 경우 플랫폼 내 카테고리의 소속 계정을 찾는다.
      const candidates: Array<{ accountId: string; categoryId: string }> = [];
      for (const account of accounts) {
        for (const category of await listBlogCategories(account.id)) {
          if (category.id === requestedCategoryId) candidates.push({ accountId: account.id, categoryId: category.id });
        }
      }
      if (candidates.length !== 1) {
        throw new BlogDataError(
          candidates.length ? "conflict" : "not_found",
          candidates.length ? "metadata.category_id가 여러 계정에서 확인됩니다. account_id를 지정하세요." : "metadata.category_id에 해당하는 계정별 카테고리를 찾을 수 없습니다.",
        );
      }
      accountId = candidates[0].accountId;
      resolvedCategoryId = candidates[0].categoryId;
    } else {
      // 기존 category 이름으로 계정을 추론하되, 일치하는 카테고리가 없으면 단일 활성 계정을 기본 계정으로 사용한다.
      const categoryCandidates: Array<{ accountId: string; categoryId: string }> = [];
      if (requestedCategoryName) {
        for (const account of accounts) {
          for (const category of await listBlogCategories(account.id)) {
            if (category.name === requestedCategoryName) categoryCandidates.push({ accountId: account.id, categoryId: category.id });
          }
        }
      }
      if (categoryCandidates.length === 1) {
        accountId = categoryCandidates[0].accountId;
        resolvedCategoryId = categoryCandidates[0].categoryId;
      } else if (categoryCandidates.length > 1) {
        throw new BlogDataError("conflict", "카테고리가 여러 계정과 일치합니다. account_id를 지정하세요.");
      } else if (accounts.length === 1) {
        accountId = accounts[0].id;
        // 카테고리는 선택 사항이므로 이름이 일치하지 않아도 원고 가져오기를 계속한다.
      } else if (accounts.length === 0) {
        throw new BlogDataError("not_found", "해당 플랫폼에 활성화된 블로그 계정이 없습니다.");
      } else {
        throw new BlogValidationError("활성 블로그 계정이 여러 개입니다. metadata.account_id를 지정하세요.", "metadata.account_id");
      }
    }
  }
  if (!accountId) throw new BlogValidationError("가져오기 계정을 확정하지 못했습니다.", "metadata.account_id");
  const checksum = checksumFor(input);
  const resolvedPlatformCode = platform.code;
  const dedupeKey = dedupeKeyFor(input, checksum, resolvedPlatformCode, accountId);
  const claim = await claimBlogImport({
    source_type: input.source_type,
    original_file_name: input.original_file_name ?? null,
    external_id: externalId,
    platform_code: resolvedPlatformCode,
    account_id: accountId,
    checksum,
    dedupe_key: dedupeKey,
    source_metadata: metadata ?? {},
  });
  const importRecord = claim.record;
  if (claim.state === "completed" && importRecord.post_id) {
    const existingPost = await getBlogPost(importRecord.post_id);
    if (existingPost) return { created: false, idempotent: true, post: existingPost, import_record: importRecord, images: [] };
    throw new BlogDataError("conflict", "이미 완료된 가져오기 기록에 연결된 원고를 찾을 수 없습니다.");
  }
  if (claim.state === "completed") throw new BlogDataError("conflict", "이미 완료된 가져오기 기록입니다.");
  if (claim.state === "processing" || claim.state === "retry_wait" || claim.state === "retry_blocked" || claim.state === "manual_approval_required") {
    throw new BlogDataError("conflict", claim.state === "processing" ? "동일한 가져오기가 처리 중입니다." : claim.state === "retry_blocked" ? "자동 재시도 한도를 초과했습니다. 관리자 수동 재시도를 사용하세요." : claim.state === "manual_approval_required" ? "수동 재시도 승인자와 사유가 필요합니다." : "이 가져오기는 아직 재시도할 수 없습니다.");
  }
  const uploaded: Array<{ id: string; source: string }> = [];
  let post: BlogPost | null = null;
  try {
    const images = [...(input.images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const sourceMap = new Map<string, string>();
    for (const image of images) {
      if (sourceMap.has(image.source_id)) throw new BlogValidationError("이미지 source_id가 중복됩니다.", "images");
      const asset = await uploadBlogImage(image.bytes, image.mime_type, image.file_name, image.alt_text);
      uploaded.push({ id: asset.id, source: image.source_id });
      sourceMap.set(image.source_id, asset.id);
    }
    const bodyHtml = input.body_html.replace(/\{\{image:([A-Za-z0-9._-]+)\}\}/g, (token, sourceId: string) => {
      const assetId = sourceMap.get(sourceId);
      return assetId ? `{{image:${assetId}}}` : token;
    });
    // slug is nullable in the existing schema; imported external IDs remain in blog_imports.
    post = await createBlogPost({ title: input.title, excerpt: input.excerpt ?? null, body_markdown: input.body_markdown, body_html: bodyHtml, edit_status: "ready", slug: null, cover_asset_id: uploaded[0]?.id ?? null });
    for (const [index, uploadedAsset] of uploaded.entries()) {
      const sourceImage = images.find((image) => image.source_id === uploadedAsset.source);
      await attachBlogAsset(post.id, uploadedAsset.id, index === 0 ? "cover" : "inline", sourceImage?.sort_order ?? index);
    }

    const target = await createBlogPostTarget({ post_id: post.id, account_id: accountId });
    if (resolvedCategoryId) await attachBlogCategory(target.id, resolvedCategoryId);
    if (!importRecord.lease_token) throw new BlogDataError("conflict", "가져오기 처리권이 없습니다.");
    const completed = await completeBlogImport(importRecord.id, importRecord.lease_token, post.id);
    return { created: true, idempotent: false, post, import_record: completed, images: uploaded.map(({ id }) => id) };
  } catch (error) {
    let cleanupFailed = false;
    if (post) {
      try { await deleteBlogPost(post.id); } catch (deleteError) {
        // A retry after a successful prior cleanup is idempotent.
        if (!(deleteError instanceof BlogDataError && deleteError.code === "not_found")) cleanupFailed = true;
      }
    }
    await Promise.all(uploaded.map(async ({ id }) => {
      try { await deleteBlogImage(id); } catch { cleanupFailed = true; }
    }));
    if (cleanupFailed) {
      const targets = [
        ...(post ? [{ type: "post" as const, id: post.id }] : []),
        ...uploaded.map(({ id }) => ({ type: "asset" as const, id })),
      ];
      for (const target of targets) {
        try { await recordBlogImportCleanup({ import_id: importRecord.id, idempotency_key: `${importRecord.id}:${target.type}:${target.id}`, target_type: target.type, target_id: target.id, status: "pending", error_code: "compensation_failed", attempts: 1 }); }
        catch { console.error("blog_import_cleanup_record_failed", { importId: importRecord.id, targetType: target.type, targetId: target.id }); }
      }
    }
    try {
      if (importRecord.lease_token) await failBlogImport(importRecord.id, importRecord.lease_token, error instanceof Error ? error.name : "import_failed", cleanupFailed ? "pending" : "completed", cleanupFailed ? "compensation_failed" : null, cleanupFailed ? importRecord.cleanup_attempts + 1 : importRecord.cleanup_attempts);
    } catch (stateError) {
      try {
        await recordBlogImportCleanup({ import_id: importRecord.id, idempotency_key: `${importRecord.id}:import-state`, target_type: "import", target_id: importRecord.id, status: "pending", error_code: "state_update_failed", attempts: 1 });
      } catch { /* the log below remains the final diagnostic if durable recording also fails */ }
      console.error("blog_import_state_update_failed", { importId: importRecord.id, dedupeKey, cleanupFailed, error: stateError instanceof Error ? stateError.name : "unknown" });
    }
    throw error;
  }
}

async function processClaimedImportCleanup(job: Awaited<ReturnType<typeof claimBlogImportCleanup>>): Promise<void> {
  let success = false;
  let errorCode: string | null = null;
  try {
    if (job.target_type === "post") {
      const post = await getBlogPost(job.target_id);
      if (!post) success = true;
      else {
        await deleteBlogPost(job.target_id);
        success = true;
      }
    } else if (job.target_type === "asset") {
      const asset = await getBlogAsset(job.target_id);
      if (!asset) success = true;
      else {
        const usage = await getBlogAssetUsage(job.target_id);
        if (usage.coverReferences > 0 || usage.inlineReferences > 0) errorCode = "asset_referenced";
        else {
          await deleteBlogImage(job.target_id);
          success = true;
        }
      }
    } else {
      errorCode = "state_update_requires_manual_review";
    }
  } catch (error) {
    if (error instanceof BlogDataError && error.code === "not_found") success = true;
    else errorCode = error instanceof Error ? error.name : "cleanup_failed";
  }
  await finishBlogImportCleanup(job.id, job.lease_token!, success, errorCode);
}

export async function retryBlogImportCleanup(id: string): Promise<void> {
  const job = await claimBlogImportCleanup(id);
  await processClaimedImportCleanup(job);
}

export async function processPendingBlogImportCleanup(limit = 50): Promise<{ processed: number; failed: number }> {
  const jobs = await listPendingBlogImportCleanup(limit);
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await retryBlogImportCleanup(job.id);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}
