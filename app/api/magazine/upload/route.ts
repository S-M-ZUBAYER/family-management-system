import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageMagazine, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { SupabaseRequestError } from "@/lib/supabase-rest";
import { readAllSupabaseRows } from "@/lib/supabase-pagination";
import { MagazineValidationError, magazineUuid } from "@/lib/magazine-validation";
import { validateMagazineCover } from "@/lib/magazine-cover-policy";
import { MagazineCoverOutcomeUnknownError, magazineCoverWrite } from "@/lib/magazine-cover-write";
import { magazineErrorResponse } from "../route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageMagazine(membership.role), bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ code: "MAGAZINE_STORAGE_UNAVAILABLE", error: "Magazine storage is unavailable." }, { status: 503 });
    const form = await request.formData().catch(() => { throw new MagazineValidationError("MAGAZINE_INVALID_BODY"); });
    const file = form.get("file"), articleId = magazineUuid(form.get("articleId"));
    if (!(file instanceof File)) throw new MagazineValidationError("MAGAZINE_INVALID_COVER");
    const metadata = await validateMagazineCover(file);
    const query = new URLSearchParams({ select: "id,status,author_user_id", id: `eq.${articleId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const article = (await supabaseRest<Array<{ id: string; status: string; author_user_id: string }>>(`family_magazine_articles?${query}`))[0];
    if (!article) return Response.json({ error: "Article পাওয়া যায়নি।" }, { status: 404 });
    if (!canManage && (article.author_user_id !== user.userId || article.status === "published")) return Response.json({ error: "এই article image পরিবর্তনের অনুমতি নেই।" }, { status: 403 });
    const prefix = `families/${membership.family_id}/magazine/${articleId}/`;
    // Capture exact old IDs before insertion. Never remove a concurrent cover
    // with a broad "all except this new ID" mutation.
    const oldMedia = await readAllSupabaseRows<{ id: string; storage_key: string }>("magazine_media", new URLSearchParams({ select: "id,storage_key", family_id: `eq.${membership.family_id}`, article_id: `eq.${articleId}`, media_type: "eq.cover", order: "id.asc" }));
    for (const old of oldMedia) { magazineUuid(old.id); if (typeof old.storage_key !== "string" || !old.storage_key.startsWith(prefix)) throw new Error("Invalid prior magazine cover reference."); }
    const uploadedKey = `${prefix}${crypto.randomUUID()}.${metadata.extension}`;
    const result = await magazineCoverWrite({
      put: () => bucket.put(uploadedKey, file.stream(), { httpMetadata: { contentType: metadata.type }, customMetadata: { originalName: metadata.name, uploaderId: user.userId } }),
      create: () => supabaseRest<Array<{ id: string }>>("magazine_media", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, article_id: articleId, media_type: "cover", storage_key: uploadedKey, file_name: metadata.name, mime_type: metadata.type, file_size: metadata.size, uploaded_by_user_id: user.userId }) }),
      valid: rows => Array.isArray(rows) && rows.length === 1 && Boolean(rows[0]?.id) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rows[0].id),
      discardUnlinked: () => bucket.delete(uploadedKey),
      confirmedRejected: error => error instanceof SupabaseRequestError && error.status >= 400 && error.status < 500,
      cleanupOld: async () => {
        for (let offset = 0; offset < oldMedia.length; offset += 100) {
          const batch = oldMedia.slice(offset, offset + 100), expected = new Set(batch.map(item => item.id));
          const removed = await supabaseRest<Array<{ id: string }>>(`magazine_media?${new URLSearchParams({ family_id: `eq.${membership.family_id}`, article_id: `eq.${articleId}`, media_type: "eq.cover", id: `in.(${batch.map(item => item.id).join(",")})` })}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
          if (!Array.isArray(removed) || removed.length !== expected.size || new Set(removed.map(item => item.id)).size !== expected.size || removed.some(item => !expected.has(item.id))) throw new Error("Prior magazine cover deletion needs reconciliation.");
          await Promise.all(batch.map(item => bucket.delete(item.storage_key)));
        }
      },
      audit: rows => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "magazine_cover_uploaded", entity_type: "family_magazine_articles", entity_id: articleId, metadata: { mediaId: rows[0].id } }) }),
    });
    return Response.json({ id: result.value[0].id, cleanupPending: result.cleanupPending, auditPending: result.auditPending }, { status: result.cleanupPending || result.auditPending ? 202 : 201 });
  } catch (error) {
    if (error instanceof MagazineCoverOutcomeUnknownError) return Response.json({ code: "MAGAZINE_COVER_OUTCOME_UNKNOWN", outcomeUnknown: true, error: "Cover outcome needs verification. Do not upload again before checking the library." }, { status: 503 });
    return magazineErrorResponse(error, "Unable to upload magazine image");
  }
}
