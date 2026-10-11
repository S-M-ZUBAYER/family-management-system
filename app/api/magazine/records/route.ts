import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageMagazine, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest, SupabaseRequestError, BackendNotConfiguredError } from "@/lib/supabase-rest";
import { magazineRecordWrite, magazineRecordResponse, MagazineRecordOutcomeUnknownError } from "@/lib/magazine-record-write";
import { readAllSupabaseRows } from "@/lib/supabase-pagination";
import { magazineErrorResponse } from "../route";
import { MagazineValidationError, magazineObject, magazineText, magazineUuid, magazineChoice, magazineArticleFields, magazineCreateStatus, magazineStatusChanges } from "@/lib/magazine-validation";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const actions = ["create_article", "set_status", "toggle_like", "add_comment", "moderate_comment"] as const;
async function requestObject(request: Request) {
  return magazineObject(await request.json().catch(() => { throw new MagazineValidationError("MAGAZINE_INVALID_BODY"); }));
}
function conditionalQuery(id: string, familyId: string, existing: Record<string, unknown>) {
  return new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${familyId}`, status: `eq.${existing.status}`, updated_at: `eq.${existing.updated_at}` });
}
async function writeExisting(table: string, id: string, context: Context, existing: Record<string, unknown>, method: "PATCH" | "DELETE", changes?: Record<string, unknown>) {
  const rows = await supabaseRest<Array<{ id: string }>>(`${table}?${conditionalQuery(id, context.familyId, existing)}`, { method, headers: { Prefer: "return=representation" }, ...(changes ? { body: JSON.stringify(changes) } : {}) });
  return rows;
}
const confirmedRejected = (error: unknown) => error instanceof MagazineValidationError || error instanceof BackendNotConfiguredError
  || (error instanceof SupabaseRequestError && error.status >= 400 && error.status < 500 && error.status !== 408);
function recordError(error: unknown, fallback: string) {
  if (error instanceof MagazineRecordOutcomeUnknownError) return Response.json({ code: "MAGAZINE_WRITE_OUTCOME_UNKNOWN", outcomeUnknown: true }, { status: 503 });
  return magazineErrorResponse(error, fallback);
}

export async function POST(request: Request) {
  try {
    const context = await getContext(); if (context instanceof Response) return context;
    const body = await requestObject(request);
    const action = magazineChoice(body.action, actions);
    const data = magazineObject(body.data);
    if (action === "create_article") return await createArticle(data, context);
    if (action === "set_status") return await setStatus(data, context);
    if (action === "toggle_like") return await toggleLike(data, context);
    if (action === "add_comment") return await addComment(data, context);
    return await moderateComment(data, context);
  } catch (error) { return recordError(error, "Unable to save magazine record"); }
}

export async function PATCH(request: Request) {
  try {
    const context = await getContext(); if (context instanceof Response) return context;
    const body = await requestObject(request), articleId = magazineUuid(body.articleId);
    const data = magazineObject(body.data);
    const article = await getArticle(articleId, context.familyId);
    if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
    if (!context.canManage && article.author_user_id !== context.userId) return Response.json({ error: "এই article edit করার অনুমতি নেই।" }, { status: 403 });
    if (!context.canManage && article.status === "published") return Response.json({ error: "Published article পরিবর্তনের জন্য Admin review প্রয়োজন।" }, { status: 409 });
    const parsed = magazineArticleFields(data, context.canManage);
    const result = await magazineRecordWrite({ expectedId: articleId, confirmedRejected,
      write: () => writeExisting("family_magazine_articles", articleId, context, article, "PATCH", { ...parsed, updated_at: new Date().toISOString() }),
      audit: () => audit(context, "magazine_article_updated", "family_magazine_articles", articleId) });
    return magazineRecordResponse(result);
  } catch (error) { return recordError(error, "Unable to update magazine article"); }
}

export async function DELETE(request: Request) {
  try {
    const context = await getContext(); if (context instanceof Response) return context;
    const body = await requestObject(request), kind = magazineChoice(body.kind, ["article", "comment"] as const), recordId = magazineUuid(body.recordId);
    if (kind === "comment") {
      const comment = await getComment(recordId, context.familyId);
      if (!comment) return Response.json({ error: "Comment পাওয়া যায়নি।" }, { status: 404 });
      if (!context.canManage && comment.author_user_id !== context.userId) return Response.json({ error: "Comment delete করার অনুমতি নেই।" }, { status: 403 });
      const result = await magazineRecordWrite({ expectedId: recordId, confirmedRejected,
        write: () => writeExisting("magazine_article_comments", recordId, context, comment, "DELETE"),
        audit: () => audit(context, "magazine_comment_deleted", "magazine_article_comments", recordId) });
      return magazineRecordResponse(result);
    }
    const article = await getArticle(recordId, context.familyId);
    if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
    if (!context.canManage && article.author_user_id !== context.userId) return Response.json({ error: "Article delete করার অনুমতি নেই।" }, { status: 403 });
    if (article.status === "published") return Response.json({ error: "Published article আগে archive করুন।" }, { status: 409 });
    const media = await readAllSupabaseRows<{ storage_key: string }>("magazine_media", new URLSearchParams({ select: "storage_key", family_id: `eq.${context.familyId}`, article_id: `eq.${recordId}`, order: "id.asc" }));
    const result = await magazineRecordWrite({ expectedId: recordId, confirmedRejected,
      write: () => writeExisting("family_magazine_articles", recordId, context, article, "DELETE"),
      cleanup: async () => { if (!media.length) return; const bucket = (env as RuntimeEnv).BUCKET;
        if (!bucket) throw new Error("Magazine storage unavailable for captured cleanup.");
        await Promise.all(media.map((item) => bucket.delete(item.storage_key))); },
      audit: () => audit(context, "magazine_article_deleted", "family_magazine_articles", recordId, { previousStatus: article.status }) });
    return magazineRecordResponse(result);
  } catch (error) { return recordError(error, "Unable to delete magazine record"); }
}

type Context = { familyId: string; userId: string; displayName: string; canManage: boolean };
async function getContext(): Promise<Context | Response> {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
  return { familyId: membership.family_id, userId: user.userId, displayName: user.displayName, canManage: canManageMagazine(membership.role) };
}
async function createArticle(data: Record<string, unknown>, context: Context) {
  const parsed = magazineArticleFields(data, context.canManage), status = magazineCreateStatus(data, context.canManage);
  const result = await magazineRecordWrite({ confirmedRejected,
    write: () => supabaseRest<Array<{ id: string }>>("family_magazine_articles", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: context.familyId, ...parsed, status, featured: false, published_at: status === "published" ? new Date().toISOString() : null, author_user_id: context.userId, author_name: context.displayName }) }),
    audit: id => audit(context, "magazine_article_created", "family_magazine_articles", id, { status }) });
  return magazineRecordResponse(result, { status }, 201);
}
async function setStatus(data: Record<string, unknown>, context: Context) {
  const articleId = magazineUuid(data.articleId), changes = magazineStatusChanges(data, new Date().toISOString(), context.canManage), status = changes.status;
  const article = await getArticle(articleId, context.familyId); if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
  if (!context.canManage) {
    if (article.author_user_id !== context.userId || !["draft", "pending"].includes(String(article.status)) || !["draft", "pending", "archived"].includes(status)) return Response.json({ error: "এই status পরিবর্তনের অনুমতি নেই।" }, { status: 403 });
  }
  const result = await magazineRecordWrite({ expectedId: articleId, confirmedRejected,
    write: () => writeExisting("family_magazine_articles", articleId, context, article, "PATCH", changes),
    audit: () => audit(context, `magazine_article_${status}`, "family_magazine_articles", articleId, { featured: changes.featured }) });
  return magazineRecordResponse(result, { status });
}
async function toggleLike(data: Record<string, unknown>, context: Context) {
  const articleId = magazineUuid(data.articleId);
  const article = await getArticle(articleId, context.familyId); if (!article || article.status !== "published" || (article.visibility === "admins" && !context.canManage)) return Response.json({ error: "Published article পাওয়া যায়নি।" }, { status: 404 });
  const filter = new URLSearchParams({ select: "id", family_id: `eq.${context.familyId}`, article_id: `eq.${articleId}`, user_id: `eq.${context.userId}`, reaction_key: "eq.like", limit: "1" });
  const existing = (await supabaseRest<Array<{ id: string }>>(`magazine_article_reactions?${filter}`))[0];
  const result = await magazineRecordWrite({ expectedId: existing?.id, confirmedRejected,
    write: () => existing
      ? supabaseRest<Array<{ id: string }>>(`magazine_article_reactions?${new URLSearchParams({ id: `eq.${existing.id}`, family_id: `eq.${context.familyId}`, article_id: `eq.${articleId}`, user_id: `eq.${context.userId}`, reaction_key: "eq.like" })}`, { method: "DELETE", headers: { Prefer: "return=representation" } })
      : supabaseRest<Array<{ id: string }>>("magazine_article_reactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: context.familyId, article_id: articleId, user_id: context.userId, reaction_key: "like" }) }),
    audit: () => audit(context, existing ? "magazine_article_unliked" : "magazine_article_liked", "family_magazine_articles", articleId) });
  return magazineRecordResponse({ ...result, id: articleId }, { reacted: !existing });
}
async function addComment(data: Record<string, unknown>, context: Context) {
  const articleId = magazineUuid(data.articleId), body = magazineText(data.body, 2000, 1);
  const article = await getArticle(articleId, context.familyId); if (!article || article.status !== "published" || (article.visibility === "admins" && !context.canManage)) return Response.json({ error: "Published article পাওয়া যায়নি।" }, { status: 404 });
  const result = await magazineRecordWrite({ confirmedRejected,
    write: () => supabaseRest<Array<{ id: string }>>("magazine_article_comments", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: context.familyId, article_id: articleId, body, author_user_id: context.userId, author_name: context.displayName, status: "visible" }) }),
    audit: id => audit(context, "magazine_comment_added", "magazine_article_comments", id, { articleId }) });
  return magazineRecordResponse(result, {}, 201);
}
async function moderateComment(data: Record<string, unknown>, context: Context) {
  if (!context.canManage) return Response.json({ error: "Family Admin comment moderate করবেন।" }, { status: 403 });
  const commentId = magazineUuid(data.commentId), status = magazineChoice(data.status, ["visible", "hidden"] as const);
  const comment = await getComment(commentId, context.familyId);
  if (!comment) return Response.json({ error: "Comment পাওয়া যায়নি।" }, { status: 404 });
  const result = await magazineRecordWrite({ expectedId: commentId, confirmedRejected,
    write: () => writeExisting("magazine_article_comments", commentId, context, comment, "PATCH", { status, updated_at: new Date().toISOString() }),
    audit: () => audit(context, `magazine_comment_${status}`, "magazine_article_comments", commentId) });
  return magazineRecordResponse(result);
}
async function getArticle(id: string, familyId: string) { return (await supabaseRest<Array<Record<string, unknown>>>(`family_magazine_articles?${new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" })}`))[0] ?? null; }
async function getComment(id: string, familyId: string) { return (await supabaseRest<Array<Record<string, unknown>>>(`magazine_article_comments?${new URLSearchParams({ select: "id,author_user_id,status,updated_at", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" })}`))[0] ?? null; }
async function audit(context: Context, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) { await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: context.familyId, actor_user_id: context.userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "magazine", ...metadata } }) }); }
