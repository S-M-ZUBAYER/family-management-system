import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { eventUuid, EventValidationError, eventErrorCopy } from "@/lib/event-validation";
import { eventCommentVisible } from "@/lib/event-participation";
import { validateEventMedia, eventMediaCaption, eventMediaUploadWrite, eventMediaResponse, EventMediaPrewriteError, eventMediaPrewriteResponse } from "@/lib/event-media-workflow";
import { eventErrorResponse, eventWriteConfirmedRejected, type FamilyEventRow } from "../../route";
type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership required." }, { status: 403 });
    const { id } = await context.params;
    if (!eventUuid(id)) throw new EventValidationError("EVENT_INVALID_ID");
    const eventQuery = new URLSearchParams({ select: "id,status", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const [event] = await supabaseRest<Array<Pick<FamilyEventRow, "id" | "status">>>(`family_events?${eventQuery}`);
    if (!eventCommentVisible(event)) return Response.json({ error: "Event not found." }, { status: 404 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ code: "EVENT_MEDIA_STORAGE_UNAVAILABLE", error: eventErrorCopy("EVENT_MEDIA_STORAGE_UNAVAILABLE", "en") }, { status: 503 });
    const form = await request.formData().catch(() => { throw new EventValidationError("EVENT_MEDIA_INVALID_FILE"); });
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1 || form.getAll("caption").length > 1) throw new EventValidationError("EVENT_MEDIA_INVALID_FILE");
    const metadata = await validateEventMedia(file), caption = eventMediaCaption(form.get("caption"));
    const key = `families/${membership.family_id}/events/${event.id}/${crypto.randomUUID()}.${metadata.extension}`;
    const result = await eventMediaUploadWrite({
      familyId: membership.family_id, eventId: event.id, actorId: user.userId, key, file: metadata, caption, confirmedRejected: eventWriteConfirmedRejected,
      put: () => bucket.put(key, file.stream(), { httpMetadata: { contentType: metadata.type }, customMetadata: { originalName: metadata.name, uploaderId: user.userId } }),
      create: () => supabaseRest("event_media", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        family_id: membership.family_id, event_id: event.id, storage_key: key, file_name: metadata.name, mime_type: metadata.type,
        file_size: metadata.size, caption, uploaded_by_user_id: user.userId, uploader_name: user.displayName.trim().slice(0, 180) || "Family member",
      }) }),
      discard: () => bucket.delete(key),
      audit: savedId => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        family_id: membership.family_id, actor_user_id: user.userId, action: "event_media_uploaded", entity_type: "event_media", entity_id: savedId,
        metadata: { event_id: event.id, mime_type: metadata.type, file_size: metadata.size },
      }) }),
    });
    return eventMediaResponse(result);
  } catch (error) {
    if (error instanceof EventMediaPrewriteError) return eventMediaPrewriteResponse(error);
    return eventErrorResponse(error, "Unable to save event media");
  }
}
