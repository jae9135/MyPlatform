/** Blog manager domain types and validation helpers shared by server code. */

export const BLOG_PLATFORM_CODES = ["naver", "tistory"] as const;
export type BlogPlatformCode = (typeof BLOG_PLATFORM_CODES)[number];

export const BLOG_POST_EDIT_STATUSES = ["draft", "ready", "archived"] as const;
export type BlogPostEditStatus = (typeof BLOG_POST_EDIT_STATUSES)[number];

export const BLOG_SCHEDULE_STATUSES = ["planned", "cancelled", "completed", "missed"] as const;
export type BlogScheduleStatus = (typeof BLOG_SCHEDULE_STATUSES)[number];

export const BLOG_PUBLISH_RESULTS = ["success", "failed"] as const;
export type BlogPublishResult = (typeof BLOG_PUBLISH_RESULTS)[number];

export const BLOG_METRIC_SOURCES = ["manual", "api", "import"] as const;
export type BlogMetricSource = (typeof BLOG_METRIC_SOURCES)[number];

export type BlogPlatform = {
  id: string;
  code: BlogPlatformCode;
  name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type BlogAccount = {
  id: string;
  platform_id: string;
  account_name: string;
  blog_url: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogTopic = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BlogCategory = {
  id: string;
  account_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BlogAsset = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  created_at: string;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  body_markdown: string;
  body_html: string;
  edit_status: BlogPostEditStatus;
  cover_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostTarget = {
  id: string;
  post_id: string;
  account_id: string;
  title_override: string | null;
  body_markdown_override: string | null;
  body_html_override: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogSchedule = {
  id: string;
  target_id: string;
  planned_at: string;
  status: BlogScheduleStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPublishHistory = {
  id: string;
  post_id: string | null;
  target_id: string | null;
  account_id: string | null;
  schedule_id: string | null;
  post_title_snapshot: string;
  platform_code_snapshot: BlogPlatformCode;
  account_name_snapshot: string;
  result: BlogPublishResult;
  published_at: string | null;
  external_url: string | null;
  note: string | null;
  created_at: string;
};

export type BlogMetric = {
  id: string;
  publish_history_id: string;
  measured_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  source: BlogMetricSource;
  created_at: string;
};

export type BlogPostTopic = { post_id: string; topic_id: string; created_at: string };
export type BlogPostTargetCategory = { target_id: string; category_id: string; account_id: string; created_at: string };
export type BlogPostAsset = {
  post_id: string;
  asset_id: string;
  role: "cover" | "inline";
  sort_order: number;
  created_at: string;
};

export type CreateBlogPostInput = Pick<
  BlogPost,
  "title" | "body_markdown" | "body_html"
> & {
  slug?: string | null;
  excerpt?: string | null;
  edit_status?: BlogPostEditStatus;
  cover_asset_id?: string | null;
};

export type UpdateBlogPostInput = Partial<CreateBlogPostInput>;

/** Payload accepted from the approved ChatGPT -> blog support import flow. */
export type BlogImportImageInput = {
  source_id: string;
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data_base64: string;
  alt_text?: string | null;
};

export type BlogImportPayload = {
  external_id?: string | null;
  title: string;
  excerpt?: string | null;
  body_markdown: string;
  body_html: string;
  images?: BlogImportImageInput[];
  platform?: BlogPlatformCode;
  category?: string | null;
  tags?: string[];
  status?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type BlogImportSourceType = "json" | "zip";
export type BlogImportStatus = "processing" | "completed" | "failed";
export type BlogImportRecord = {
  id: string;
  post_id: string | null;
  source_type: BlogImportSourceType;
  original_file_name: string | null;
  external_id: string | null;
  platform_code: BlogPlatformCode | null;
  account_id: string | null;
  checksum: string;
  dedupe_key: string;
  source_metadata: Record<string, unknown>;
  status: BlogImportStatus;
  attempt_count: number;
  auto_attempt_count: number;
  manual_attempt_count: number;
  manual_approval_by: string | null;
  manual_approval_at: string | null;
  manual_approval_reason: string | null;
  lease_token: string | null;
  error_code: string | null;
  lease_expires_at: string | null;
  next_retry_at: string | null;
  cleanup_status: "none" | "pending" | "completed" | "failed";
  cleanup_error_code: string | null;
  cleanup_attempts: number;
  cleanup_next_retry_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CreateBlogAccountInput = Pick<BlogAccount, "platform_id" | "account_name" | "blog_url"> & {
  active?: boolean;
  notes?: string | null;
};
export type UpdateBlogAccountInput = Partial<Omit<CreateBlogAccountInput, "platform_id">>;

export type CreateBlogTargetInput = Pick<BlogPostTarget, "post_id" | "account_id"> & {
  title_override?: string | null;
  body_markdown_override?: string | null;
  body_html_override?: string | null;
  notes?: string | null;
};
export type UpdateBlogTargetInput = Partial<Omit<CreateBlogTargetInput, "post_id" | "account_id">>;

export type CreateBlogScheduleInput = Pick<BlogSchedule, "target_id" | "planned_at"> & {
  note?: string | null;
};
export type UpdateBlogScheduleInput = {
  planned_at?: string;
  status?: Exclude<BlogScheduleStatus, "completed">;
  note?: string | null;
};

export function isBlogScheduleTransitionAllowed(current: BlogScheduleStatus, next: BlogScheduleStatus): boolean {
  return current === "planned"
    && (next === "planned" || next === "completed" || next === "cancelled" || next === "missed");
}

export type CreateBlogPublishHistoryInput = Pick<
  BlogPublishHistory,
  "result"
> & {
  target_id: string;
  schedule_id?: string | null;
  published_at?: string | null;
  external_url?: string | null;
  note?: string | null;
};

export type CreateBlogAssetInput = Pick<
  BlogAsset,
  "storage_path" | "file_name" | "mime_type" | "size_bytes"
> & {
  alt_text?: string | null;
};

export type BlogStorageCleanupStatus =
  | "pending" | "backup_ready" | "object_removed" | "restore_pending"
  | "retry" | "cleanup_pending" | "source_missing" | "completed";
export type BlogStorageCleanup = {
  id: string;
  asset_id: string | null;
  action: "delete_asset" | "delete_orphan";
  storage_path: string;
  backup_path: string | null;
  file_name: string | null;
  mime_type: BlogAsset["mime_type"] | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  status: BlogStorageCleanupStatus;
  attempts: number;
  last_error_code: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
export type BlogImportCleanup = {
  id: string;
  import_id: string;
  idempotency_key: string;
  target_type: "post" | "asset" | "import";
  target_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  lease_token: string | null;
  lease_expires_at: string | null;
  error_code: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
export type BlogPublishRecordResult = { history: BlogPublishHistory; replayed: boolean };

export type CreateBlogMetricInput = Pick<BlogMetric, "publish_history_id"> & {
  measured_at?: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  source?: BlogMetricSource;
};

export type CreateBlogTopicInput = { name: string; sort_order?: number; active?: boolean };
export type UpdateBlogTopicInput = Partial<CreateBlogTopicInput>;
export type CreateBlogCategoryInput = {
  account_id: string;
  parent_id?: string | null;
  name: string;
  sort_order?: number;
};
export type UpdateBlogCategoryInput = {
  parent_id?: string | null;
  name?: string;
  sort_order?: number;
};
export type UpdateBlogPlatformInput = { name?: string; enabled?: boolean };

export function validateUpdateBlogPlatform(input: unknown): UpdateBlogPlatformInput {
  const row = asObject(input);
  const result: UpdateBlogPlatformInput = {};
  if ("name" in row) result.name = text(row.name, "name", 80)!;
  if ("enabled" in row) result.enabled = booleanValue(row.enabled, "enabled")!;
  if (!Object.keys(result).length) throw new BlogValidationError("수정할 필드가 없습니다.");
  return result;
}

export class BlogValidationError extends Error {
  readonly code = "invalid_input";

  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "BlogValidationError";
  }
}

export class BlogStorageError extends Error {
  constructor(
    readonly code: "not_configured" | "not_found" | "conflict" | "invalid_file" | "storage" | "compensation_failed",
    message: string,
  ) {
    super(message);
    this.name = "BlogStorageError";
  }
}

export function isBlogPlatformCode(value: unknown): value is BlogPlatformCode {
  return typeof value === "string" && BLOG_PLATFORM_CODES.includes(value as BlogPlatformCode);
}

export function isBlogPostEditStatus(value: unknown): value is BlogPostEditStatus {
  return typeof value === "string" && BLOG_POST_EDIT_STATUSES.includes(value as BlogPostEditStatus);
}

export function isBlogScheduleStatus(value: unknown): value is BlogScheduleStatus {
  return typeof value === "string" && BLOG_SCHEDULE_STATUSES.includes(value as BlogScheduleStatus);
}

export function isBlogPublishResult(value: unknown): value is BlogPublishResult {
  return typeof value === "string" && BLOG_PUBLISH_RESULTS.includes(value as BlogPublishResult);
}

export function isBlogMetricSource(value: unknown): value is BlogMetricSource {
  return typeof value === "string" && BLOG_METRIC_SOURCES.includes(value as BlogMetricSource);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BlogValidationError("요청 본문은 객체여야 합니다.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string") throw new BlogValidationError("문자열 값이 필요합니다.", field);
  const normalized = value.trim();
  if (!normalized && !optional) throw new BlogValidationError("빈 문자열은 허용되지 않습니다.", field);
  if (normalized.length > max) throw new BlogValidationError(`최대 ${max}자까지 입력할 수 있습니다.`, field);
  return normalized;
}

function nullableText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = text(value, field, max, true) ?? "";
  return normalized || null;
}

function uuid(value: unknown, field: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (!isUuid(value)) throw new BlogValidationError("유효한 UUID가 필요합니다.", field);
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  field: string,
  optional = false,
): T | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new BlogValidationError("허용되지 않은 상태 값입니다.", field);
  }
  return value as T;
}

function booleanValue(value: unknown, field: string, optional = false): boolean | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "boolean") throw new BlogValidationError("불리언 값이 필요합니다.", field);
  return value;
}

function integer(value: unknown, field: string, optional = false, nullable = false): number | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new BlogValidationError("0 이상의 정수 값이 필요합니다.", field);
  }
  return value;
}

function timestamp(value: unknown, field: string, optional = false, nullable = false): string | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new BlogValidationError("유효한 날짜/시간 값이 필요합니다.", field);
  }
  return new Date(value).toISOString();
}

function httpUrl(value: unknown, field: string, optional = false, nullable = false): string | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== "string") throw new BlogValidationError("URL 문자열이 필요합니다.", field);
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    return url.toString();
  } catch {
    throw new BlogValidationError("HTTP 또는 HTTPS URL이 필요합니다.", field);
  }
}

export function validateCreateBlogPost(input: unknown): CreateBlogPostInput {
  const row = asObject(input);
  const status = enumValue(row.edit_status, BLOG_POST_EDIT_STATUSES, "edit_status", true);
  const cover = row.cover_asset_id === null ? null : uuid(row.cover_asset_id, "cover_asset_id", true);
  const bodyMarkdown = row.body_markdown;
  const bodyHtml = row.body_html;
  if (typeof bodyMarkdown !== "string" || bodyMarkdown.length > 200000) {
    throw new BlogValidationError("본문은 200,000자 이하여야 합니다.", "body_markdown");
  }
  if (typeof bodyHtml !== "string" || bodyHtml.length > 200000) {
    throw new BlogValidationError("HTML 본문은 200,000자 이하여야 합니다.", "body_html");
  }
  return {
    title: text(row.title, "title", 200)!,
    body_markdown: bodyMarkdown,
    body_html: bodyHtml,
    slug: nullableText(row.slug, "slug", 180),
    excerpt: nullableText(row.excerpt, "excerpt", 1000),
    edit_status: status,
    cover_asset_id: cover,
  };
}

export function validateBlogImportPayload(input: unknown): BlogImportPayload {
  const row = asObject(input);
  const imagesValue = row.images === undefined ? [] : row.images;
  if (!Array.isArray(imagesValue) || imagesValue.length > 40) {
    throw new BlogValidationError("이미지는 최대 40개까지 가져올 수 있습니다.", "images");
  }
  const images = imagesValue.map((value, index) => {
    const image = asObject(value);
    const mime = enumValue(image.mime_type, ["image/jpeg", "image/png", "image/webp", "image/gif"] as const, `images[${index}].mime_type`)!;
    if (typeof image.data_base64 !== "string" || image.data_base64.length < 16 || image.data_base64.length > 14_000_000) {
      throw new BlogValidationError("이미지 데이터가 올바르지 않거나 너무 큽니다.", `images[${index}].data_base64`);
    }
    const sourceId = text(image.source_id, `images[${index}].source_id`, 120)!;
    if (!/^[A-Za-z0-9._-]+$/.test(sourceId)) throw new BlogValidationError("이미지 source_id 형식이 올바르지 않습니다.", `images[${index}].source_id`);
    return {
      source_id: sourceId,
      file_name: text(image.file_name, `images[${index}].file_name`, 255)!,
      mime_type: mime,
      data_base64: image.data_base64,
      alt_text: nullableText(image.alt_text, `images[${index}].alt_text`, 1000),
    };
  });
  const sourceIds = new Set<string>();
  for (const image of images) {
    if (sourceIds.has(image.source_id)) throw new BlogValidationError("이미지 source_id가 중복됩니다.", "images");
    sourceIds.add(image.source_id);
  }
  const title = text(row.title, "title", 200)!;
  const bodyMarkdown = row.body_markdown;
  const bodyHtml = row.body_html;
  if (typeof bodyMarkdown !== "string" || bodyMarkdown.length > 200000) throw new BlogValidationError("본문은 200,000자 이하여야 합니다.", "body_markdown");
  if (typeof bodyHtml !== "string" || bodyHtml.length > 200000) throw new BlogValidationError("HTML 본문은 200,000자 이하여야 합니다.", "body_html");
  return {
    external_id: row.external_id === undefined || row.external_id === null ? undefined : text(row.external_id, "external_id", 120),
    title,
    excerpt: nullableText(row.excerpt, "excerpt", 1000),
    body_markdown: bodyMarkdown,
    body_html: bodyHtml,
    images,
    platform: row.platform === undefined ? undefined : enumValue(row.platform, BLOG_PLATFORM_CODES, "platform"),
    category: nullableText(row.category, "category", 120),
    tags: row.tags === undefined ? undefined : (Array.isArray(row.tags) && row.tags.every((tag) => typeof tag === "string" && tag.length <= 100) ? row.tags as string[] : (() => { throw new BlogValidationError("tags 형식이 올바르지 않습니다.", "tags"); })()),
    status: row.status === undefined ? undefined : nullableText(row.status, "status", 40),
    account_id: row.account_id === undefined ? undefined : (row.account_id === null ? null : uuid(row.account_id, "account_id")),
    category_id: row.category_id === undefined ? undefined : (row.category_id === null ? null : uuid(row.category_id, "category_id")),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : undefined,
  };
}

export function validateUpdateBlogPost(input: unknown): UpdateBlogPostInput {
  const row = asObject(input);
  const result: UpdateBlogPostInput = {};
  if ("title" in row) result.title = text(row.title, "title", 200)!;
  if ("body_markdown" in row) {
    if (typeof row.body_markdown !== "string" || row.body_markdown.length > 200000) throw new BlogValidationError("본문은 200,000자 이하여야 합니다.", "body_markdown");
    result.body_markdown = row.body_markdown;
  }
  if ("body_html" in row) {
    if (typeof row.body_html !== "string" || row.body_html.length > 200000) throw new BlogValidationError("HTML 본문은 200,000자 이하여야 합니다.", "body_html");
    result.body_html = row.body_html;
  }
  if ("slug" in row) result.slug = nullableText(row.slug, "slug", 180);
  if ("excerpt" in row) result.excerpt = nullableText(row.excerpt, "excerpt", 1000);
  if ("edit_status" in row) result.edit_status = enumValue(row.edit_status, BLOG_POST_EDIT_STATUSES, "edit_status");
  if ("cover_asset_id" in row) result.cover_asset_id = row.cover_asset_id === null ? null : uuid(row.cover_asset_id, "cover_asset_id");
  if (Object.keys(result).length === 0) throw new BlogValidationError("수정할 필드가 없습니다.");
  return result;
}

export function validateCreateBlogAccount(input: unknown): CreateBlogAccountInput {
  const row = asObject(input);
  return {
    platform_id: uuid(row.platform_id, "platform_id")!,
    account_name: text(row.account_name, "account_name", 120)!,
    blog_url: httpUrl(row.blog_url, "blog_url")!,
    active: booleanValue(row.active, "active", true),
    notes: nullableText(row.notes, "notes", 4000),
  };
}

export function validateUpdateBlogAccount(input: unknown): UpdateBlogAccountInput {
  const row = asObject(input);
  const result: UpdateBlogAccountInput = {};
  if ("account_name" in row) result.account_name = text(row.account_name, "account_name", 120)!;
  if ("blog_url" in row) result.blog_url = httpUrl(row.blog_url, "blog_url")!;
  if ("active" in row) result.active = booleanValue(row.active, "active")!;
  if ("notes" in row) result.notes = nullableText(row.notes, "notes", 4000);
  if (!Object.keys(result).length) throw new BlogValidationError("수정할 필드가 없습니다.");
  return result;
}

export function validateCreateBlogTarget(input: unknown): CreateBlogTargetInput {
  const row = asObject(input);
  return {
    post_id: uuid(row.post_id, "post_id")!,
    account_id: uuid(row.account_id, "account_id")!,
    title_override: nullableText(row.title_override, "title_override", 200),
    body_markdown_override: nullableText(row.body_markdown_override, "body_markdown_override", 200000),
    body_html_override: nullableText(row.body_html_override, "body_html_override", 200000),
    notes: nullableText(row.notes, "notes", 4000),
  };
}

export function validateUpdateBlogTarget(input: unknown): UpdateBlogTargetInput {
  const row = asObject(input);
  const result: UpdateBlogTargetInput = {};
  if ("title_override" in row) result.title_override = nullableText(row.title_override, "title_override", 200);
  if ("body_markdown_override" in row) result.body_markdown_override = nullableText(row.body_markdown_override, "body_markdown_override", 200000);
  if ("body_html_override" in row) result.body_html_override = nullableText(row.body_html_override, "body_html_override", 200000);
  if ("notes" in row) result.notes = nullableText(row.notes, "notes", 4000);
  if (!Object.keys(result).length) throw new BlogValidationError("수정할 필드가 없습니다.");
  return result;
}

export function validateCreateBlogSchedule(input: unknown): CreateBlogScheduleInput {
  const row = asObject(input);
  return {
    target_id: uuid(row.target_id, "target_id")!,
    planned_at: timestamp(row.planned_at, "planned_at")!,
    note: nullableText(row.note, "note", 4000),
  };
}

export function validateUpdateBlogSchedule(input: unknown): UpdateBlogScheduleInput {
  const row = asObject(input);
  const result: UpdateBlogScheduleInput = {};
  if ("planned_at" in row) result.planned_at = timestamp(row.planned_at, "planned_at")!;
  if ("status" in row) {
    if (row.status !== "planned" && row.status !== "cancelled" && row.status !== "missed") {
      throw new BlogValidationError("완료 상태는 게시 이력 기록으로만 설정할 수 있습니다.", "status");
    }
    result.status = row.status;
  }
  if ("note" in row) result.note = nullableText(row.note, "note", 4000);
  if (!Object.keys(result).length) throw new BlogValidationError("수정할 필드가 없습니다.");
  return result;
}

export function validateCreateBlogPublishHistory(input: unknown): CreateBlogPublishHistoryInput {
  const row = asObject(input);
  const result = enumValue(row.result, BLOG_PUBLISH_RESULTS, "result")!;
  const publishedAt = timestamp(row.published_at, "published_at", true, true);
  if (result === "success" && !publishedAt) {
    throw new BlogValidationError("성공 게시에는 게시 시각이 필요합니다.", "published_at");
  }
  return {
    target_id: uuid(row.target_id, "target_id")!,
    result,
    schedule_id: row.schedule_id === null ? null : uuid(row.schedule_id, "schedule_id", true),
    published_at: publishedAt,
    external_url: httpUrl(row.external_url, "external_url", true, true),
    note: nullableText(row.note, "note", 4000),
  };
}

export function validateCreateBlogAsset(input: unknown): CreateBlogAssetInput {
  const row = asObject(input);
  const mimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  const sizeBytes = integer(row.size_bytes, "size_bytes")!;
  if (sizeBytes < 1) throw new BlogValidationError("파일 크기는 1바이트 이상이어야 합니다.", "size_bytes");
  return {
    storage_path: text(row.storage_path, "storage_path", 1024)!,
    file_name: text(row.file_name, "file_name", 255)!,
    mime_type: enumValue(row.mime_type, mimeTypes, "mime_type")!,
    size_bytes: sizeBytes,
    alt_text: nullableText(row.alt_text, "alt_text", 1000),
  };
}

export function validateCreateBlogMetric(input: unknown): CreateBlogMetricInput {
  const row = asObject(input);
  return {
    publish_history_id: uuid(row.publish_history_id, "publish_history_id")!,
    measured_at: timestamp(row.measured_at, "measured_at", true) as string | undefined,
    views: integer(row.views, "views", true, true),
    likes: integer(row.likes, "likes", true, true),
    comments: integer(row.comments, "comments", true, true),
    source: enumValue(row.source, BLOG_METRIC_SOURCES, "source", true),
  };
}

export function validateCreateBlogTopic(input: unknown): CreateBlogTopicInput {
  const row = asObject(input);
  return {
    name: text(row.name, "name", 100)!,
    sort_order: integer(row.sort_order, "sort_order", true) as number | undefined,
    active: booleanValue(row.active, "active", true),
  };
}

export function validateUpdateBlogTopic(input: unknown): UpdateBlogTopicInput {
  const row = asObject(input);
  const result: UpdateBlogTopicInput = {};
  if ("name" in row) result.name = text(row.name, "name", 100)!;
  if ("sort_order" in row) result.sort_order = integer(row.sort_order, "sort_order")!;
  if ("active" in row) result.active = booleanValue(row.active, "active")!;
  if (!Object.keys(result).length) throw new BlogValidationError("수정할 필드가 없습니다.");
  return result;
}

export function validateCreateBlogCategory(input: unknown): CreateBlogCategoryInput {
  const row = asObject(input);
  return {
    account_id: uuid(row.account_id, "account_id")!,
    parent_id: row.parent_id === null ? null : uuid(row.parent_id, "parent_id", true),
    name: text(row.name, "name", 120)!,
    sort_order: integer(row.sort_order, "sort_order", true) as number | undefined,
  };
}

export function validateUpdateBlogCategory(input: unknown): UpdateBlogCategoryInput {
  const row = asObject(input);
  const result: UpdateBlogCategoryInput = {};
  if ("parent_id" in row) result.parent_id = row.parent_id === null ? null : uuid(row.parent_id, "parent_id")!;
  if ("name" in row) result.name = text(row.name, "name", 120)!;
  if ("sort_order" in row) result.sort_order = integer(row.sort_order, "sort_order")!;
  if (!Object.keys(result).length) throw new BlogValidationError("수정할 필드가 없습니다.");
  return result;
}
