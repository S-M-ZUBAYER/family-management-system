import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageQurbani, getActiveFamilyMembership } from "@/lib/family-access";
import type { QurbaniCampaign } from "@/lib/qurbani-types";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const campaignStatuses = ["planning", "registration"] as const;

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const numberValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

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
    const year = numberValue(body.year);
    const sharePrice = numberValue(body.sharePrice);
    const targetShares = numberValue(body.targetShares);
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
      !campaignStatuses.includes(status as (typeof campaignStatuses)[number])
    ) {
      return Response.json({ error: "Campaign name, year, share price ও target সঠিকভাবে দিন।" }, { status: 400 });
    }

    const [campaign] = await supabaseRest<QurbaniCampaign[]>("qurbani_campaigns", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        title,
        year: Math.round(year),
        hijri_year: textValue(body.hijriYear, 40),
        status,
        registration_deadline: textValue(body.registrationDeadline, 40),
        share_price: sharePrice,
        target_shares: targetShares,
        location: textValue(body.location, 220),
        slaughter_date: textValue(body.slaughterDate, 20),
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
