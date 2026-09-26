import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageNotices, getActiveFamilyMembership } from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

import type { FamilyNoticeRow } from "../route";

type NoticeAction = "publish" | "draft" | "archive" | "pin" | "unpin";
type UpdateNoticeBody = { action?: NoticeAction };

const actions: NoticeAction[] = ["publish", "draft", "archive", "pin", "unpin"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageNotices(membership.role)) {
      return Response.json({ error: "Notice পরিচালনার permission নেই।" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as UpdateNoticeBody;
    if (!id || !body.action || !actions.includes(body.action)) {
      return Response.json({ error: "Valid notice action প্রয়োজন।" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.action === "publish") {
      patch.status = "published";
      patch.publish_at = new Date().toISOString();
    } else if (body.action === "draft" || body.action === "archive") {
      patch.status = body.action;
    } else {
      patch.is_pinned = body.action === "pin";
    }

    const query = new URLSearchParams({
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
    });
    const notices = await supabaseRest<FamilyNoticeRow[]>(`family_notices?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!notices.length) {
      return Response.json({ error: "Notice পাওয়া যায়নি।" }, { status: 404 });
    }

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: `family_notice_${body.action}`,
        entity_type: "family_notice",
        entity_id: id,
        metadata: {},
      }),
    });

    return Response.json({ notice: notices[0] });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "PostgreSQL connection has not been configured yet." }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to update notice", error.status, error.message);
      return Response.json({ error: "Notice update হয়নি।" }, { status: 502 });
    }
    console.error("Unable to update notice", error);
    return Response.json({ error: "Notice update হয়নি।" }, { status: 500 });
  }
}
