import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageEvents, getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

import type { FamilyEventRow } from "../route";

type EventAction = "publish" | "close" | "complete" | "cancel" | "draft";
const actions: EventAction[] = ["publish", "close", "complete", "cancel", "draft"];
const statusByAction: Record<EventAction, FamilyEventRow["status"]> = {
  publish: "published",
  close: "registration_closed",
  complete: "completed",
  cancel: "cancelled",
  draft: "draft",
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageEvents(membership.role)) {
      return Response.json({ error: "Event পরিচালনার permission নেই।" }, { status: 403 });
    }
    const { id } = await context.params;
    const body = (await request.json()) as { action?: EventAction };
    if (!id || !body.action || !actions.includes(body.action)) {
      return Response.json({ error: "Valid event action প্রয়োজন।" }, { status: 400 });
    }
    const query = new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}` });
    const events = await supabaseRest<FamilyEventRow[]>(`family_events?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: statusByAction[body.action], updated_at: new Date().toISOString() }),
    });
    if (!events.length) return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: `family_event_${body.action}`,
        entity_type: "family_event",
        entity_id: id,
        metadata: {},
      }),
    });
    return Response.json({ event: events[0] });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to update event", error.status, error.message);
      return Response.json({ error: "Event update হয়নি।" }, { status: 502 });
    }
    console.error("Unable to update event", error);
    return Response.json({ error: "Event update হয়নি।" }, { status: 500 });
  }
}
