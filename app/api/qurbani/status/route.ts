import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageQurbani, getActiveFamilyMembership } from "@/lib/family-access";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const statusConfig = {
  campaign: {
    table: "qurbani_campaigns",
    values: ["planning", "registration", "procurement", "slaughter", "distribution", "settled", "closed"],
  },
  participant: {
    table: "qurbani_participants",
    values: ["pending", "confirmed", "cancelled"],
  },
  animal: {
    table: "qurbani_animals",
    values: ["shortlisted", "purchased", "received", "slaughtered", "cancelled"],
  },
  vendor: {
    table: "qurbani_vendors",
    values: ["planned", "confirmed", "completed", "cancelled"],
  },
  schedule: {
    table: "qurbani_schedules",
    values: ["scheduled", "in_progress", "completed", "delayed"],
  },
  task: {
    table: "qurbani_tasks",
    values: ["todo", "in_progress", "completed", "cancelled"],
  },
} as const;

type StatusEntity = keyof typeof statusConfig;

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageQurbani(membership.role)) {
      return Response.json({ error: "কোরবানি status update করার permission নেই।" }, { status: 403 });
    }

    const body = (await request.json()) as { entity?: StatusEntity; id?: unknown; status?: unknown };
    const entity = body.entity;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (!entity || !(entity in statusConfig) || !id || !statusConfig[entity].values.includes(status as never)) {
      return Response.json({ error: "Valid entity, id ও status প্রয়োজন।" }, { status: 400 });
    }

    const config = statusConfig[entity];
    const query = new URLSearchParams({
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
    });
    const rows = await supabaseRest<Array<Record<string, unknown>>>(`${config.table}?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    });
    if (!rows.length) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: `qurbani_${entity}_status_updated`,
        entity_type: `qurbani_${entity}`,
        entity_id: id,
        metadata: { status },
      }),
    });
    return Response.json({ record: rows[0] });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to update Qurbani status", error.status, error.message);
      return Response.json({ error: "Status update হয়নি।" }, { status: 502 });
    }
    console.error("Unable to update Qurbani status", error);
    return Response.json({ error: "Status update হয়নি।" }, { status: 500 });
  }
}
