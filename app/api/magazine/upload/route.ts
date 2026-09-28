import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageMagazine, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { magazineErrorResponse } from "../route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageMagazine(membership.role), bucket = (env as RuntimeEnv).BUCKET; if (!bucket) return Response.json({ error: "Magazine storage configured নয়।" }, { status: 503 });
    const form = await request.formData(), file = form.get("file"), articleId = form.get("articleId");
    if (!(file instanceof File) || typeof articleId !== "string" || !uuid.test(articleId)) return Response.json({ error: "Valid article ও image প্রয়োজন।" }, { status: 400 });
    if (!allowed.has(file.type) || !file.size || file.size > 10 * 1024 * 1024) return Response.json({ error: "JPG, PNG, WebP বা GIF image দিন; সর্বোচ্চ ১০ MB।" }, { status: 400 });
    const query = new URLSearchParams({ select: "id,status,author_user_id", id: `eq.${articleId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const article = (await supabaseRest<Array<{ id: string; status: string; author_user_id: string }>>(`family_magazine_articles?${query}`))[0];
    if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
    if (!canManage && (article.author_user_id !== user.userId || article.status === "published")) return Response.json({ error: "এই article image পরিবর্তনের অনুমতি নেই।" }, { status: 403 });
    const extension = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase() : "img";
    uploadedKey = `families/${membership.family_id}/magazine/${articleId}/${crypto.randomUUID()}.${extension || "img"}`;
    await bucket.put(uploadedKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name.slice(0, 180), uploaderId: user.userId } });
    const [created] = await supabaseRest<Array<{ id: string }>>("magazine_media", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, article_id: articleId, media_type: "cover", storage_key: uploadedKey, file_name: file.name.slice(0, 220), mime_type: file.type, file_size: file.size, uploaded_by_user_id: user.userId }) });
    uploadedKey = null;
    const oldQuery = new URLSearchParams({ select: "id,storage_key", family_id: `eq.${membership.family_id}`, article_id: `eq.${articleId}`, media_type: "eq.cover", id: `neq.${created.id}` });
    const oldMedia = await supabaseRest<Array<{ id: string; storage_key: string }>>(`magazine_media?${oldQuery}`);
    if (oldMedia.length) {
      await supabaseRest(`magazine_media?${new URLSearchParams({ family_id: `eq.${membership.family_id}`, article_id: `eq.${articleId}`, media_type: "eq.cover", id: `neq.${created.id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await Promise.all(oldMedia.map((item) => bucket.delete(item.storage_key).catch(() => undefined)));
    }
    await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "magazine_cover_uploaded", entity_type: "family_magazine_articles", entity_id: articleId, metadata: { mediaId: created.id } }) });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await (env as RuntimeEnv).BUCKET?.delete(uploadedKey).catch(() => undefined);
    return magazineErrorResponse(error, "Unable to upload magazine image");
  }
}
