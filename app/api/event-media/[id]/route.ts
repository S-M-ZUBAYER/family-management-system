import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageEvents, getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return new Response("Sign in is required.", { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return new Response("Family membership required.", { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return new Response("Media storage unavailable.", { status: 503 });
    const { id } = await context.params;
    const query = new URLSearchParams({
      select: "storage_key,mime_type,file_name",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const media = (await supabaseRest<Array<{ storage_key: string; mime_type: string; file_name: string }>>(`event_media?${query}`))[0];
    if (!media) return new Response("Media not found.", { status: 404 });
    const object = await bucket.get(media.storage_key);
    if (!object) return new Response("Media not found.", { status: 404 });
    const headers = new Headers({
      "Content-Type": media.mime_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.file_name)}`,
      "Cache-Control": "private, max-age=3600",
      ETag: object.httpEtag,
    });
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 });
    if (error instanceof SupabaseRequestError) console.error("Unable to load event media", error.status, error.message);
    else console.error("Unable to load event media", error);
    return new Response("Media unavailable.", { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Family membership required." }, { status: 403 });
    const { id } = await context.params;
    const media = (await supabaseRest<Array<{ id: string; storage_key: string; uploaded_by_user_id: string }>>(`event_media?${new URLSearchParams({ select: "id,storage_key,uploaded_by_user_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!media) return Response.json({ error: "Media পাওয়া যায়নি।" }, { status: 404 });
    if (!canManageEvents(membership.role) && media.uploaded_by_user_id !== user.userId) return Response.json({ error: "Media delete করার permission নেই।" }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ error: "Media storage unavailable." }, { status: 503 });
    await bucket.delete(media.storage_key);
    await supabaseRest(`event_media?${new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "event_media_deleted", entity_type: "event_media", entity_id: id, metadata: {} }) });
    return Response.json({ message: "Event media delete হয়েছে।" });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend unavailable." }, { status: 503 });
    if (error instanceof SupabaseRequestError) console.error("Unable to delete event media", error.status, error.message);
    else console.error("Unable to delete event media", error);
    return Response.json({ error: "Media delete হয়নি।" }, { status: 500 });
  }
}
