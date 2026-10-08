import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageWelfare, getActiveFamilyMembership } from "@/lib/family-access";
import { SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
import { welfareErrorResponse } from "../route";

const actions = ["create_fund", "create_contribution", "create_expense", "create_request", "create_pledge", "update_status"] as const;
type Action = (typeof actions)[number];
type WelfareKind = "fund" | "contribution" | "expense" | "request" | "pledge";
const welfareTables: Record<WelfareKind, string> = { fund: "welfare_funds", contribution: "welfare_contributions", expense: "welfare_expenses", request: "welfare_requests", pledge: "welfare_pledges" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const amount = (value: unknown, fallback?: number) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const date = (value: unknown, fallback = new Date().toISOString().slice(0, 10)) => {
  const candidate = text(value, 10);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
};
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T) {
  const candidate = text(value, 40);
  return candidate && values.includes(candidate as T) ? candidate as T : fallback;
}

async function fundExists(familyId: string, fundId: string, activeOnly = false) {
  const query = new URLSearchParams({ select: "id", id: `eq.${fundId}`, family_id: `eq.${familyId}`, limit: "1" });
  if (activeOnly) query.set("status", "eq.active");
  return Boolean((await supabaseRest<Array<{ id: string }>>(`welfare_funds?${query}`))[0]);
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageWelfare(membership.role);
    const body = await request.json() as { action?: Action; data?: Record<string, unknown> };
    if (!body.action || !actions.includes(body.action)) return Response.json({ error: "Valid Welfare action প্রয়োজন।" }, { status: 400 });
    const data = body.data ?? {};
    const now = new Date().toISOString();
    let table = "";
    let record: Record<string, unknown> = {};

    if (body.action === "create_fund") {
      if (!canManage) return Response.json({ error: "শুধু Family Admin fund তৈরি করতে পারবেন।" }, { status: 403 });
      const name = text(data.name, 160);
      const target = amount(data.targetAmount, 0);
      const opening = amount(data.openingBalance, 0);
      if (!name || target === undefined || target < 0 || opening === undefined || opening < 0) return Response.json({ error: "Fund name ও amount সঠিকভাবে দিন।" }, { status: 400 });
      table = "welfare_funds";
      record = {
        family_id: membership.family_id,
        name,
        description: text(data.description, 2000),
        category: choice(data.category, ["general", "emergency", "medical", "education", "charity"] as const, "general"),
        target_amount: target,
        opening_balance: opening,
        status: "active",
        visibility: choice(data.visibility, ["family", "admins"] as const, "family"),
        created_by_user_id: user.userId,
      };
    } else if (body.action === "create_contribution") {
      const fundId = text(data.fundId, 80);
      const contributionAmount = amount(data.amount);
      if (!fundId || !uuidPattern.test(fundId) || !(await fundExists(membership.family_id, fundId, true)) || contributionAmount === undefined || contributionAmount <= 0) return Response.json({ error: "Active fund ও positive contribution amount প্রয়োজন।" }, { status: 400 });
      table = "welfare_contributions";
      record = {
        family_id: membership.family_id,
        fund_id: fundId,
        contributor_user_id: user.userId,
        contributor_name: canManage ? text(data.contributorName, 160) ?? user.displayName : user.displayName,
        amount: contributionAmount,
        contribution_date: date(data.contributionDate),
        payment_method: choice(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"),
        reference: text(data.reference, 180),
        notes: text(data.notes, 2000),
        status: canManage ? "approved" : "pending",
        submitted_by_user_id: user.userId,
        approved_by_user_id: canManage ? user.userId : null,
        approved_by_name: canManage ? user.displayName : null,
        approved_at: canManage ? now : null,
      };
    } else if (body.action === "create_expense") {
      if (!canManage) return Response.json({ error: "শুধু Fund manager expense তৈরি করতে পারবেন।" }, { status: 403 });
      const fundId = text(data.fundId, 80);
      const title = text(data.title, 180);
      const expenseAmount = amount(data.amount);
      if (!fundId || !uuidPattern.test(fundId) || !(await fundExists(membership.family_id, fundId, true)) || !title || expenseAmount === undefined || expenseAmount <= 0) return Response.json({ error: "Active fund, expense title ও positive amount প্রয়োজন।" }, { status: 400 });
      table = "welfare_expenses";
      record = {
        family_id: membership.family_id,
        fund_id: fundId,
        title,
        beneficiary_name: text(data.beneficiaryName, 180),
        category: choice(data.category, ["medical", "education", "emergency", "charity", "operations", "other"] as const, "other"),
        amount: expenseAmount,
        expense_date: date(data.expenseDate),
        payment_method: choice(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"),
        reference: text(data.reference, 180),
        notes: text(data.notes, 2000),
        status: "pending",
        requested_by_user_id: user.userId,
      };
    } else if (body.action === "create_request") {
      const title = text(data.title, 180);
      const description = text(data.description, 5000);
      const requestedAmount = amount(data.requestedAmount);
      const fundId = text(data.fundId, 80);
      if (!title || !description || requestedAmount === undefined || requestedAmount <= 0 || (fundId && (!uuidPattern.test(fundId) || !(await fundExists(membership.family_id, fundId, true))))) return Response.json({ error: "শিরোনাম, প্রয়োজনের বিবরণ, active fund ও positive amount দিন।" }, { status: 400 });
      table = "welfare_requests";
      record = {
        family_id: membership.family_id,
        fund_id: fundId,
        requester_user_id: user.userId,
        requester_name: user.displayName,
        request_type: choice(data.requestType, ["medical", "education", "emergency", "livelihood", "charity", "other"] as const, "other"),
        title,
        description,
        requested_amount: requestedAmount,
        urgency: choice(data.urgency, ["normal", "high", "critical"] as const, "normal"),
        visibility: choice(data.visibility, ["admins", "family"] as const, "admins"),
        status: "submitted",
      };
    } else if (body.action === "create_pledge") {
      const fundId = text(data.fundId, 80);
      const pledgeAmount = amount(data.amount);
      if (!fundId || !uuidPattern.test(fundId) || !(await fundExists(membership.family_id, fundId, true)) || pledgeAmount === undefined || pledgeAmount <= 0) return Response.json({ error: "Active fund ও positive pledge amount প্রয়োজন।" }, { status: 400 });
      table = "welfare_pledges";
      record = {
        family_id: membership.family_id,
        fund_id: fundId,
        auth_user_id: user.userId,
        member_name: user.displayName,
        frequency: choice(data.frequency, ["monthly", "quarterly", "yearly", "one_time"] as const, "monthly"),
        amount: pledgeAmount,
        start_date: date(data.startDate),
        next_due_date: text(data.nextDueDate, 10),
        status: "active",
        notes: text(data.notes, 2000),
      };
    } else {
      return updateStatus(data, membership.family_id, user.userId, user.displayName, canManage);
    }

    const [result] = await supabaseRest<Array<Record<string, unknown>>>(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) });
    await audit(membership.family_id, user.userId, `${body.action}`, table, String(result.id));
    return Response.json({ record: result }, { status: 201 });
  } catch (error) {
    return welfareErrorResponse(error, "Unable to save Welfare Fund record");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageWelfare(membership.role), body = await request.json() as { kind?: WelfareKind; recordId?: unknown; data?: Record<string, unknown> };
    const kind = body.kind, recordId = text(body.recordId, 80); if (!kind || !(kind in welfareTables) || !recordId || !uuidPattern.test(recordId)) return Response.json({ error: "Valid Welfare record প্রয়োজন।" }, { status: 400 });
    const table = welfareTables[kind], query = new URLSearchParams({ select: "*", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${query}`))[0]; if (!existing) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
    const owner = kind === "contribution" ? existing.submitted_by_user_id === user.userId : kind === "request" ? existing.requester_user_id === user.userId : kind === "pledge" ? existing.auth_user_id === user.userId : false;
    if (!canManage && !owner) return Response.json({ error: "এই record edit করার অনুমতি নেই।" }, { status: 403 });
    const lockedStatuses: Record<WelfareKind, readonly string[]> = {
      fund: ["closed"], contribution: ["approved", "rejected", "refunded"], expense: ["approved", "rejected", "paid"],
      request: ["approved", "rejected", "disbursed", "cancelled"], pledge: ["completed", "cancelled"],
    };
    if (lockedStatuses[kind].includes(String(existing.status))) return Response.json({ error: "This reviewed or finalized record cannot be edited." }, { status: 409 });
    if (!canManage && ((kind === "contribution" && existing.status !== "pending") || (kind === "request" && !["submitted", "under_review"].includes(String(existing.status))))) return Response.json({ error: "Review/approval-এর পর এই financial record edit করা যাবে না।" }, { status: 409 });
    const changes = await welfareChanges(kind, body.data ?? {}, membership.family_id, canManage, user.displayName); if (changes instanceof Response) return changes;
    if (kind === "fund" && Number(changes.opening_balance) !== Number(existing.opening_balance)) {
      return Response.json({ error: "Opening balance is fixed after fund creation. Record a contribution or expense for later corrections." }, { status: 409 });
    }
    if (kind !== "fund" && typeof changes.fund_id === "string" && changes.fund_id !== existing.fund_id && !(await fundExists(membership.family_id, changes.fund_id, true))) {
      return Response.json({ error: "Choose an active fund before moving this record." }, { status: 409 });
    }
    changes.updated_at = new Date().toISOString();
    const filter = new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}` });
    const [updated] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
    await audit(membership.family_id, user.userId, `welfare_${kind}_updated`, table, recordId); return Response.json({ record: updated });
  } catch (error) { return welfareErrorResponse(error, "Unable to update Welfare Fund record"); }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageWelfare(membership.role), body = await request.json() as { kind?: WelfareKind; recordId?: unknown };
    const kind = body.kind, recordId = text(body.recordId, 80); if (!kind || !(kind in welfareTables) || !recordId || !uuidPattern.test(recordId)) return Response.json({ error: "Valid Welfare record প্রয়োজন।" }, { status: 400 });
    const table = welfareTables[kind], query = new URLSearchParams({ select: "*", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${query}`))[0]; if (!existing) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
    const owner = kind === "contribution" ? existing.submitted_by_user_id === user.userId : kind === "request" ? existing.requester_user_id === user.userId : kind === "pledge" ? existing.auth_user_id === user.userId : false;
    if (!canManage && !owner) return Response.json({ error: "এই record delete করার অনুমতি নেই।" }, { status: 403 });
    const deletableStatuses: Record<WelfareKind, readonly string[]> = {
      fund: [], contribution: ["pending"], expense: ["pending"], request: ["submitted"], pledge: ["active", "paused"],
    };
    if (!deletableStatuses[kind].includes(String(existing.status))) return Response.json({ error: "This reviewed or finalized record cannot be deleted; its audit history is retained." }, { status: 409 });
    if (kind === "contribution" || kind === "expense" || kind === "request") {
      const linkedDocuments = await supabaseRest<Array<{ id: string }>>(`welfare_documents?${new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, entity_type: `eq.${kind}`, entity_id: `eq.${recordId}`, limit: "1" })}`);
      if (linkedDocuments.length) return Response.json({ code: "WELFARE_DOCUMENTS_ATTACHED", error: "Remove this draft record's documents before deleting the record." }, { status: 409 });
    }
    await supabaseRest(`${table}?${new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await audit(membership.family_id, user.userId, `welfare_${kind}_deleted`, table, recordId); return Response.json({ message: `${kind} record স্থায়ীভাবে delete হয়েছে।` });
  } catch (error) { return welfareErrorResponse(error, "Unable to delete Welfare Fund record"); }
}

async function welfareChanges(kind: WelfareKind, data: Record<string, unknown>, familyId: string, canManage: boolean, displayName: string): Promise<Record<string, unknown> | Response> {
  if (kind === "fund") {
    if (!canManage) return Response.json({ error: "শুধু Family Admin fund edit করবেন।" }, { status: 403 });
    const name = text(data.name, 160), target = amount(data.targetAmount, 0), opening = amount(data.openingBalance, 0); if (!name || target === undefined || target < 0 || opening === undefined || opening < 0) return Response.json({ error: "Fund name ও amount সঠিকভাবে দিন।" }, { status: 400 });
    return { name, description: text(data.description, 2000), category: choice(data.category, ["general", "emergency", "medical", "education", "charity"] as const, "general"), target_amount: target, opening_balance: opening, visibility: choice(data.visibility, ["family", "admins"] as const, "family") };
  }
  const fundId = text(data.fundId, 80); if (fundId && (!uuidPattern.test(fundId) || !(await fundExists(familyId, fundId)))) return Response.json({ error: "Valid fund নির্বাচন করুন।" }, { status: 400 });
  if (kind === "contribution") {
    const contributionAmount = amount(data.amount); if (!fundId || contributionAmount === undefined || contributionAmount <= 0) return Response.json({ error: "Fund ও positive contribution amount প্রয়োজন।" }, { status: 400 });
    return { fund_id: fundId, contributor_name: canManage ? text(data.contributorName, 160) ?? displayName : displayName, amount: contributionAmount, contribution_date: date(data.contributionDate), payment_method: choice(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"), reference: text(data.reference, 180), notes: text(data.notes, 2000) };
  }
  if (kind === "expense") {
    if (!canManage) return Response.json({ error: "শুধু Fund manager expense edit করবেন।" }, { status: 403 });
    const title = text(data.title, 180), expenseAmount = amount(data.amount); if (!fundId || !title || expenseAmount === undefined || expenseAmount <= 0) return Response.json({ error: "Fund, expense title ও positive amount প্রয়োজন।" }, { status: 400 });
    return { fund_id: fundId, title, beneficiary_name: text(data.beneficiaryName, 180), category: choice(data.category, ["medical", "education", "emergency", "charity", "operations", "other"] as const, "other"), amount: expenseAmount, expense_date: date(data.expenseDate), payment_method: choice(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"), reference: text(data.reference, 180), notes: text(data.notes, 2000) };
  }
  if (kind === "request") {
    const title = text(data.title, 180), description = text(data.description, 5000), requestedAmount = amount(data.requestedAmount); if (!title || !description || requestedAmount === undefined || requestedAmount <= 0) return Response.json({ error: "শিরোনাম, প্রয়োজনের বিবরণ ও positive amount দিন।" }, { status: 400 });
    return { fund_id: fundId, request_type: choice(data.requestType, ["medical", "education", "emergency", "livelihood", "charity", "other"] as const, "other"), title, description, requested_amount: requestedAmount, urgency: choice(data.urgency, ["normal", "high", "critical"] as const, "normal"), visibility: choice(data.visibility, ["admins", "family"] as const, "admins") };
  }
  const pledgeAmount = amount(data.amount); if (!fundId || pledgeAmount === undefined || pledgeAmount <= 0) return Response.json({ error: "Fund ও positive pledge amount প্রয়োজন।" }, { status: 400 });
  return { fund_id: fundId, frequency: choice(data.frequency, ["monthly", "quarterly", "yearly", "one_time"] as const, "monthly"), amount: pledgeAmount, start_date: date(data.startDate), next_due_date: text(data.nextDueDate, 10), notes: text(data.notes, 2000) };
}

async function updateStatus(data: Record<string, unknown>, familyId: string, userId: string, userName: string, canManage: boolean) {
  const entity = choice(data.entity, ["fund", "contribution", "expense", "request", "pledge"] as const, "fund");
  const id = text(data.id, 80);
  const status = text(data.status, 40);
  if (!id || !uuidPattern.test(id) || !status) return Response.json({ error: "Record ও status প্রয়োজন।" }, { status: 400 });
  const tableMap = { fund: "welfare_funds", contribution: "welfare_contributions", expense: "welfare_expenses", request: "welfare_requests", pledge: "welfare_pledges" } as const;
  const valid = {
    fund: ["active", "paused", "closed"],
    contribution: ["approved", "rejected", "refunded"],
    expense: ["approved", "paid", "rejected"],
    request: ["under_review", "approved", "rejected", "disbursed", "cancelled"],
    pledge: ["active", "paused", "completed", "cancelled"],
  }[entity];
  if (!valid.includes(status)) return Response.json({ error: "এই status গ্রহণযোগ্য নয়।" }, { status: 400 });
  if (!canManage && entity !== "pledge" && entity !== "request") return Response.json({ error: "Family Admin approval প্রয়োজন।" }, { status: 403 });
  const table = tableMap[entity];
  const lookup = new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" });
  const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${lookup}`))[0];
  if (!existing) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
  const transitions: Record<typeof entity, Record<string, readonly string[]>> = {
    fund: { active: ["paused", "closed"], paused: ["active", "closed"] },
    contribution: { pending: ["approved", "rejected"], approved: ["refunded"] },
    expense: { pending: ["approved", "rejected"], approved: ["paid"] },
    request: { submitted: ["under_review", "approved", "rejected", "cancelled"], under_review: ["approved", "rejected", "cancelled"], approved: ["disbursed"] },
    pledge: { active: ["paused", "completed", "cancelled"], paused: ["active", "completed", "cancelled"] },
  };
  if (!(transitions[entity][String(existing.status)] ?? []).includes(status)) {
    return Response.json({ error: "This status change is not allowed for the record's current state." }, { status: 409 });
  }
  if (!canManage) {
    if (entity === "pledge" && existing.auth_user_id === userId && ["active", "paused", "completed", "cancelled"].includes(status)) {
      // Members control only their own recurring pledge lifecycle.
    } else if (entity === "request" && existing.requester_user_id === userId && status === "cancelled") {
      // Members may withdraw only their own request.
    } else return Response.json({ error: "এই record update করার অনুমতি নেই।" }, { status: 403 });
  }
  if ((entity === "expense" && status === "paid") || (entity === "request" && status === "disbursed") || (entity === "contribution" && status === "refunded")) {
    const approvedAmount = entity === "request" ? amount(data.approvedAmount, Number(existing.approved_amount ?? 0)) : null;
    if (entity === "request" && (!approvedAmount || approvedAmount <= 0 || approvedAmount > Number(existing.requested_amount))) {
      return Response.json({ error: "Approved amount requested amount-এর মধ্যে দিন।" }, { status: 400 });
    }
    try {
      const updated = await supabaseRest<Record<string, unknown>>("rpc/settle_welfare_outflow", {
        method: "POST",
        body: JSON.stringify({
          p_family_id: familyId,
          p_entity: entity,
          p_record_id: id,
          p_actor_user_id: userId,
          p_actor_name: userName,
          p_approved_amount: approvedAmount,
          p_admin_note: text(data.adminNote, 3000),
          p_payment_method: choice(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"),
          p_reference: text(data.reference, 180),
        }),
      });
      return Response.json({ record: updated });
    } catch (error) {
      const response = welfareOutflowErrorResponse(error);
      if (response) return response;
      throw error;
    }
  }
  const now = new Date().toISOString();
  const changes: Record<string, unknown> = { status, updated_at: now };
  if (["contribution", "expense"].includes(entity) && ["approved", "paid"].includes(status)) Object.assign(changes, { approved_by_user_id: userId, approved_by_name: userName, approved_at: now });
  if (entity === "expense" && status === "paid") changes.paid_at = now;
  if (entity === "request" && canManage) {
    const approvedAmount = amount(data.approvedAmount, Number(existing.approved_amount ?? 0));
    if (["approved", "disbursed"].includes(status) && (!approvedAmount || approvedAmount <= 0 || approvedAmount > Number(existing.requested_amount))) return Response.json({ error: "Approved amount requested amount-এর মধ্যে দিন।" }, { status: 400 });
    Object.assign(changes, { approved_amount: approvedAmount ?? 0, admin_note: text(data.adminNote, 3000), reviewed_by_user_id: userId, reviewed_by_name: userName, reviewed_at: now });
  }
  const filter = new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${familyId}`, status: `eq.${String(existing.status)}` });
  const [updated] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
  if (!updated) return Response.json({ error: "This record changed while you were reviewing it. Reload and try again." }, { status: 409 });
  await audit(familyId, userId, `welfare_${entity}_${status}`, table, id);
  return Response.json({ record: updated });
}

function welfareOutflowErrorResponse(error: unknown): Response | null {
  if (!(error instanceof SupabaseRequestError)) return null;
  if (error.message.includes("PGRST202") || error.status === 404) return Response.json({ code: "MIGRATION_REQUIRED", error: "Welfare atomic-outflow migration apply করুন।" }, { status: 503 });
  const cases: Array<[string, string, number]> = [
    ["WELFARE_UNAUTHORIZED", "এই fund-এর টাকা ছাড় করার অনুমতি নেই।", 403],
    ["WELFARE_INVALID_AMOUNT", "Approved amount requested amount-এর মধ্যে দিন।", 400],
    ["WELFARE_INVALID_PAYMENT_METHOD", "Valid payment method নির্বাচন করুন।", 400],
    ["WELFARE_FUND_REQUIRED", "Disbursement-এর আগে একটি fund নির্বাচন করুন।", 400],
    ["WELFARE_FUND_INACTIVE", "এই fund-এ এখন লেনদেন করা যাবে না।", 409],
    ["WELFARE_INSUFFICIENT_BALANCE", "Fund balance পর্যাপ্ত নয়। Ledger আবার দেখুন।", 409],
    ["WELFARE_DISBURSEMENT_CONFLICT", "The linked disbursement conflicts with this request. An admin must review the ledger.", 409],
    ["WELFARE_INVALID_TRANSITION", "This record changed while you were reviewing it. Reload and try again.", 409],
  ];
  const match = cases.find(([code]) => error.message.includes(code));
  return match ? Response.json({ error: match[1] }, { status: match[2] }) : null;
}

async function audit(familyId: string, userId: string, action: string, entityType: string, entityId: string) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "welfare" } }) });
}
