import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

import type { EventRsvpRow, FamilyEventRow } from "../../route";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const { id } = await context.params;
    const body = (await request.json()) as { response?: unknown; guestCount?: unknown; note?: unknown };
    if (!id || typeof body.response !== "string" || !["going", "maybe", "not_going"].includes(body.response)) {
      return Response.json({ error: "RSVP response সঠিক নয়।" }, { status: 400 });
    }
    const guestCount = Number(body.guestCount ?? 0);
    if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 10) {
      return Response.json({ error: "Guest count ০ থেকে ১০-এর মধ্যে দিন।" }, { status: 400 });
    }
    const eventQuery = new URLSearchParams({
      select: "id,status,registration_deadline",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const event = (await supabaseRest<Array<Pick<FamilyEventRow, "id" | "status" | "registration_deadline">>>(`family_events?${eventQuery}`))[0];
    if (!event || event.status !== "published") {
      return Response.json({ error: "এই event-এর registration এখন খোলা নেই।" }, { status: 409 });
    }
    if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
      return Response.json({ error: "Registration deadline শেষ হয়েছে।" }, { status: 409 });
    }
    const query = new URLSearchParams({ on_conflict: "event_id,auth_user_id" });
    const [rsvp] = await supabaseRest<EventRsvpRow[]>(`event_rsvps?${query}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        event_id: id,
        auth_user_id: user.userId,
        respondent_name: user.displayName.slice(0, 180),
        response: body.response,
        guest_count: guestCount,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      }),
    });
    const safeRsvp = {
      id: rsvp.id,
      event_id: rsvp.event_id,
      respondent_name: rsvp.respondent_name,
      response: rsvp.response,
      guest_count: rsvp.guest_count,
      note: rsvp.note,
      updated_at: rsvp.updated_at,
    };
    return Response.json({ rsvp: { ...safeRsvp, is_current_user: true } });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to save RSVP", error.status, error.message);
      return Response.json({ error: "RSVP save হয়নি।" }, { status: 502 });
    }
    console.error("Unable to save RSVP", error);
    return Response.json({ error: "RSVP save হয়নি।" }, { status: 500 });
  }
}
