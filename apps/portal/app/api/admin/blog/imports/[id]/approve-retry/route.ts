import { blogError, blogJson, readJsonObject, requireBlogAdminPrincipal } from "@/lib/adminBlogApi";
import { approveBlogImportRetry } from "@/lib/blog";
import { BlogValidationError, isUuid } from "@/lib/blogShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { id: string } }) {
  const identity = await requireBlogAdminPrincipal(request, true);
  if (identity instanceof Response) return identity;
  try {
    if (!isUuid(context.params.id)) throw new BlogValidationError("유효한 import UUID가 필요합니다.", "id");
    const body = await readJsonObject(request);
    if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1000) throw new BlogValidationError("승인 사유가 필요합니다.", "reason");
    const record = await approveBlogImportRetry(context.params.id, identity.principal, body.reason);
    // Explicit public DTO: never return lease tokens, approval principal hashes, or source metadata.
    return blogJson({
      id: record.id,
      status: record.status,
      manual_attempt_count: record.manual_attempt_count,
      manual_approval_at: record.manual_approval_at,
      manual_approval_reason: record.manual_approval_reason,
      updated_at: record.updated_at,
    });
  } catch (error) { return blogError(error); }
}
