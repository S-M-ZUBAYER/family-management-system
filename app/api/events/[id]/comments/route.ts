import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

import type { EventCommentRow, FamilyEventRow } from "../../route";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const { id } = await context.params;
    const body = (await request.json()) as { body?: unknown };
    const commentBody = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
    if (!id || commentBody.length < 2) return Response.json({ error: "Comment লিখুন।" }, { status: 400 });
    const eventQuery = new URLSearchParams({
      select: "id,status",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const event = (await supabaseRest<Array<Pick<FamilyEventRow, "id" | "status">>>(`family_events?${eventQuery}`))[0];
    if (!event || event.status === "draft") return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });
    const [comment] = await supabaseRest<EventCommentRow[]>("event_comments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        event_id: id,
        auth_user_id: user.userId,
        author_name: user.displayName.slice(0, 180),
        body: commentBody,
      }),
    });
    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to save event comment", error.status, error.message);
      return Response.json({ error: "Comment save হয়নি।" }, { status: 502 });
    }
    console.error("Unable to save event comment", error);
    return Response.json({ error: "Comment save হয়নি।" }, { status: 500 });
  }
}
