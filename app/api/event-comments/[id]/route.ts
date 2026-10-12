import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership, canManageEvents } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { eventObject, eventUuid, EventValidationError, eventErrorCopy } from "@/lib/event-validation";
import { eventCommentPublicRow } from "@/lib/event-participation";
import { eventCommentChangeRecord, eventCommentMayChange, eventCommentFilterText, eventCommentChangeWrite, eventCommentChangeResponse, type CommentMethod } from "@/lib/event-comment-management";
import { eventErrorResponse, eventWriteConfirmedRejected } from "../../events/route";
async function changeComment(request: Request, context: { params: Promise<{ id: string }> }, method: CommentMethod) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ code: "EVENT_SIGN_IN_REQUIRED", error: eventErrorCopy("EVENT_SIGN_IN_REQUIRED", "en") }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ code: "EVENT_ACCESS_DENIED", error: eventErrorCopy("EVENT_ACCESS_DENIED", "en") }, { status: 403 });
    const { id } = await context.params; if (!eventUuid(id)) throw new EventValidationError("EVENT_INVALID_ID");
    const record = eventCommentChangeRecord(method, await request.json().catch(() => { throw new EventValidationError("EVENT_INVALID_BODY"); }));
    const query = new URLSearchParams({ select: "id,family_id,event_id,auth_user_id,author_name,body,created_at", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const rows = await supabaseRest<unknown>(`event_comments?${query}`);
    if (!Array.isArray(rows) || rows.length > 1) throw new EventValidationError("EVENT_INVALID_SNAPSHOT");
    if (!rows.length) return Response.json({ code: "EVENT_COMMENT_NOT_FOUND", error: eventErrorCopy("EVENT_COMMENT_NOT_FOUND", "en") }, { status: 404 });
    const row = rows[0];
    if (!eventObject(row) || !eventCommentPublicRow(row) || row.id !== id.toLowerCase() || row.family_id !== membership.family_id || typeof row.auth_user_id !== "string" || !row.auth_user_id) throw new EventValidationError("EVENT_INVALID_SNAPSHOT");
    const parentQuery = new URLSearchParams({ select: "id,status", id: `eq.${row.event_id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const [parent] = await supabaseRest<Array<{ id: string; status: string }>>(`family_events?${parentQuery}`);
    if (!parent) return Response.json({ code: "EVENT_COMMENT_NOT_FOUND", error: eventErrorCopy("EVENT_COMMENT_NOT_FOUND", "en") }, { status: 404 });
    const canManage = canManageEvents(membership.role);
    if (!eventCommentMayChange(method, row, parent, user.userId, canManage)) return Response.json({ code: "EVENT_COMMENT_FORBIDDEN", error: eventErrorCopy("EVENT_COMMENT_FORBIDDEN", "en") }, { status: 403 });
    if (row.body !== record.expectedBody) throw new EventValidationError("EVENT_COMMENT_CHANGED");
    const target = new URLSearchParams({ id: `eq.${row.id}`, family_id: `eq.${membership.family_id}`, event_id: `eq.${row.event_id}`, auth_user_id: eventCommentFilterText(row.auth_user_id), created_at: `eq.${row.created_at}`, body: eventCommentFilterText(record.expectedBody) });
    const result = await eventCommentChangeWrite({ method, row, actorId: user.userId, body: record.body, confirmedRejected: eventWriteConfirmedRejected,
      write: () => supabaseRest(`event_comments?${target}`, { method, headers: { Prefer: "return=representation" }, ...(method === "PATCH" ? { body: JSON.stringify({ body: record.body }) } : {}) }),
      audit: () => supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        family_id: membership.family_id, actor_user_id: user.userId,
        action: method === "PATCH" ? "event_comment_updated" : row.auth_user_id === user.userId ? "event_comment_deleted" : "event_comment_moderated",
        entity_type: "event_comment", entity_id: row.id, metadata: { event_id: row.event_id, moderation: method === "DELETE" && row.auth_user_id !== user.userId },
      }) }),
    });
    return eventCommentChangeResponse(result);
  } catch (error) { return eventErrorResponse(error, "Unable to change event comment"); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return changeComment(request, context, "PATCH"); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return changeComment(request, context, "DELETE"); }
