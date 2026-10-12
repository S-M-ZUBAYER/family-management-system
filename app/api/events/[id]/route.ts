import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageEvents, getActiveFamilyMembership } from "@/lib/family-access";
import { collectPaginatedRows } from "@/lib/paginated-rows";
import { supabaseRest } from "@/lib/supabase-rest";
import { eventObject, eventUuid, eventRecord, eventStatusByAction, EventValidationError } from "@/lib/event-validation";
import { eventWrite, eventWriteResponse, eventCapturedMediaKeys } from "@/lib/event-write-outcome";
import { eventErrorResponse, eventWriteConfirmedRejected, type FamilyEventRow } from "../route";
type Context = { params: Promise<{ id: string }> };
type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
function scopedQuery(id: string, family: string, existing?: FamilyEventRow) {
  return new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${family}`,
    ...(existing ? { updated_at: `eq.${existing.updated_at}`, status: `eq.${existing.status}` } : {}) });
}
async function audit(family: string, actor: string, id: string, action: string, metadata: Record<string, unknown> = {}) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: family, actor_user_id: actor, action, entity_type: "family_event", entity_id: id, metadata }) });
}
export async function PATCH(request: Request, context: Context) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageEvents(membership.role)) return Response.json({ error: "Event পরিচালনার permission নেই।" }, { status: 403 });
    const { id } = await context.params;
    if (!eventUuid(id)) throw new EventValidationError("EVENT_INVALID_ID");
    const body: unknown = await request.json().catch(() => { throw new EventValidationError("EVENT_INVALID_BODY"); });
    if (!eventObject(body)) throw new EventValidationError("EVENT_INVALID_BODY");
    if (typeof body.action !== "string" || !(body.action === "edit" || Object.hasOwn(eventStatusByAction, body.action))) throw new EventValidationError("EVENT_INVALID_ACTION");
    const [existing] = await supabaseRest<FamilyEventRow[]>(`family_events?${scopedQuery(id, membership.family_id)}&limit=1`);
    if (!existing) return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    const changes = body.action === "edit" ? eventRecord(body.data, true) : { status: eventStatusByAction[body.action] };
    const result = await eventWrite({ expectedId: id, confirmedRejected: eventWriteConfirmedRejected,
      write: () => supabaseRest<FamilyEventRow[]>(`family_events?${scopedQuery(id, membership.family_id, existing)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() }) }),
      audit: savedId => audit(membership.family_id, user.userId, savedId, body.action === "edit" ? "family_event_updated" : `family_event_${body.action}`),
    });
    return eventWriteResponse(result);
  } catch (error) { return eventErrorResponse(error, "Unable to update event"); }
}
export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageEvents(membership.role)) return Response.json({ error: "Event delete করার permission নেই।" }, { status: 403 });
    const { id } = await context.params;
    if (!eventUuid(id)) throw new EventValidationError("EVENT_INVALID_ID");
    const [existing] = await supabaseRest<FamilyEventRow[]>(`family_events?${scopedQuery(id, membership.family_id)}&limit=1`);
    if (!existing) return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    const media = await collectPaginatedRows((offset, limit) => supabaseRest<Array<{ storage_key: string }>>(`event_media?${new URLSearchParams({ select: "storage_key", event_id: `eq.${id}`, family_id: `eq.${membership.family_id}`, order: "id.asc", offset: String(offset), limit: String(limit) })}`), { pageSize: 500, maxRows: 20000 });
    const keys = eventCapturedMediaKeys(media, membership.family_id, existing.id), bucket = (env as RuntimeEnv).BUCKET;
    if (keys.length && !bucket) throw new EventValidationError("EVENT_DELETE_UNAVAILABLE");
    const failedKeys: string[] = [];
    const result = await eventWrite({ expectedId: id, deletion: true, confirmedRejected: eventWriteConfirmedRejected,
      write: () => supabaseRest<Array<{ id: string }>>(`family_events?${scopedQuery(id, membership.family_id, existing)}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
      cleanup: async () => {
        for (let offset = 0; offset < keys.length; offset += 500) {
          const batch = keys.slice(offset, offset + 500);
          try { await bucket!.delete(batch); } catch { failedKeys.push(...batch); }
        }
        if (failedKeys.length) throw new Error("EVENT_MEDIA_CLEANUP_PENDING");
      },
      audit: savedId => audit(membership.family_id, user.userId, savedId, "family_event_deleted", { title: existing.title_bn, media_count: media.length, cleanup_pending: failedKeys.length > 0, ...(failedKeys.length ? { storage_keys: failedKeys } : {}) }),
    });
    return eventWriteResponse(result);
  } catch (error) { return eventErrorResponse(error, "Unable to delete event"); }
}
