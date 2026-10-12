import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { eventUuid, EventValidationError } from "@/lib/event-validation";
import { eventRsvpRecord, eventRsvpOpen, eventParticipationWrite, eventParticipationResponse } from "@/lib/event-participation";
import { eventErrorResponse, eventWriteConfirmedRejected, type FamilyEventRow } from "../../route";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const { id } = await context.params;
    if (!eventUuid(id)) throw new EventValidationError("EVENT_INVALID_ID");
    const record = eventRsvpRecord(await request.json().catch(() => { throw new EventValidationError("EVENT_INVALID_BODY"); }));
    const eventQuery = new URLSearchParams({ select: "id,status,registration_deadline", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const [event] = await supabaseRest<Array<Pick<FamilyEventRow, "id" | "status" | "registration_deadline">>>(`family_events?${eventQuery}`);
    if (!eventRsvpOpen(event)) throw new EventValidationError("EVENT_REGISTRATION_CLOSED");
    const query = new URLSearchParams({ on_conflict: "event_id,auth_user_id" });
    const result = await eventParticipationWrite({ kind: "rsvp", familyId: membership.family_id, eventId: event.id, actorId: user.userId, confirmedRejected: eventWriteConfirmedRejected,
      write: () => supabaseRest(`event_rsvps?${query}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({
        family_id: membership.family_id, event_id: event.id, auth_user_id: user.userId, respondent_name: user.displayName.trim().slice(0, 180) || "Family member", ...record, updated_at: new Date().toISOString(),
      }) }),
      audit: savedId => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        family_id: membership.family_id, actor_user_id: user.userId, action: "event_rsvp_saved", entity_type: "event_rsvp", entity_id: savedId,
        metadata: { event_id: event.id, response: record.response, guest_count: record.guest_count },
      }) }),
    });
    return eventParticipationResponse(result);
  } catch (error) { return eventErrorResponse(error, "Unable to save RSVP"); }
}
