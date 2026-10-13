import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canViewEventMedia, canDeleteEventMedia } from "@/lib/event-media-access";
import { canManageEvents, getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
import { eventUuid, EventValidationError, eventErrorCopy } from "@/lib/event-validation";
import { eventCapturedMediaKeys } from "@/lib/event-write-outcome";
import { eventMediaMetadata, eventMediaDeleteWrite, eventMediaResponse } from "@/lib/event-media-workflow";
import { eventErrorResponse, eventWriteConfirmedRejected } from "@/app/api/events/route";
type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
type StoredMedia = { id: string; event_id: string; family_id: string; storage_key: string; uploaded_by_user_id: string; mime_type: string; file_name: string; file_size: number };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return new Response("Sign in is required.", { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return new Response("Family membership required.", { status: 403 });
    const { id } = await context.params;
    if (!eventUuid(id)) return new Response("Invalid media ID.", { status: 400 });
    const query = new URLSearchParams({ select: "id,event_id,family_id,storage_key,mime_type,file_name,file_size", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const [media] = await supabaseRest<StoredMedia[]>(`event_media?${query}`);
    if (!media || !eventUuid(media.id) || media.id.toLowerCase() !== id.toLowerCase() || !eventUuid(media.event_id) || media.family_id !== membership.family_id) return new Response("Media not found.", { status: 404 });
    eventCapturedMediaKeys([media], membership.family_id, media.event_id);
    eventMediaMetadata({ name: media.file_name, type: media.mime_type, size: media.file_size });
    const eventQuery = new URLSearchParams({ select: "status", id: `eq.${media.event_id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const [event] = await supabaseRest<Array<{ status: string }>>(`family_events?${eventQuery}`);
    if (!canViewEventMedia(event?.status ?? null, canManageEvents(membership.role))) return new Response("Media not found.", { status: 404 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return new Response("Media storage unavailable.", { status: 503 });
    const object = await bucket.get(media.storage_key);
    if (!object) return new Response("Media not found.", { status: 404 });
    return new Response(object.body, { headers: {
      "Content-Type": media.mime_type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.file_name)}`,
      "Cache-Control": "private, no-store", ETag: object.httpEtag, "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof EventValidationError) return new Response("Invalid scoped media metadata.", { status: 409 });
    if (error instanceof BackendNotConfiguredError) return new Response("Backend unavailable.", { status: 503 });
    if (error instanceof SupabaseRequestError) console.error("Unable to load event media", error.status);
    else console.error("Unable to load event media");
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
    if (!eventUuid(id)) throw new EventValidationError("EVENT_INVALID_ID");
    const query = new URLSearchParams({ select: "id,event_id,family_id,storage_key,uploaded_by_user_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const [media] = await supabaseRest<StoredMedia[]>(`event_media?${query}`);
    if (!media) return Response.json({ error: "Media not found." }, { status: 404 });
    if (!canDeleteEventMedia(media.uploaded_by_user_id, user.userId, canManageEvents(membership.role))) return Response.json({ code: "EVENT_MEDIA_DELETE_FORBIDDEN", error: eventErrorCopy("EVENT_MEDIA_DELETE_FORBIDDEN", "en") }, { status: 403 });
    if (!eventUuid(media.event_id) || media.family_id !== membership.family_id || !eventUuid(media.id) || media.id.toLowerCase() !== id.toLowerCase() || typeof media.uploaded_by_user_id !== "string") throw new EventValidationError("EVENT_DELETE_UNAVAILABLE");
    eventCapturedMediaKeys([media], membership.family_id, media.event_id);
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ code: "EVENT_MEDIA_STORAGE_UNAVAILABLE", error: eventErrorCopy("EVENT_MEDIA_STORAGE_UNAVAILABLE", "en") }, { status: 503 });
    const deleteQuery = new URLSearchParams({ select: "id,event_id,family_id,storage_key", id: `eq.${media.id}`, family_id: `eq.${membership.family_id}`,
      event_id: `eq.${media.event_id}`, storage_key: `eq.${media.storage_key}`, uploaded_by_user_id: `eq.${media.uploaded_by_user_id}` });
    const result = await eventMediaDeleteWrite({
      id: media.id, familyId: membership.family_id, eventId: media.event_id, key: media.storage_key, confirmedRejected: eventWriteConfirmedRejected,
      write: () => supabaseRest(`event_media?${deleteQuery}`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
      cleanup: () => bucket.delete(media.storage_key),
      audit: cleanupPending => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        family_id: membership.family_id, actor_user_id: user.userId, action: "event_media_deleted", entity_type: "event_media", entity_id: media.id,
        metadata: { event_id: media.event_id, cleanup_pending: cleanupPending, ...(cleanupPending ? { storage_key: media.storage_key } : {}) },
      }) }),
    });
    return eventMediaResponse(result);
  } catch (error) { return eventErrorResponse(error, "Unable to delete event media"); }
}
