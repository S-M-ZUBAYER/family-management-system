export type MagazineArticleStatus = "draft" | "pending" | "published" | "archived";
export type MagazineCategory = "story" | "achievement" | "recipe" | "history" | "announcement" | "obituary" | "other";

export type MagazineArticle = {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  category: MagazineCategory;
  tags: string[];
  visibility: "family" | "admins";
  status: MagazineArticleStatus;
  featured: boolean;
  published_at: string | null;
  author_user_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  reaction_count: number;
  comment_count: number;
  reacted_by_me: boolean;
  is_mine: boolean;
};

export type MagazineComment = {
  id: string;
  article_id: string;
  body: string;
  author_user_id: string;
  author_name: string;
  status: "visible" | "hidden";
  created_at: string;
  is_mine: boolean;
};

export type MagazineMedia = {
  id: string;
  article_id: string;
  media_type: "cover" | "image" | "video" | "document";
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

export type MagazinePayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  articles?: MagazineArticle[];
  comments?: MagazineComment[];
  media?: MagazineMedia[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
