import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import {
  createBlogAsset,
  createBlogOrphanCleanup,
  deleteBlogAssetMetadata,
  getBlogAsset,
  getBlogStorageCleanupByAsset,
  getBlogStorageCleanupById,
  listBlogStorageCleanup,
  listBlogAssets,
  prepareBlogAssetCleanup,
  updateBlogStorageCleanup,
} from "@/lib/blog";
import { BlogDataError as DataError } from "@/lib/blog";
import { BlogStorageError, BlogValidationError, type BlogAsset, type BlogStorageCleanup, type CreateBlogAssetInput } from "@/lib/blogShared";

const BUCKET = "blog-assets";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

if (typeof window !== "undefined") throw new Error("blogStorage is server-only.");

export type VerifiedBlogImage = { mimeType: BlogAsset["mime_type"]; width: number; height: number; pages: number };

function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return "image/png";
  if (bytes.length >= 6 && new TextDecoder().decode(bytes.subarray(0, 6)).match(/^GIF8[79]a$/)) return "image/gif";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

function ext(mime: string): string {
  switch (mime) { case "image/jpeg": return "jpg"; case "image/png": return "png"; case "image/webp": return "webp"; case "image/gif": return "gif"; default: throw new BlogStorageError("invalid_file", "허용되지 않은 이미지 형식입니다."); }
}
function mimeForSharp(format: string | undefined): BlogAsset["mime_type"] | null {
  switch (format) { case "jpeg": return "image/jpeg"; case "png": return "image/png"; case "webp": return "image/webp"; case "gif": return "image/gif"; default: return null; }
}
function requireStorage(): void { if (!isSupabaseAdminConfigured()) throw new DataError("not_configured", "블로그 Storage 설정이 없습니다."); }
function storageFailure(): BlogStorageError { return new BlogStorageError("storage", "비공개 이미지 저장소 요청을 처리하지 못했습니다. 버킷 설정을 확인하세요."); }
function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: unknown; status?: unknown };
  return value.statusCode === "404" || value.status === 404;
}

async function requirePrivateBucket(): Promise<void> {
  requireStorage();
  try {
    const { data, error } = await getSupabaseAdmin().storage.listBuckets();
    if (error) throw storageFailure();
    const bucket = data?.find((item) => item.name === BUCKET);
    if (!bucket || bucket.public) throw new BlogStorageError("not_configured", "비공개 blog-assets Storage 버킷이 준비되지 않았습니다.");
  } catch (error) {
    if (error instanceof BlogStorageError) throw error;
    throw storageFailure();
  }
}

/** Checks the signature, decodes every page/frame, and returns server-derived dimensions. */
export async function inspectBlogImage(bytes: Uint8Array, declaredMime: string): Promise<VerifiedBlogImage> {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new BlogStorageError("invalid_file", "이미지는 1바이트 이상 10MiB 이하여야 합니다.");
  const signatureMime = detectMime(bytes);
  if (!signatureMime || !ALLOWED.has(declaredMime) || signatureMime !== declaredMime) {
    throw new BlogStorageError("invalid_file", "파일 signature와 선언된 MIME 형식이 일치하지 않습니다.");
  }

  try {
    const pipeline = sharp(Buffer.from(bytes), {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: true,
      pages: -1,
      sequentialRead: true,
    });
    const metadata = await pipeline.metadata();
    const decodedMime = mimeForSharp(metadata.format);
    if (decodedMime !== signatureMime || decodedMime !== declaredMime) {
      throw new BlogStorageError("invalid_file", "파일 signature, MIME 형식 및 실제 디코더 결과가 일치하지 않습니다.");
    }

    const width = metadata.width;
    const height = metadata.pageHeight ?? metadata.height;
    const pages = metadata.pages ?? 1;
    if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(pages) || pages < 1) {
      throw new BlogStorageError("invalid_file", "이미지 크기 정보를 확인할 수 없습니다.");
    }
    const totalPixels = width * height * pages;
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || !Number.isSafeInteger(totalPixels) || totalPixels > MAX_IMAGE_PIXELS) {
      throw new BlogStorageError("invalid_file", `이미지는 한 변 ${MAX_IMAGE_DIMENSION}px 및 전체 ${MAX_IMAGE_PIXELS.toLocaleString()}픽셀 이하여야 합니다.`);
    }

    // metadata() alone only reads headers; stats() forces libvips to decode pixel data.
    await pipeline.stats();
    return { mimeType: decodedMime, width, height, pages };
  } catch (error) {
    if (error instanceof BlogStorageError) throw error;
    throw new BlogStorageError("invalid_file", "손상되었거나 실제 이미지로 디코딩할 수 없는 파일입니다.");
  }
}

function safeFileName(originalName: string, mime: string): string {
  const leaf = originalName.normalize("NFKC").split(/[\\/]/).pop() ?? "image";
  const normalizedLeaf = Array.from(leaf, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? "_" : char;
  }).join("");
  const stem = normalizedLeaf
    .replace(/\.[^.]*$/, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 240);
  return `${stem || "image"}.${ext(mime)}`;
}

async function persistCleanup(job: BlogStorageCleanup, status: BlogStorageCleanup["status"], lastErrorCode: string | null = null): Promise<BlogStorageCleanup> {
  if (job.status === "completed") {
    if (status === "completed") return job;
    throw new BlogStorageError("conflict", "완료된 이미지 정리 작업은 다시 열 수 없습니다.");
  }
  try {
    return await updateBlogStorageCleanup(job.id, {
      status,
      last_error_code: lastErrorCode,
      attempts: job.attempts + (lastErrorCode ? 1 : 0),
      next_attempt_at: status === "completed" ? new Date().toISOString() : new Date(Date.now() + Math.min(60_000 * 2 ** Math.min(job.attempts, 6), 3_600_000)).toISOString(),
    });
  } catch {
    try {
      const current = await getBlogStorageCleanupById(job.id);
      if (current?.status === "completed" && status !== "completed") return current;
    } catch { /* keep the safe generic result below */ }
    console.error("blog_storage_cleanup_state_write_failed", { cleanupId: job.id, state: status });
    throw new BlogStorageError("compensation_failed", "이미지 정리 상태를 저장하지 못했습니다. 재시도 기록을 확인해야 합니다.");
  }
}

async function downloadIfPresent(path: string): Promise<Buffer | null> {
  try {
    const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
    if (error) {
      if (isMissingObject(error)) return null;
      throw storageFailure();
    }
    return Buffer.from(await data.arrayBuffer());
  } catch (error) {
    if (error instanceof BlogStorageError) throw error;
    if (isMissingObject(error)) return null;
    throw storageFailure();
  }
}

async function removeObject(path: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
    if (error && !isMissingObject(error)) throw storageFailure();
  } catch (error) {
    if (error instanceof BlogStorageError) throw error;
    if (!isMissingObject(error)) throw storageFailure();
  }
}

async function removeOrphan(job: BlogStorageCleanup): Promise<void> {
  if (Date.parse(job.next_attempt_at) > Date.now()) {
    throw new BlogStorageError("conflict", "이 정리 작업은 next_attempt_at 이후 재시도할 수 있습니다.");
  }
  try {
    await removeObject(job.storage_path);
    if (job.backup_path) await removeObject(job.backup_path);
    await persistCleanup(job, "completed");
  } catch {
    await persistCleanup(job, "pending", "orphan_remove_failed");
    throw new BlogStorageError("compensation_failed", "고아 이미지 정리를 완료하지 못했습니다. 정리 작업으로 재시도할 수 있습니다.");
  }
}

async function restoreOriginal(job: BlogStorageCleanup): Promise<void> {
  if (!job.backup_path) throw new BlogStorageError("compensation_failed", "이미지 복구용 백업 경로가 없습니다.");
  const backup = await downloadIfPresent(job.backup_path);
  if (!backup) throw new BlogStorageError("compensation_failed", "이미지 복구용 백업 파일을 찾을 수 없습니다.");
  const { error } = await getSupabaseAdmin().storage.from(BUCKET).upload(job.storage_path, backup, {
    contentType: job.mime_type ?? "application/octet-stream",
    upsert: true,
  });
  if (error) throw storageFailure();
}

async function completeDeleteJob(job: BlogStorageCleanup): Promise<void> {
  if (job.status === "completed") return;
  try {
    await removeObject(job.storage_path);
    if (job.backup_path) await removeObject(job.backup_path);
    await persistCleanup(job, "completed");
  } catch {
    await persistCleanup(job, "cleanup_pending", "object_cleanup_failed");
    throw new BlogStorageError("compensation_failed", "이미지 삭제 후 백업 정리를 완료하지 못했습니다. 정리 작업으로 재시도할 수 있습니다.");
  }
}

async function processAssetDelete(job: BlogStorageCleanup, metadataExists: boolean): Promise<void> {
  if (job.status === "completed") return;
  if (Date.parse(job.next_attempt_at) > Date.now()) {
    throw new BlogStorageError("conflict", "이 정리 작업은 next_attempt_at 이후 재시도할 수 있습니다.");
  }
  if (!metadataExists) {
    await completeDeleteJob(job);
    return;
  }
  if (job.status === "source_missing") {
    const restoredExternally = await downloadIfPresent(job.storage_path);
    if (!restoredExternally) throw new BlogStorageError("not_found", "이미지 메타데이터는 있지만 Storage 파일이 없습니다.");
    job = await persistCleanup(job, "pending");
  }
  if (job.status === "restore_pending") {
    try {
      await restoreOriginal(job);
      job = await persistCleanup(job, "retry");
    } catch {
      await persistCleanup(job, "restore_pending", "restore_retry_failed");
      throw new BlogStorageError("compensation_failed", "백업 이미지 복구가 아직 완료되지 않았습니다.");
    }
  }

  if (job.status === "pending" || job.status === "retry") {
    let backup = job.backup_path ? await downloadIfPresent(job.backup_path) : null;
    if (!backup) {
      const original = await downloadIfPresent(job.storage_path);
      if (!original) {
        await persistCleanup(job, "source_missing", "storage_object_missing");
        throw new BlogStorageError("not_found", "이미지 메타데이터는 있지만 Storage 파일이 없습니다.");
      }
      const { error } = await getSupabaseAdmin().storage.from(BUCKET).upload(job.backup_path!, original, {
        contentType: job.mime_type ?? "application/octet-stream",
        upsert: true,
      });
      if (error && !isMissingObject(error)) {
        await persistCleanup(job, "retry", "backup_create_failed");
        throw storageFailure();
      }
      backup = await downloadIfPresent(job.backup_path!);
      if (!backup) {
        await persistCleanup(job, "retry", "backup_verify_failed");
        throw new BlogStorageError("compensation_failed", "삭제 전 이미지 백업을 확인하지 못했습니다.");
      }
    }
    job = await persistCleanup(job, "backup_ready");
  }

  if (job.status === "backup_ready") {
    try {
      await removeObject(job.storage_path);
      job = await persistCleanup(job, "object_removed");
    } catch {
      const original = await downloadIfPresent(job.storage_path);
      if (original) {
        await persistCleanup(job, "retry", "storage_remove_failed");
        throw storageFailure();
      }
      job = await persistCleanup(job, "object_removed", "remove_result_ambiguous");
    }
  }

  if (job.status === "object_removed") {
    try {
      await deleteBlogAssetMetadata(job.asset_id!);
    } catch (databaseError) {
      let stillExists = true;
      try { stillExists = Boolean(await getBlogAsset(job.asset_id!)); } catch { /* restore before reporting an ambiguous DB result */ }
      if (!stillExists) {
        job = await persistCleanup(job, "cleanup_pending", "metadata_delete_result_ambiguous");
        return completeDeleteJob(job);
      }
      try {
        await restoreOriginal(job);
        await persistCleanup(job, "retry", "metadata_delete_failed_restored");
      } catch {
        await persistCleanup(job, "restore_pending", "metadata_delete_and_restore_failed");
        throw new BlogStorageError("compensation_failed", "메타데이터 삭제와 이미지 복구가 모두 실패했습니다. 백업은 정리 작업에 보존했습니다.");
      }
      throw databaseError;
    }
    job = await persistCleanup(job, "cleanup_pending");
  }

  if (job.status === "cleanup_pending") await completeDeleteJob(job);
}

export async function uploadBlogImage(bytes: Uint8Array, declaredMime: string, originalName: string, altText?: string | null): Promise<BlogAsset> {
  const verified = await inspectBlogImage(bytes, declaredMime);
  await requirePrivateBucket();
  const fileName = safeFileName(originalName, verified.mimeType);
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext(verified.mimeType)}`;
  const client = getSupabaseAdmin();
  try {
    const uploaded = await client.storage.from(BUCKET).upload(storagePath, Buffer.from(bytes), { contentType: verified.mimeType, upsert: false });
    if (uploaded.error) throw storageFailure();
  } catch {
    throw storageFailure();
  }
  const input: CreateBlogAssetInput = { storage_path: storagePath, file_name: fileName, mime_type: verified.mimeType, size_bytes: bytes.byteLength, alt_text: altText ?? null };
  try {
    return await createBlogAsset(input, { width: verified.width, height: verified.height });
  } catch (databaseError) {
    try {
      await removeObject(storagePath);
    } catch {
      let cleanupRegistered = false;
      try {
        const job = await createBlogOrphanCleanup(storagePath);
        await persistCleanup(job, "pending", "metadata_insert_and_file_remove_failed");
        cleanupRegistered = true;
      } catch {
        console.error("blog_storage_orphan_untracked", { storagePath });
      }
      throw new BlogStorageError(
        "compensation_failed",
        cleanupRegistered
          ? "이미지 메타데이터 저장에 실패해 정리 작업을 등록했습니다."
          : "이미지 메타데이터 저장과 파일 정리에 실패했습니다. 정리 작업이 등록되지 않아 수동 확인이 필요합니다.",
      );
    }
    throw databaseError;
  }
}

export async function getBlogImageSignedUrl(asset: BlogAsset): Promise<string> {
  await requirePrivateBucket();
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw storageFailure();
  return data.signedUrl;
}

export async function listBlogImages(limit = 100, offset = 0): Promise<Array<{ asset: BlogAsset; signedUrl: string }>> {
  await requirePrivateBucket();
  const assets = await listBlogAssets(limit, offset);
  return Promise.all(assets.map(async (asset) => ({ asset, signedUrl: await getBlogImageSignedUrl(asset) })));
}

export async function deleteBlogImage(id: string): Promise<void> {
  await requirePrivateBucket();
  const asset = await getBlogAsset(id);
  let job = await getBlogStorageCleanupByAsset(id);
  if (!asset && !job) throw new DataError("not_found", "삭제할 이미지 또는 정리 기록을 찾을 수 없습니다.");
  if (job?.status === "completed") return;
  if (asset) {
    const backupPath = job?.backup_path ?? `_blog_cleanup/${randomUUID()}.backup`;
    job = await prepareBlogAssetCleanup(id, backupPath);
  }
  await processAssetDelete(job!, Boolean(asset));
}

export async function retryBlogStorageCleanup(id: string): Promise<void> {
  await requirePrivateBucket();
  const job = await getBlogStorageCleanupById(id);
  if (!job) throw new DataError("not_found", "이미지 정리 작업을 찾을 수 없습니다.");
  if (job.status === "completed") return;
  if (job.action === "delete_orphan") return removeOrphan(job);
  if (!job.asset_id) throw new BlogStorageError("storage", "이미지 정리 작업의 대상 정보가 올바르지 않습니다.");
  const asset = await getBlogAsset(job.asset_id);
  await processAssetDelete(job, Boolean(asset));
}

export async function listBlogImagesCleanup(limit = 100): Promise<Array<Pick<BlogStorageCleanup, "id" | "action" | "status" | "attempts" | "last_error_code" | "next_attempt_at" | "created_at">>> {
  const jobs = await listBlogStorageCleanup(limit);
  return jobs.map(({ id, action, status, attempts, last_error_code, next_attempt_at, created_at }) => ({ id, action, status, attempts, last_error_code, next_attempt_at, created_at }));
}

export function assertImageMime(value: string | null): asserts value is string {
  if (!value || !ALLOWED.has(value.split(";")[0].trim().toLowerCase())) throw new BlogValidationError("허용된 이미지 MIME 형식이 필요합니다.", "content-type");
}
