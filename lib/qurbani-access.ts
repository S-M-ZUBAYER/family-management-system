import { isFinalizedQurbaniCampaign } from "@/lib/qurbani-policy";
import type { QurbaniCampaign } from "@/lib/qurbani-types";
import { SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

export function qurbaniDatabaseConflict(error: unknown): Response | null {
  if (!(error instanceof SupabaseRequestError)) return null;
  if (error.message.includes("QURBANI_FINALIZED")) {
    return Response.json({ error: "Settled বা closed campaign-এর রেকর্ড পরিবর্তন করা যাবে না।" }, { status: 409 });
  }
  if (error.message.includes("QURBANI_DRAFT_NOT_EMPTY")) {
    return Response.json({ error: "শুধু খালি planning campaign মুছতে পারবেন।" }, { status: 409 });
  }
  if (error.message.includes("QURBANI_CAMPAIGN_LINK_IMMUTABLE")) {
    return Response.json({ error: "Campaign বা family association পরিবর্তন করা যাবে না।" }, { status: 409 });
  }
  if (error.message.includes("QURBANI_CAMPAIGN_NOT_FOUND")) {
    return Response.json({ error: "Campaign পাওয়া যায়নি।" }, { status: 404 });
  }
  return null;
}

export async function findFamilyQurbaniCampaign(familyId: string, campaignId: string) {
  const query = new URLSearchParams({
    select: "id,status,share_price,title,year",
    id: `eq.${campaignId}`,
    family_id: `eq.${familyId}`,
    limit: "1",
  });
  return (await supabaseRest<Array<Pick<QurbaniCampaign, "id" | "status" | "share_price" | "title" | "year">>>(
    `qurbani_campaigns?${query}`,
  ))[0];
}

export async function editableFamilyQurbaniCampaign(familyId: string, campaignId: string) {
  const campaign = await findFamilyQurbaniCampaign(familyId, campaignId);
  if (!campaign) return Response.json({ error: "Campaign পাওয়া যায়নি।" }, { status: 404 });
  if (isFinalizedQurbaniCampaign(campaign.status)) {
    return Response.json({ error: "Settled বা closed campaign-এর রেকর্ড পরিবর্তন করা যাবে না।" }, { status: 409 });
  }
  return campaign;
}
