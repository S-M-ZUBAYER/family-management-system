import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageQurbani, getActiveFamilyMembership } from "@/lib/family-access";
import type { QurbaniCampaign, QurbaniRecordKind } from "@/lib/qurbani-types";
import {
  BackendNotConfiguredError,
  SupabaseRequestError,
  supabaseRest,
} from "@/lib/supabase-rest";

const kinds: QurbaniRecordKind[] = [
  "participant",
  "animal",
  "transaction",
  "vendor",
  "schedule",
  "task",
  "distribution",
];

const textValue = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const numberValue = (value: unknown, fallback?: number) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T) {
  const candidate = textValue(value, 40);
  return candidate && values.includes(candidate as T) ? (candidate as T) : fallback;
}

async function referenceBelongsToCampaign(
  table: "qurbani_animals" | "qurbani_participants",
  id: string | null,
  campaignId: string,
  familyId: string,
) {
  if (!id) return true;
  const query = new URLSearchParams({
    select: "id",
    id: `eq.${id}`,
    campaign_id: `eq.${campaignId}`,
    family_id: `eq.${familyId}`,
    limit: "1",
  });
  return (await supabaseRest<Array<{ id: string }>>(`${table}?${query}`)).length === 1;
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership || !canManageQurbani(membership.role)) {
      return Response.json({ error: "কোরবানি record তৈরির permission নেই।" }, { status: 403 });
    }

    const body = (await request.json()) as {
      kind?: QurbaniRecordKind;
      campaignId?: unknown;
      data?: Record<string, unknown>;
    };
    const kind = body.kind;
    const campaignId = textValue(body.campaignId, 80);
    const data = body.data ?? {};
    if (!kind || !kinds.includes(kind) || !campaignId) {
      return Response.json({ error: "Valid record type ও campaign প্রয়োজন।" }, { status: 400 });
    }

    const campaignQuery = new URLSearchParams({
      select: "id,share_price",
      id: `eq.${campaignId}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const campaign = (
      await supabaseRest<Array<Pick<QurbaniCampaign, "id" | "share_price">>>(
        `qurbani_campaigns?${campaignQuery}`,
      )
    )[0];
    if (!campaign) return Response.json({ error: "Campaign পাওয়া যায়নি।" }, { status: 404 });

    const base = {
      family_id: membership.family_id,
      campaign_id: campaignId,
      created_by_user_id: user.userId,
    };
    let table = "";
    let record: Record<string, unknown>;

    if (kind === "participant") {
      const memberName = textValue(data.memberName, 180);
      const shareCount = numberValue(data.shareCount);
      const amountPaid = numberValue(data.amountPaid, 0);
      const amountDue = numberValue(
        data.amountDue,
        shareCount === undefined ? undefined : shareCount * Number(campaign.share_price),
      );
      const animalId = textValue(data.animalId, 80);
      if (
        !memberName ||
        shareCount === undefined ||
        shareCount <= 0 ||
        shareCount > 100 ||
        amountDue === undefined ||
        amountDue < 0 ||
        amountPaid === undefined ||
        amountPaid < 0 ||
        !(await referenceBelongsToCampaign("qurbani_animals", animalId, campaignId, membership.family_id))
      ) {
        return Response.json({ error: "Participant, share, payment বা animal assignment সঠিক নয়।" }, { status: 400 });
      }
      table = "qurbani_participants";
      record = {
        ...base,
        animal_id: animalId,
        member_name: memberName,
        phone: textValue(data.phone, 40),
        share_count: shareCount,
        amount_due: amountDue,
        amount_paid: amountPaid,
        status: enumValue(data.status, ["pending", "confirmed", "cancelled"] as const, "pending"),
        notes: textValue(data.notes, 2000),
      };
    } else if (kind === "animal") {
      const tagCode = textValue(data.tagCode, 60);
      const purchasePrice = numberValue(data.purchasePrice, 0);
      const liveWeight = numberValue(data.liveWeightKg, 0);
      const estimatedMeat = numberValue(data.estimatedMeatKg, 0);
      const transportCost = numberValue(data.transportCost, 0);
      const feedCost = numberValue(data.feedCost, 0);
      if (
        !tagCode ||
        [purchasePrice, liveWeight, estimatedMeat, transportCost, feedCost].some(
          (value) => value === undefined || value < 0,
        )
      ) {
        return Response.json({ error: "Animal tag, price ও weight সঠিকভাবে দিন।" }, { status: 400 });
      }
      table = "qurbani_animals";
      record = {
        ...base,
        tag_code: tagCode,
        animal_type: enumValue(data.animalType, ["cow", "goat", "sheep", "buffalo"] as const, "cow"),
        breed: textValue(data.breed, 120),
        color: textValue(data.color, 80),
        live_weight_kg: liveWeight,
        estimated_meat_kg: estimatedMeat,
        purchase_price: purchasePrice,
        vendor_name: textValue(data.vendorName, 180),
        purchase_date: textValue(data.purchaseDate, 20),
        health_status: enumValue(data.healthStatus, ["pending", "fit", "observation", "rejected"] as const, "pending"),
        vet_notes: textValue(data.vetNotes, 2000),
        transport_cost: transportCost,
        feed_cost: feedCost,
        status: enumValue(data.status, ["shortlisted", "purchased", "received", "slaughtered", "cancelled"] as const, "shortlisted"),
      };
    } else if (kind === "transaction") {
      const amount = numberValue(data.amount);
      const animalId = textValue(data.animalId, 80);
      const participantId = textValue(data.participantId, 80);
      const refsAreValid = await Promise.all([
        referenceBelongsToCampaign("qurbani_animals", animalId, campaignId, membership.family_id),
        referenceBelongsToCampaign("qurbani_participants", participantId, campaignId, membership.family_id),
      ]);
      if (!amount || amount <= 0 || refsAreValid.includes(false)) {
        return Response.json({ error: "Transaction amount বা linked record সঠিক নয়।" }, { status: 400 });
      }
      table = "qurbani_transactions";
      record = {
        ...base,
        participant_id: participantId,
        animal_id: animalId,
        transaction_type: enumValue(data.transactionType, ["collection", "expense", "refund"] as const, "collection"),
        category: enumValue(
          data.category,
          ["share_payment", "animal_purchase", "transport", "feed", "butcher", "logistics", "equipment", "distribution", "misc"] as const,
          "share_payment",
        ),
        amount,
        payment_method: enumValue(data.paymentMethod, ["cash", "bank", "mobile", "other"] as const, "cash"),
        reference: textValue(data.reference, 180),
        transaction_date: textValue(data.transactionDate, 20) ?? new Date().toISOString().slice(0, 10),
        notes: textValue(data.notes, 2000),
      };
    } else if (kind === "vendor") {
      const name = textValue(data.name, 180);
      const agreedAmount = numberValue(data.agreedAmount, 0);
      const paidAmount = numberValue(data.paidAmount, 0);
      if (!name || agreedAmount === undefined || agreedAmount < 0 || paidAmount === undefined || paidAmount < 0) {
        return Response.json({ error: "Vendor name ও amount সঠিকভাবে দিন।" }, { status: 400 });
      }
      table = "qurbani_vendors";
      record = {
        ...base,
        name,
        vendor_type: enumValue(data.vendorType, ["animal_seller", "butcher", "transport", "feed", "equipment", "other"] as const, "animal_seller"),
        phone: textValue(data.phone, 40),
        address: textValue(data.address, 500),
        agreed_amount: agreedAmount,
        paid_amount: paidAmount,
        status: enumValue(data.status, ["planned", "confirmed", "completed", "cancelled"] as const, "planned"),
        notes: textValue(data.notes, 2000),
      };
    } else if (kind === "schedule") {
      const scheduledAt = textValue(data.scheduledAt, 40);
      const sequenceNo = numberValue(data.sequenceNo, 1);
      const animalId = textValue(data.animalId, 80);
      if (
        !scheduledAt ||
        sequenceNo === undefined ||
        sequenceNo < 1 ||
        !(await referenceBelongsToCampaign("qurbani_animals", animalId, campaignId, membership.family_id))
      ) {
        return Response.json({ error: "Schedule time, sequence বা animal সঠিক নয়।" }, { status: 400 });
      }
      table = "qurbani_schedules";
      record = {
        ...base,
        animal_id: animalId,
        sequence_no: Math.round(sequenceNo),
        scheduled_at: scheduledAt,
        location: textValue(data.location, 220),
        butcher_team: textValue(data.butcherTeam, 180),
        status: enumValue(data.status, ["scheduled", "in_progress", "completed", "delayed"] as const, "scheduled"),
        notes: textValue(data.notes, 2000),
      };
    } else if (kind === "task") {
      const title = textValue(data.title, 220);
      if (!title) return Response.json({ error: "Task title প্রয়োজন।" }, { status: 400 });
      table = "qurbani_tasks";
      record = {
        ...base,
        title,
        category: enumValue(data.category, ["procurement", "finance", "logistics", "slaughter", "distribution", "cleanup"] as const, "logistics"),
        assigned_to: textValue(data.assignedTo, 180),
        due_at: textValue(data.dueAt, 40),
        priority: enumValue(data.priority, ["normal", "high", "urgent"] as const, "normal"),
        status: enumValue(data.status, ["todo", "in_progress", "completed", "cancelled"] as const, "todo"),
        notes: textValue(data.notes, 2000),
      };
    } else {
      const recipientName = textValue(data.recipientName, 180);
      const weightKg = numberValue(data.weightKg, 0);
      const packageCount = numberValue(data.packageCount, 1);
      if (
        !recipientName ||
        weightKg === undefined ||
        weightKg < 0 ||
        packageCount === undefined ||
        packageCount < 1
      ) {
        return Response.json({ error: "Recipient, weight ও package count সঠিকভাবে দিন।" }, { status: 400 });
      }
      table = "qurbani_distributions";
      record = {
        ...base,
        recipient_name: recipientName,
        recipient_type: enumValue(data.recipientType, ["participant", "family", "relative", "needy", "worker", "other"] as const, "participant"),
        weight_kg: weightKg,
        package_count: Math.round(packageCount),
        collected_at: textValue(data.collectedAt, 40),
        notes: textValue(data.notes, 2000),
      };
    }

    const [created] = await supabaseRest<Array<Record<string, unknown>>>(table, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record),
    });
    await supabaseRest("audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        family_id: membership.family_id,
        actor_user_id: user.userId,
        action: `qurbani_${kind}_created`,
        entity_type: `qurbani_${kind}`,
        entity_id: String(created.id),
        metadata: { campaign_id: campaignId },
      }),
    });
    return Response.json({ record: created }, { status: 201 });
  } catch (error) {
    if (error instanceof BackendNotConfiguredError) {
      return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    }
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to create Qurbani record", error.status, error.message);
      return Response.json({ error: "কোরবানি record save হয়নি।" }, { status: 502 });
    }
    console.error("Unable to create Qurbani record", error);
    return Response.json({ error: "কোরবানি record save হয়নি।" }, { status: 500 });
  }
}
