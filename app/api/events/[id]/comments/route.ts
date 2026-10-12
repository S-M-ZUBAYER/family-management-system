import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { eventUuid, EventValidationError } from "@/lib/event-validation";
import { eventCommentRecord, eventCommentVisible, eventParticipationWrite, eventParticipationResponse } from "@/lib/event-participation";
import { eventErrorResponse, eventWriteConfirmedRejected, type FamilyEventRow } from "../../route";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const { id } = await context.params;
    if (!eventUuid(id)) throw new EventValidationError("EVENT_INVALID_ID");
    const record = eventCommentRecord(await request.json().catch(() => { throw new EventValidationError("EVENT_INVALID_BODY"); }));
    const eventQuery = new URLSearchParams({ select: "id,status", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const [event] = await supabaseRest<Array<Pick<FamilyEventRow, "id" | "status">>>(`family_events?${eventQuery}`);
    if (!eventCommentVisible(event)) return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    const result = await eventParticipationWrite({ kind: "comment", familyId: membership.family_id, eventId: event.id, actorId: user.userId, confirmedRejected: eventWriteConfirmedRejected,
      write: () => supabaseRest("event_comments", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        family_id: membership.family_id, event_id: event.id, auth_user_id: user.userId, author_name: user.displayName.trim().slice(0, 180) || "Family member", ...record,
      }) }),
      audit: savedId => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        family_id: membership.family_id, actor_user_id: user.userId, action: "event_comment_created", entity_type: "event_comment", entity_id: savedId, metadata: { event_id: event.id },
      }) }),
    });
    return eventParticipationResponse(result);
  } catch (error) { return eventErrorResponse(error, "Unable to save event comment"); }
}
