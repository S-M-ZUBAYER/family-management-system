import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageMagazine, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { magazineErrorResponse } from "../route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const actions = ["create_article", "set_status", "toggle_like", "add_comment", "moderate_comment"] as const;
type Action = (typeof actions)[number];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const bool = (value: unknown) => value === true || value === "true";
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T) { const candidate = text(value, 40); return candidate && values.includes(candidate as T) ? candidate as T : fallback; }
function tags(value: unknown) { return typeof value === "string" ? [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 60)))].slice(0, 12) : []; }

export async function POST(request: Request) {
  try {
    const context = await getContext(); if (context instanceof Response) return context;
    const body = await request.json() as { action?: Action; data?: Record<string, unknown> };
    if (!body.action || !actions.includes(body.action)) return Response.json({ error: "Valid magazine action প্রয়োজন।" }, { status: 400 });
    const data = body.data ?? {};
    if (body.action === "create_article") return createArticle(data, context);
    if (body.action === "set_status") return setStatus(data, context);
    if (body.action === "toggle_like") return toggleLike(data, context);
    if (body.action === "add_comment") return addComment(data, context);
    return moderateComment(data, context);
  } catch (error) { return magazineErrorResponse(error, "Unable to save magazine record"); }
}

export async function PATCH(request: Request) {
  try {
    const context = await getContext(); if (context instanceof Response) return context;
    const body = await request.json() as { articleId?: string; data?: Record<string, unknown> };
    if (!body.articleId || !uuid.test(body.articleId)) return Response.json({ error: "Valid article প্রয়োজন।" }, { status: 400 });
    const article = await getArticle(body.articleId, context.familyId);
    if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
    if (!context.canManage && article.author_user_id !== context.userId) return Response.json({ error: "এই article edit করার অনুমতি নেই।" }, { status: 403 });
    if (!context.canManage && article.status === "published") return Response.json({ error: "Published article পরিবর্তনের জন্য Admin review প্রয়োজন।" }, { status: 409 });
    const parsed = articleFields(body.data ?? {}, context.canManage);
    if (parsed instanceof Response) return parsed;
    await supabaseRest(`family_magazine_articles?${new URLSearchParams({ id: `eq.${body.articleId}`, family_id: `eq.${context.familyId}` })}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...parsed, updated_at: new Date().toISOString() }) });
    await audit(context, "magazine_article_updated", "family_magazine_articles", body.articleId);
    return Response.json({ success: true });
  } catch (error) { return magazineErrorResponse(error, "Unable to update magazine article"); }
}

export async function DELETE(request: Request) {
  try {
    const context = await getContext(); if (context instanceof Response) return context;
    const body = await request.json() as { kind?: "article" | "comment"; recordId?: string };
    if (!body.kind || !body.recordId || !uuid.test(body.recordId)) return Response.json({ error: "Valid record প্রয়োজন।" }, { status: 400 });
    if (body.kind === "comment") {
      const query = new URLSearchParams({ select: "id,author_user_id", id: `eq.${body.recordId}`, family_id: `eq.${context.familyId}`, limit: "1" });
      const comment = (await supabaseRest<Array<{ id: string; author_user_id: string }>>(`magazine_article_comments?${query}`))[0];
      if (!comment) return Response.json({ error: "Comment পাওয়া যায়নি।" }, { status: 404 });
      if (!context.canManage && comment.author_user_id !== context.userId) return Response.json({ error: "Comment delete করার অনুমতি নেই।" }, { status: 403 });
      await supabaseRest(`magazine_article_comments?${new URLSearchParams({ id: `eq.${body.recordId}`, family_id: `eq.${context.familyId}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await audit(context, "magazine_comment_deleted", "magazine_article_comments", body.recordId);
      return Response.json({ success: true, message: "Comment delete হয়েছে।" });
    }
    const article = await getArticle(body.recordId, context.familyId);
    if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
    if (!context.canManage && article.author_user_id !== context.userId) return Response.json({ error: "Article delete করার অনুমতি নেই।" }, { status: 403 });
    if (article.status === "published") return Response.json({ error: "Published article আগে archive করুন।" }, { status: 409 });
    const media = await supabaseRest<Array<{ storage_key: string }>>(`magazine_media?${new URLSearchParams({ select: "storage_key", family_id: `eq.${context.familyId}`, article_id: `eq.${body.recordId}` })}`);
    await supabaseRest(`family_magazine_articles?${new URLSearchParams({ id: `eq.${body.recordId}`, family_id: `eq.${context.familyId}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (media.length && (env as RuntimeEnv).BUCKET) await Promise.all(media.map((item) => (env as RuntimeEnv).BUCKET!.delete(item.storage_key).catch(() => undefined)));
    await audit(context, "magazine_article_deleted", "family_magazine_articles", body.recordId, { previousStatus: article.status });
    return Response.json({ success: true, message: "Article permanently delete হয়েছে।" });
  } catch (error) { return magazineErrorResponse(error, "Unable to delete magazine record"); }
}

type Context = { familyId: string; userId: string; displayName: string; canManage: boolean };
async function getContext(): Promise<Context | Response> {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
  return { familyId: membership.family_id, userId: user.userId, displayName: user.displayName, canManage: canManageMagazine(membership.role) };
}
function articleFields(data: Record<string, unknown>, canManage: boolean) {
  const title = text(data.title, 180), content = text(data.content, 30000);
  if (!title || !content || content.length < 20) return Response.json({ error: "Title এবং কমপক্ষে ২০ অক্ষরের article প্রয়োজন।" }, { status: 400 });
  return { title, summary: text(data.summary, 500), content, category: choice(data.category, ["story", "achievement", "recipe", "history", "announcement", "obituary", "other"] as const, "story"), tags: tags(data.tags), visibility: canManage ? choice(data.visibility, ["family", "admins"] as const, "family") : "family" };
}
async function createArticle(data: Record<string, unknown>, context: Context) {
  const parsed = articleFields(data, context.canManage); if (parsed instanceof Response) return parsed;
  const publishNow = context.canManage && bool(data.publishNow), saveDraft = bool(data.saveDraft);
  const status = publishNow ? "published" : saveDraft ? "draft" : "pending";
  const [created] = await supabaseRest<Array<{ id: string }>>("family_magazine_articles", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: context.familyId, ...parsed, status, featured: false, published_at: publishNow ? new Date().toISOString() : null, author_user_id: context.userId, author_name: context.displayName }) });
  await audit(context, "magazine_article_created", "family_magazine_articles", created.id, { status });
  return Response.json({ id: created.id, status }, { status: 201 });
}
async function setStatus(data: Record<string, unknown>, context: Context) {
  const articleId = text(data.articleId, 80), status = choice(data.status, ["draft", "pending", "published", "archived"] as const, "pending");
  if (!articleId || !uuid.test(articleId)) return Response.json({ error: "Valid article প্রয়োজন।" }, { status: 400 });
  const article = await getArticle(articleId, context.familyId); if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
  if (!context.canManage) {
    if (article.author_user_id !== context.userId || !["draft", "pending"].includes(String(article.status)) || !["draft", "pending", "archived"].includes(status)) return Response.json({ error: "এই status পরিবর্তনের অনুমতি নেই।" }, { status: 403 });
  }
  const changes: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "published") changes.published_at = new Date().toISOString();
  if (status === "archived") changes.featured = false;
  if (Object.hasOwn(data, "featured")) {
    if (!context.canManage) return Response.json({ error: "শুধু Admin featured article নির্ধারণ করবেন।" }, { status: 403 });
    changes.featured = bool(data.featured) && status === "published";
  }
  await supabaseRest(`family_magazine_articles?${new URLSearchParams({ id: `eq.${articleId}`, family_id: `eq.${context.familyId}` })}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(changes) });
  await audit(context, `magazine_article_${status}`, "family_magazine_articles", articleId, { featured: changes.featured });
  return Response.json({ success: true, status });
}
async function toggleLike(data: Record<string, unknown>, context: Context) {
  const articleId = text(data.articleId, 80); if (!articleId || !uuid.test(articleId)) return Response.json({ error: "Valid article প্রয়োজন।" }, { status: 400 });
  const article = await getArticle(articleId, context.familyId); if (!article || article.status !== "published" || (article.visibility === "admins" && !context.canManage)) return Response.json({ error: "Published article পাওয়া যায়নি।" }, { status: 404 });
  const filter = new URLSearchParams({ select: "id", family_id: `eq.${context.familyId}`, article_id: `eq.${articleId}`, user_id: `eq.${context.userId}`, reaction_key: "eq.like", limit: "1" });
  const existing = (await supabaseRest<Array<{ id: string }>>(`magazine_article_reactions?${filter}`))[0];
  if (existing) await supabaseRest(`magazine_article_reactions?${new URLSearchParams({ id: `eq.${existing.id}`, family_id: `eq.${context.familyId}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  else await supabaseRest("magazine_article_reactions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: context.familyId, article_id: articleId, user_id: context.userId, reaction_key: "like" }) });
  return Response.json({ success: true, reacted: !existing });
}
async function addComment(data: Record<string, unknown>, context: Context) {
  const articleId = text(data.articleId, 80), body = text(data.body, 2000); if (!articleId || !uuid.test(articleId) || !body) return Response.json({ error: "Article এবং comment প্রয়োজন।" }, { status: 400 });
  const article = await getArticle(articleId, context.familyId); if (!article || article.status !== "published" || (article.visibility === "admins" && !context.canManage)) return Response.json({ error: "Published article পাওয়া যায়নি।" }, { status: 404 });
  const [created] = await supabaseRest<Array<{ id: string }>>("magazine_article_comments", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: context.familyId, article_id: articleId, body, author_user_id: context.userId, author_name: context.displayName, status: "visible" }) });
  await audit(context, "magazine_comment_added", "magazine_article_comments", created.id, { articleId });
  return Response.json({ id: created.id }, { status: 201 });
}
async function moderateComment(data: Record<string, unknown>, context: Context) {
  if (!context.canManage) return Response.json({ error: "Family Admin comment moderate করবেন।" }, { status: 403 });
  const commentId = text(data.commentId, 80), status = choice(data.status, ["visible", "hidden"] as const, "hidden"); if (!commentId || !uuid.test(commentId)) return Response.json({ error: "Valid comment প্রয়োজন।" }, { status: 400 });
  await supabaseRest(`magazine_article_comments?${new URLSearchParams({ id: `eq.${commentId}`, family_id: `eq.${context.familyId}` })}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
  await audit(context, `magazine_comment_${status}`, "magazine_article_comments", commentId);
  return Response.json({ success: true });
}
async function getArticle(id: string, familyId: string) { return (await supabaseRest<Array<Record<string, unknown>>>(`family_magazine_articles?${new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" })}`))[0] ?? null; }
async function audit(context: Context, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) { await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: context.familyId, actor_user_id: context.userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "magazine", ...metadata } }) }); }
