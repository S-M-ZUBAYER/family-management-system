import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageMagazine, getActiveFamilyMembership } from "@/lib/family-access";
import type { MagazineMedia, MagazinePayload } from "@/lib/magazine-types";
import { projectMagazineRows, type MagazineArticleRow, type MagazineCommentRow, type MagazineReactionRow } from "@/lib/magazine-projection";
import { PaginatedRowLimitError } from "@/lib/paginated-rows";
import { readAllSupabaseRows } from "@/lib/supabase-pagination";
import { MagazineValidationError, magazineErrorCopy } from "@/lib/magazine-validation";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type ArticleRow = MagazineArticleRow;
type CommentRow = MagazineCommentRow;
type MediaRow = MagazineMedia;
type ReactionRow = MagazineReactionRow;

export function magazineErrorResponse(error: unknown, label: string) {
  if (error instanceof MagazineValidationError) return Response.json({ code: error.code, error: magazineErrorCopy(error.code, "en") }, { status: error.code === "MAGAZINE_ADMIN_ONLY" ? 403 : error.code === "MAGAZINE_RECORD_CHANGED" ? 409 : 400 });
  if (error instanceof PaginatedRowLimitError) return Response.json({ code: "MAGAZINE_ROW_LIMIT", maxRows: error.maxRows, error: `Magazine history exceeds ${error.maxRows} rows in one section. No partial data was shown or exported; contact support for a paged export.` }, { status: 413 });
  if (error instanceof BackendNotConfiguredError) return Response.json({ code: "MAGAZINE_NOT_CONFIGURED", error: magazineErrorCopy("MAGAZINE_NOT_CONFIGURED", "en") }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(label, error.status, error.message); return Response.json({ code: "MAGAZINE_BACKEND_UNAVAILABLE", error: magazineErrorCopy("MAGAZINE_BACKEND_UNAVAILABLE", "en") }, { status: 502 }); }
  console.error(label, error); return Response.json({ code: "MAGAZINE_REQUEST_FAILED", error: magazineErrorCopy("MAGAZINE_REQUEST_FAILED", "en") }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" }, { status: 409 });
    const canManage = canManageMagazine(membership.role);
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${new URLSearchParams({ select: "id,name_bn,name_en", id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    let articleRows: ArticleRow[] = [], commentRows: CommentRow[] = [], mediaRows: MediaRow[] = [], reactionRows: ReactionRow[] = [];
    let migrationRequired = false;
    try {
      const familyId = `eq.${membership.family_id}`;
      [articleRows, commentRows, mediaRows, reactionRows] = await Promise.all([
        readAllSupabaseRows<ArticleRow>("family_magazine_articles", new URLSearchParams({ select: "id,title,summary,content,category,tags,visibility,status,featured,published_at,author_user_id,author_name,created_at,updated_at", family_id: familyId, order: "featured.desc,published_at.desc.nullslast,created_at.desc,id.asc" })),
        readAllSupabaseRows<CommentRow>("magazine_article_comments", new URLSearchParams({ select: "id,article_id,body,author_user_id,author_name,status,created_at", family_id: familyId, order: "created_at.asc,id.asc" })),
        readAllSupabaseRows<MediaRow>("magazine_media", new URLSearchParams({ select: "id,article_id,media_type,file_name,mime_type,file_size,created_at", family_id: familyId, order: "created_at.desc,id.asc" })),
        readAllSupabaseRows<ReactionRow>("magazine_article_reactions", new URLSearchParams({ select: "article_id,user_id", family_id: familyId, order: "id.asc" })),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true;
      else throw error;
    }
    const projected = projectMagazineRows({ articles: articleRows, comments: commentRows, media: mediaRows, reactions: reactionRows }, user.userId, canManage);
    const payload: MagazinePayload = {
      family,
      viewer: { displayName: user.displayName, role: membership.role },
      articles: projected.articles,
      comments: projected.comments,
      media: projected.media,
      permissions: { canManage },
      migrationRequired,
    };
    return Response.json(payload);
  } catch (error) {
    return magazineErrorResponse(error, "Unable to load family magazine");
  }
}
