import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageQurbani, getActiveFamilyMembership } from "@/lib/family-access";
import { editableFamilyQurbaniCampaign, findFamilyQurbaniCampaign, qurbaniDatabaseConflict } from "@/lib/qurbani-access";
import { canDeleteQurbaniCampaign } from "@/lib/qurbani-policy";
import { qurbaniDate, qurbaniMoney, qurbaniPositiveInteger, qurbaniShares, qurbaniTimestamp } from "@/lib/qurbani-validation";
import type { QurbaniCampaign } from "@/lib/qurbani-types";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const campaignStatuses = ["planning", "registration", "procurement", "slaughter", "distribution", "settled", "closed"] as const;

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageQurbani(membership.role)) {
      return Response.json({ error: "কোরবানি campaign তৈরির permission নেই।" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const title = textValue(body.title, 180);
    const year = qurbaniPositiveInteger(body.year);
    const sharePrice = qurbaniMoney(body.sharePrice);
    const targetShares = qurbaniShares(body.targetShares);
    const registrationDeadline = qurbaniTimestamp(body.registrationDeadline);
    const slaughterDate = qurbaniDate(body.slaughterDate);
    const status = textValue(body.status, 20) ?? "planning";
    if (
      !title ||
      !year ||
      year < 2000 ||
      year > 2200 ||
      sharePrice === undefined ||
      sharePrice < 0 ||
      targetShares === undefined ||
      targetShares <= 0 ||
      registrationDeadline === undefined ||
      slaughterDate === undefined ||
      !["planning", "registration"].includes(status)
    ) {
      return Response.json({ error: "Campaign name, year, share price ও target সঠিকভাবে দিন।" }, { status: 400 });
    }

    const [campaign] = await supabaseRest<QurbaniCampaign[]>("qurbani_campaigns", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        title,
        year,
        hijri_year: textValue(body.hijriYear, 40),
        status,
        registration_deadline: registrationDeadline,
        share_price: sharePrice,
        target_shares: targetShares,
        location: textValue(body.location, 220),
        slaughter_date: slaughterDate,
        notes: textValue(body.notes, 4000),
        created_by_user_id: user.userId,
      }),
    });

    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: "qurbani_campaign_created",
        entity_type: "qurbani_campaign",
        entity_id: campaign.id,
        metadata: { year: campaign.year, status: campaign.status },
      }),
    });
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    const conflict = qurbaniDatabaseConflict(error);
    if (conflict) return conflict;
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to create Qurbani campaign", error.status, error.message);
      return Response.json({ error: "Campaign save হয়নি।" }, { status: 502 });
    }
    console.error("Unable to create Qurbani campaign", error);
    return Response.json({ error: "Campaign save হয়নি।" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageQurbani(membership.role)) return Response.json({ error: "কোরবানি campaign edit করার permission নেই।" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const campaignId = textValue(body.campaignId, 80), title = textValue(body.title, 180), year = qurbaniPositiveInteger(body.year), sharePrice = qurbaniMoney(body.sharePrice), targetShares = qurbaniShares(body.targetShares), status = textValue(body.status, 20) ?? "planning";
    const registrationDeadline = qurbaniTimestamp(body.registrationDeadline);
    const slaughterDate = qurbaniDate(body.slaughterDate);
    if (!campaignId || !title || !year || year < 2000 || year > 2200 || sharePrice === undefined || sharePrice < 0 || targetShares === undefined || targetShares <= 0 || registrationDeadline === undefined || slaughterDate === undefined || !campaignStatuses.includes(status as (typeof campaignStatuses)[number])) return Response.json({ error: "Campaign name, year, dates, share price, target ও status সঠিকভাবে দিন।" }, { status: 400 });
    const current = await editableFamilyQurbaniCampaign(membership.family_id, campaignId);
    if (current instanceof Response) return current;
    const [campaign] = await supabaseRest<QurbaniCampaign[]>(`qurbani_campaigns?${new URLSearchParams({ id: `eq.${campaignId}`, family_id: `eq.${membership.family_id}`, status: `eq.${current.status}` })}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title, year, hijri_year: textValue(body.hijriYear, 40), status, registration_deadline: registrationDeadline, share_price: sharePrice, target_shares: targetShares, location: textValue(body.location, 220), slaughter_date: slaughterDate, notes: textValue(body.notes, 4000), updated_at: new Date().toISOString() }) });
    if (!campaign) return Response.json({ error: "Campaign status পরিবর্তিত হয়েছে। আবার লোড করুন।" }, { status: 409 });
    await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "qurbani_campaign_updated", entity_type: "qurbani_campaign", entity_id: campaignId, metadata: { year: campaign.year, status: campaign.status } }) });
    return Response.json({ campaign, message: "Qurbani campaign update হয়েছে।" });
  } catch (error) {
    return campaignError(error, "Unable to update Qurbani campaign", "Campaign update হয়নি।");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageQurbani(membership.role)) return Response.json({ error: "কোরবানি campaign delete করার permission নেই।" }, { status: 403 });
    const body = await request.json() as { campaignId?: unknown };
    const campaignId = textValue(body.campaignId, 80);
    if (!campaignId) return Response.json({ error: "Campaign নির্বাচন করুন।" }, { status: 400 });
    const campaign = await findFamilyQurbaniCampaign(membership.family_id, campaignId);
    if (!campaign) return Response.json({ error: "Campaign পাওয়া যায়নি।" }, { status: 404 });
    const linkedTables = ["qurbani_participants", "qurbani_animals", "qurbani_transactions", "qurbani_vendors", "qurbani_schedules", "qurbani_tasks", "qurbani_distributions"];
    const linked = await Promise.all(linkedTables.map((table) => supabaseRest<Array<{ id: string }>>(`${table}?${new URLSearchParams({ select: "id", campaign_id: `eq.${campaignId}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`)));
    if (!canDeleteQurbaniCampaign(campaign.status, linked.some((rows) => rows.length > 0))) {
      return Response.json({ error: "শুধু খালি planning campaign মুছতে পারবেন।" }, { status: 409 });
    }
    const deleted = await supabaseRest<Array<{ id: string }>>(`qurbani_campaigns?${new URLSearchParams({ select: "id", id: `eq.${campaignId}`, family_id: `eq.${membership.family_id}`, status: "eq.planning" })}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!deleted.length) return Response.json({ error: "Campaign status পরিবর্তিত হয়েছে। আবার লোড করুন।" }, { status: 409 });
    await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: membership.family_id, actor_user_id: user.userId, action: "qurbani_campaign_deleted", entity_type: "qurbani_campaign", entity_id: campaignId, metadata: { title: campaign.title, year: campaign.year } }) });
    return Response.json({ message: "খালি planning campaign মুছে ফেলা হয়েছে।" });
  } catch (error) {
    return campaignError(error, "Unable to delete Qurbani campaign", "Campaign delete হয়নি।");
  }
}

function campaignError(error: unknown, logMessage: string, message: string) {
  const conflict = qurbaniDatabaseConflict(error);
  if (conflict) return conflict;
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
  if (error instanceof SupabaseRequestError) {
    console.error(logMessage, error.status, error.message);
    return Response.json({ error: message }, { status: 502 });
  }
  console.error(logMessage, error);
  return Response.json({ error: message }, { status: 500 });
}
