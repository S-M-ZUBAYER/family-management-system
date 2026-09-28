import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageMagazine, getActiveFamilyMembership } from "@/lib/family-access";
import type { MagazineArticle, MagazineComment, MagazineMedia, MagazinePayload } from "@/lib/magazine-types";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type ArticleRow = Omit<MagazineArticle, "reaction_count" | "comment_count" | "reacted_by_me" | "is_mine">;
type CommentRow = Omit<MagazineComment, "is_mine">;
type MediaRow = MagazineMedia & { storage_key: string; uploaded_by_user_id: string };
type ReactionRow = { id: string; article_id: string; user_id: string };

export function magazineErrorResponse(error: unknown, label: string) {
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection configured নয়।" }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(label, error.status, error.message); return Response.json({ error: "Magazine data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 }); }
  console.error(label, error); return Response.json({ error: "Magazine request সম্পন্ন হয়নি।" }, { status: 500 });
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
        supabaseRest<ArticleRow[]>(`family_magazine_articles?${new URLSearchParams({ select: "id,title,summary,content,category,tags,visibility,status,featured,published_at,author_user_id,author_name,created_at,updated_at", family_id: familyId, order: "featured.desc,published_at.desc.nullslast,created_at.desc" })}`),
        supabaseRest<CommentRow[]>(`magazine_article_comments?${new URLSearchParams({ select: "id,article_id,body,author_user_id,author_name,status,created_at", family_id: familyId, order: "created_at.asc" })}`),
        supabaseRest<MediaRow[]>(`magazine_media?${new URLSearchParams({ select: "id,article_id,media_type,file_name,mime_type,file_size,storage_key,uploaded_by_user_id,created_at", family_id: familyId, order: "created_at.desc" })}`),
        supabaseRest<ReactionRow[]>(`magazine_article_reactions?${new URLSearchParams({ select: "id,article_id,user_id", family_id: familyId })}`),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError) migrationRequired = true;
      else throw error;
    }
    const visible = articleRows.filter((item) => item.author_user_id === user.userId || canManage || (item.status === "published" && item.visibility === "family"));
    const articleIds = new Set(visible.map((item) => item.id));
    const comments = commentRows.filter((item) => articleIds.has(item.article_id) && (item.status === "visible" || canManage || item.author_user_id === user.userId));
    const media = mediaRows.filter((item) => articleIds.has(item.article_id));
    const reactions = reactionRows.filter((item) => articleIds.has(item.article_id));
    const payload: MagazinePayload = {
      family,
      viewer: { displayName: user.displayName, role: membership.role },
      articles: visible.map((item) => ({ ...item, reaction_count: reactions.filter((reaction) => reaction.article_id === item.id).length, comment_count: comments.filter((comment) => comment.article_id === item.id && comment.status === "visible").length, reacted_by_me: reactions.some((reaction) => reaction.article_id === item.id && reaction.user_id === user.userId), is_mine: item.author_user_id === user.userId })),
      comments: comments.map((item) => ({ ...item, is_mine: item.author_user_id === user.userId })),
      media: media.map((item) => ({ id: item.id, article_id: item.article_id, media_type: item.media_type, file_name: item.file_name, mime_type: item.mime_type, file_size: item.file_size, created_at: item.created_at })),
      permissions: { canManage },
      migrationRequired,
    };
    return Response.json(payload);
  } catch (error) {
    return magazineErrorResponse(error, "Unable to load family magazine");
  }
}
