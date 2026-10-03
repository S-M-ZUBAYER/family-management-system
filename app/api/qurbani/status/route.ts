import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageQurbani, getActiveFamilyMembership } from "@/lib/family-access";
import { editableFamilyQurbaniCampaign, findFamilyQurbaniCampaign, qurbaniDatabaseConflict } from "@/lib/qurbani-access";
import { canTransitionQurbaniCampaign } from "@/lib/qurbani-policy";
import type { QurbaniCampaignStatus } from "@/lib/qurbani-types";
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
    if (entity === "campaign") {
      const campaign = await findFamilyQurbaniCampaign(membership.family_id, id);
      if (!campaign) return Response.json({ error: "Campaign পাওয়া যায়নি।" }, { status: 404 });
      if (!canTransitionQurbaniCampaign(campaign.status, status as QurbaniCampaignStatus)) {
        return Response.json({ error: "Settled campaign শুধু close করা যাবে; closed campaign আর পরিবর্তন করা যাবে না।" }, { status: 409 });
      }
      query.set("status", `eq.${campaign.status}`);
    } else {
      const recordQuery = new URLSearchParams({ select: "id,campaign_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
      const record = (await supabaseRest<Array<{ id: string; campaign_id: string }>>(`${config.table}?${recordQuery}`))[0];
      if (!record) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
      const campaign = await editableFamilyQurbaniCampaign(membership.family_id, record.campaign_id);
      if (campaign instanceof Response) return campaign;
      query.set("campaign_id", `eq.${record.campaign_id}`);
    }
    const rows = await supabaseRest<Array<Record<string, unknown>>>(`${config.table}?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    });
    if (!rows.length) return Response.json({ error: "Record বা status পরিবর্তিত হয়েছে। আবার লোড করুন।" }, { status: 409 });

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
    const conflict = qurbaniDatabaseConflict(error);
    if (conflict) return conflict;
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
