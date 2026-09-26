import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageQurbani, getActiveFamilyMembership } from "@/lib/family-access";
import type {
  QurbaniAnimal,
  QurbaniCampaign,
  QurbaniDistribution,
  QurbaniParticipant,
  QurbaniSchedule,
  QurbaniTask,
  QurbaniTransaction,
  QurbaniVendor,
} from "@/lib/qurbani-types";
import {
  BackendNotConfiguredError,
  isBackendConfigured,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });

    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) {
      return Response.json(
        { code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" },
        { status: 409 },
      );
    }

    const canManage = canManageQurbani(membership.role);
    const familyQuery = new URLSearchParams({
      select: "id,name_bn,name_en",
      id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const family = (
      await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(
        `families?${familyQuery}`,
      )
    )[0];

    let campaigns: QurbaniCampaign[] = [];
    let participants: QurbaniParticipant[] = [];
    let animals: QurbaniAnimal[] = [];
    let transactions: QurbaniTransaction[] = [];
    let vendors: QurbaniVendor[] = [];
    let schedules: QurbaniSchedule[] = [];
    let tasks: QurbaniTask[] = [];
    let distributions: QurbaniDistribution[] = [];
    let migrationRequired = false;

    try {
      const common = { family_id: `eq.${membership.family_id}` };
      const queries = {
        campaigns: new URLSearchParams({
          select: "id,family_id,title,year,hijri_year,status,registration_deadline,share_price,target_shares,location,slaughter_date,notes,created_at,updated_at",
          ...common,
          order: "year.desc,created_at.desc",
        }),
        participants: new URLSearchParams({
          select: "id,campaign_id,animal_id,member_name,phone,share_count,amount_due,amount_paid,status,notes,created_at,updated_at",
          ...common,
          order: "created_at.asc",
        }),
        animals: new URLSearchParams({
          select: "id,campaign_id,tag_code,animal_type,breed,color,live_weight_kg,estimated_meat_kg,purchase_price,vendor_name,purchase_date,health_status,vet_notes,transport_cost,feed_cost,status,created_at,updated_at",
          ...common,
          order: "tag_code.asc",
        }),
        transactions: new URLSearchParams({
          select: "id,campaign_id,participant_id,animal_id,transaction_type,category,amount,payment_method,reference,transaction_date,notes,created_at",
          ...common,
          order: "transaction_date.desc,created_at.desc",
        }),
        vendors: new URLSearchParams({
          select: "id,campaign_id,name,vendor_type,phone,address,agreed_amount,paid_amount,status,notes,created_at,updated_at",
          ...common,
          order: "created_at.asc",
        }),
        schedules: new URLSearchParams({
          select: "id,campaign_id,animal_id,sequence_no,scheduled_at,location,butcher_team,status,notes,created_at,updated_at",
          ...common,
          order: "sequence_no.asc,scheduled_at.asc",
        }),
        tasks: new URLSearchParams({
          select: "id,campaign_id,title,category,assigned_to,due_at,priority,status,notes,created_at,updated_at",
          ...common,
          order: "due_at.asc.nullslast,created_at.asc",
        }),
        distributions: new URLSearchParams({
          select: "id,campaign_id,recipient_name,recipient_type,weight_kg,package_count,collected_at,notes,created_at",
          ...common,
          order: "created_at.asc",
        }),
      };

      [campaigns, participants, animals, transactions, vendors, schedules, tasks, distributions] =
        await Promise.all([
          supabaseRest<QurbaniCampaign[]>(`qurbani_campaigns?${queries.campaigns}`),
          supabaseRest<QurbaniParticipant[]>(`qurbani_participants?${queries.participants}`),
          supabaseRest<QurbaniAnimal[]>(`qurbani_animals?${queries.animals}`),
          supabaseRest<QurbaniTransaction[]>(`qurbani_transactions?${queries.transactions}`),
          supabaseRest<QurbaniVendor[]>(`qurbani_vendors?${queries.vendors}`),
          supabaseRest<QurbaniSchedule[]>(`qurbani_schedules?${queries.schedules}`),
          supabaseRest<QurbaniTask[]>(`qurbani_tasks?${queries.tasks}`),
          supabaseRest<QurbaniDistribution[]>(`qurbani_distributions?${queries.distributions}`),
        ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError) migrationRequired = true;
      else throw error;
    }

    if (!canManage) {
      campaigns = campaigns.filter((campaign) => campaign.status !== "planning");
      const visibleCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
      participants = participants
        .filter((record) => visibleCampaignIds.has(record.campaign_id))
        .map((record) => ({ ...record, phone: null }));
      animals = animals.filter((record) => visibleCampaignIds.has(record.campaign_id));
      transactions = transactions.filter((record) => visibleCampaignIds.has(record.campaign_id));
      vendors = vendors
        .filter((record) => visibleCampaignIds.has(record.campaign_id))
        .map((record) => ({ ...record, phone: null, address: null }));
      schedules = schedules.filter((record) => visibleCampaignIds.has(record.campaign_id));
      tasks = tasks.filter((record) => visibleCampaignIds.has(record.campaign_id));
      distributions = distributions.filter((record) => visibleCampaignIds.has(record.campaign_id));
    }

    return Response.json({
      family,
      campaigns,
      participants,
      animals,
      transactions,
      vendors,
      schedules,
      tasks,
      distributions,
      migrationRequired,
      permissions: { canManage },
    });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json(
        { error: "PostgreSQL connection has not been configured yet." },
        { status: 503 },
      );
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to load Qurbani operations", error.status, error.message);
      return Response.json({ error: "কোরবানি data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
    }
    console.error("Unable to load Qurbani operations", error);
    return Response.json({ error: "কোরবানি request সম্পন্ন হয়নি।" }, { status: 500 });
  }
}
