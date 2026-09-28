import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageMagazine, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { magazineErrorResponse } from "../../magazine/route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

async function record(id: string, familyId: string) {
  const query = new URLSearchParams({ select: "id,article_id,storage_key,file_name,mime_type,uploaded_by_user_id", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" });
  return (await supabaseRest<Array<{ id: string; article_id: string; storage_key: string; file_name: string; mime_type: string; uploaded_by_user_id: string }>>(`magazine_media?${query}`))[0] ?? null;
}
async function article(id: string, familyId: string) {
  const query = new URLSearchParams({ select: "id,status,visibility,author_user_id", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" });
  return (await supabaseRest<Array<{ id: string; status: string; visibility: string; author_user_id: string }>>(`family_magazine_articles?${query}`))[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Family access প্রয়োজন।" }, { status: 403 });
    const media = await record((await context.params).id, membership.family_id); if (!media) return Response.json({ error: "Media পাওয়া যায়নি।" }, { status: 404 });
    const item = await article(media.article_id, membership.family_id), canManage = canManageMagazine(membership.role);
    if (!item || (!(item.status === "published" && item.visibility === "family") && item.author_user_id !== user.userId && !canManage) || (item.visibility === "admins" && !canManage && item.author_user_id !== user.userId)) return Response.json({ error: "Media access নেই।" }, { status: 403 });
    const object = await (env as RuntimeEnv).BUCKET?.get(media.storage_key); if (!object) return Response.json({ error: "Media file পাওয়া যায়নি।" }, { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": media.mime_type, "Content-Length": String(object.size), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.file_name)}`, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return magazineErrorResponse(error, "Unable to read magazine media"); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Family access প্রয়োজন।" }, { status: 403 });
    const id = (await context.params).id, media = await record(id, membership.family_id); if (!media) return Response.json({ error: "Media পাওয়া যায়নি।" }, { status: 404 });
    const item = await article(media.article_id, membership.family_id), canManage = canManageMagazine(membership.role);
    if (!item || (!canManage && (item.author_user_id !== user.userId || item.status === "published"))) return Response.json({ error: "Media delete করার অনুমতি নেই।" }, { status: 403 });
    await supabaseRest(`magazine_media?${new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await (env as RuntimeEnv).BUCKET?.delete(media.storage_key);
    await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "magazine_media_deleted", entity_type: "magazine_media", entity_id: id, metadata: { articleId: media.article_id } }) });
    return Response.json({ success: true, message: "Cover image delete হয়েছে।" });
  } catch (error) { return magazineErrorResponse(error, "Unable to delete magazine media"); }
}
