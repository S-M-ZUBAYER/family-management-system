import type { MagazineArticle, MagazineComment, MagazineMedia } from "./magazine-types.ts";

// Account identity is server-only. Clients use is_mine, never an account ID.
export type MagazineArticleRow = Omit<MagazineArticle, "reaction_count" | "comment_count" | "reacted_by_me" | "is_mine"> & { author_user_id: string };
export type MagazineCommentRow = Omit<MagazineComment, "is_mine"> & { author_user_id: string };
export type MagazineReactionRow = { article_id: string; user_id: string };

export function projectMagazineRows(
  rows: { articles: readonly MagazineArticleRow[]; comments: readonly MagazineCommentRow[]; media: readonly MagazineMedia[]; reactions: readonly MagazineReactionRow[] },
  viewerId: string,
  canManage: boolean,
): { articles: MagazineArticle[]; comments: MagazineComment[]; media: MagazineMedia[] } {
  // Preserve existing author/admin/published-family visibility; projecting a
  // child is never authority to include its inaccessible parent.
  const visible = rows.articles.filter(row => row.author_user_id === viewerId || canManage || (row.status === "published" && row.visibility === "family"));
  const articleIds = new Set(visible.map(row => row.id));
  const comments = rows.comments.filter(row => articleIds.has(row.article_id) && (row.status === "visible" || canManage || row.author_user_id === viewerId));
  const counts = new Map<string, { reactions: number; comments: number; reacted: boolean }>();
  for (const id of articleIds) counts.set(id, { reactions: 0, comments: 0, reacted: false });
  for (const reaction of rows.reactions) {
    const count = counts.get(reaction.article_id);
    if (count) { count.reactions++; if (reaction.user_id === viewerId) count.reacted = true; }
  }
  for (const comment of comments) if (comment.status === "visible") counts.get(comment.article_id)!.comments++;
  return {
    articles: visible.map(row => {
      const count = counts.get(row.id)!;
      return { id: row.id, title: row.title, summary: row.summary, content: row.content, category: row.category,
        tags: [...row.tags], visibility: row.visibility, status: row.status, featured: row.featured,
        published_at: row.published_at, author_name: row.author_name, created_at: row.created_at, updated_at: row.updated_at,
        reaction_count: count.reactions, comment_count: count.comments, reacted_by_me: count.reacted, is_mine: row.author_user_id === viewerId };
    }),
    comments: comments.map(row => ({ id: row.id, article_id: row.article_id, body: row.body, author_name: row.author_name,
      status: row.status, created_at: row.created_at, is_mine: row.author_user_id === viewerId })),
    media: rows.media.filter(row => articleIds.has(row.article_id)).map(row => ({ id: row.id, article_id: row.article_id,
      media_type: row.media_type, file_name: row.file_name, mime_type: row.mime_type, file_size: row.file_size, created_at: row.created_at })),
  };
}
