import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageHousehold, getActiveFamilyMembership } from "@/lib/family-access";
import { supabaseRest } from "@/lib/supabase-rest";
import { householdErrorResponse } from "../route";

const actions = ["create_household", "create_list", "create_item", "create_bill", "create_task", "create_contact", "create_maintenance", "update_status"] as const;
type Action = (typeof actions)[number];
type HouseholdKind = "household" | "list" | "item" | "bill" | "task" | "contact" | "maintenance";
const householdTables: Record<HouseholdKind, string> = { household: "households", list: "household_shopping_lists", item: "household_shopping_items", bill: "household_utility_bills", task: "household_tasks", contact: "household_service_contacts", maintenance: "household_maintenance_requests" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const number = (value: unknown, fallback?: number) => { if (value === "" || value === null || value === undefined) return fallback; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; };
const date = (value: unknown, fallback = new Date().toISOString().slice(0, 10)) => { const candidate = text(value, 10); return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback; };
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T) { const candidate = text(value, 40); return candidate && values.includes(candidate as T) ? candidate as T : fallback; }
async function exists(table: string, familyId: string, id: string) { if (!uuid.test(id)) return false; const query = new URLSearchParams({ select: "id", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" }); return Boolean((await supabaseRest<Array<{ id: string }>>(`${table}?${query}`))[0]); }

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageHousehold(membership.role);
    const body = await request.json() as { action?: Action; data?: Record<string, unknown> };
    if (!body.action || !actions.includes(body.action)) return Response.json({ error: "Valid household action প্রয়োজন।" }, { status: 400 });
    const data = body.data ?? {}; const base = { family_id: membership.family_id }; let table = ""; let record: Record<string, unknown> = {};
    if (body.action === "create_household") {
      if (!canManage) return Response.json({ error: "Family Admin household তৈরি করবেন।" }, { status: 403 });
      const name = text(data.name, 160); if (!name) return Response.json({ error: "Household name প্রয়োজন।" }, { status: 400 });
      table = "households"; record = { ...base, name, address: text(data.address, 1000), city: text(data.city, 120), notes: text(data.notes, 2000), status: "active", created_by_user_id: user.userId };
    } else if (body.action === "create_list") {
      const householdId = text(data.householdId, 80), title = text(data.title, 180), budget = number(data.budgetAmount, 0);
      if (!householdId || !(await exists("households", membership.family_id, householdId)) || !title || budget === undefined || budget < 0) return Response.json({ error: "Household, list title ও budget সঠিকভাবে দিন।" }, { status: 400 });
      table = "household_shopping_lists"; record = { ...base, household_id: householdId, title, description: text(data.description, 2000), budget_amount: budget, needed_by: text(data.neededBy, 10), status: "active", created_by_user_id: user.userId, created_by_name: user.displayName };
    } else if (body.action === "create_item") {
      const listId = text(data.listId, 80), itemName = text(data.itemName, 180), quantity = number(data.quantity, 1), estimatedCost = number(data.estimatedCost, 0);
      if (!listId || !(await exists("household_shopping_lists", membership.family_id, listId)) || !itemName || !quantity || quantity <= 0 || estimatedCost === undefined || estimatedCost < 0) return Response.json({ error: "List, item name, quantity ও cost সঠিকভাবে দিন।" }, { status: 400 });
      table = "household_shopping_items"; record = { ...base, list_id: listId, item_name: itemName, category: choice(data.category, ["grocery", "medicine", "household", "baby", "personal", "other"] as const, "grocery"), quantity, unit: text(data.unit, 30) ?? "pcs", estimated_cost: estimatedCost, priority: choice(data.priority, ["low", "normal", "high", "urgent"] as const, "normal"), assigned_to_name: text(data.assignedToName, 160), notes: text(data.notes, 2000), status: "needed", created_by_user_id: user.userId };
    } else if (body.action === "create_bill") {
      if (!canManage) return Response.json({ error: "Family Admin utility bill তৈরি করবেন।" }, { status: 403 });
      const householdId = text(data.householdId, 80), title = text(data.title, 180), billAmount = number(data.amount), dueDate = text(data.dueDate, 10);
      if (!householdId || !(await exists("households", membership.family_id, householdId)) || !title || !billAmount || billAmount <= 0 || !dueDate) return Response.json({ error: "Household, bill title, amount ও due date প্রয়োজন।" }, { status: 400 });
      table = "household_utility_bills"; record = { ...base, household_id: householdId, title, category: choice(data.category, ["electricity", "gas", "water", "internet", "phone", "rent", "maintenance", "other"] as const, "other"), provider: text(data.provider, 180), account_number: text(data.accountNumber, 120), billing_month: date(data.billingMonth), amount: billAmount, due_date: dueDate, recurrence: choice(data.recurrence, ["none", "monthly", "quarterly", "yearly"] as const, "monthly"), status: "pending", notes: text(data.notes, 2000), created_by_user_id: user.userId };
    } else if (body.action === "create_task") {
      const householdId = text(data.householdId, 80), title = text(data.title, 180);
      if (!householdId || !(await exists("households", membership.family_id, householdId)) || !title) return Response.json({ error: "Household ও task title প্রয়োজন।" }, { status: 400 });
      table = "household_tasks"; record = { ...base, household_id: householdId, title, category: choice(data.category, ["cleaning", "cooking", "shopping", "care", "repair", "bill", "other"] as const, "other"), assigned_to_name: text(data.assignedToName, 160), due_at: text(data.dueAt, 30), recurrence: choice(data.recurrence, ["none", "daily", "weekly", "monthly"] as const, "none"), priority: choice(data.priority, ["low", "normal", "high", "urgent"] as const, "normal"), status: "todo", notes: text(data.notes, 2000), created_by_user_id: user.userId };
    } else if (body.action === "create_contact") {
      if (!canManage) return Response.json({ error: "Family Admin service contact যোগ করবেন।" }, { status: 403 });
      const name = text(data.name, 180), phone = text(data.phone, 80), rating = number(data.rating, 0), householdId = text(data.householdId, 80);
      if (!name || !phone || rating === undefined || rating < 0 || rating > 5 || (householdId && !(await exists("households", membership.family_id, householdId)))) return Response.json({ error: "Service name, phone ও rating সঠিকভাবে দিন।" }, { status: 400 });
      table = "household_service_contacts"; record = { ...base, household_id: householdId, name, service_type: choice(data.serviceType, ["electrician", "plumber", "cleaner", "driver", "technician", "caregiver", "security", "other"] as const, "other"), phone, alternate_phone: text(data.alternatePhone, 80), address: text(data.address, 1000), rating, is_trusted: data.isTrusted === true || data.isTrusted === "true", notes: text(data.notes, 2000), status: "active", created_by_user_id: user.userId };
    } else if (body.action === "create_maintenance") {
      const householdId = text(data.householdId, 80), title = text(data.title, 180), description = text(data.description, 5000), contactId = text(data.serviceContactId, 80), estimated = number(data.estimatedCost, 0);
      if (!householdId || !(await exists("households", membership.family_id, householdId)) || !title || !description || estimated === undefined || estimated < 0 || (contactId && !(await exists("household_service_contacts", membership.family_id, contactId)))) return Response.json({ error: "Household, সমস্যা, বিস্তারিত ও cost সঠিকভাবে দিন।" }, { status: 400 });
      table = "household_maintenance_requests"; record = { ...base, household_id: householdId, service_contact_id: contactId, title, description, category: choice(data.category, ["electrical", "plumbing", "appliance", "building", "cleaning", "security", "other"] as const, "other"), urgency: choice(data.urgency, ["normal", "high", "critical"] as const, "normal"), estimated_cost: estimated, assigned_vendor_name: text(data.assignedVendorName, 180), scheduled_at: text(data.scheduledAt, 30), status: "reported", reported_by_user_id: user.userId, reported_by_name: user.displayName };
    } else return updateStatus(data, membership.family_id, user.userId, user.displayName, canManage);
    const [created] = await supabaseRest<Array<Record<string, unknown>>>(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) });
    await audit(membership.family_id, user.userId, body.action, table, String(created.id)); return Response.json({ record: created }, { status: 201 });
  } catch (error) { return householdErrorResponse(error, "Unable to save household record"); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageHousehold(membership.role), body = await request.json() as { kind?: HouseholdKind; recordId?: unknown; data?: Record<string, unknown> };
    const kind = body.kind, recordId = text(body.recordId, 80); if (!kind || !(kind in householdTables) || !recordId || !uuid.test(recordId)) return Response.json({ error: "Valid household record প্রয়োজন।" }, { status: 400 });
    const table = householdTables[kind], query = new URLSearchParams({ select: "*", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${query}`))[0]; if (!existing) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
    const ownerId = kind === "maintenance" ? existing.reported_by_user_id : existing.created_by_user_id;
    if (!canManage && ownerId !== user.userId) return Response.json({ error: "এই record edit করার permission নেই।" }, { status: 403 });
    if (!canManage && ["household", "bill", "contact"].includes(kind)) return Response.json({ error: "Family Admin action প্রয়োজন।" }, { status: 403 });
    const changes = await householdChanges(kind, body.data ?? {}, membership.family_id, canManage); if (changes instanceof Response) return changes;
    changes.updated_at = new Date().toISOString();
    const filter = new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}` });
    const [updated] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
    await audit(membership.family_id, user.userId, `household_${kind}_updated`, table, recordId); return Response.json({ record: updated });
  } catch (error) { return householdErrorResponse(error, "Unable to update household record"); }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const canManage = canManageHousehold(membership.role), body = await request.json() as { kind?: HouseholdKind; recordId?: unknown };
    const kind = body.kind, recordId = text(body.recordId, 80); if (!kind || !(kind in householdTables) || !recordId || !uuid.test(recordId)) return Response.json({ error: "Valid household record প্রয়োজন।" }, { status: 400 });
    const table = householdTables[kind], query = new URLSearchParams({ select: "*", id: `eq.${recordId}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${query}`))[0]; if (!existing) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
    const ownerId = kind === "maintenance" ? existing.reported_by_user_id : existing.created_by_user_id;
    if (!canManage && ownerId !== user.userId) return Response.json({ error: "এই record delete করার permission নেই।" }, { status: 403 });
    if (kind === "household") return Response.json({ error: "Linked history রক্ষার জন্য household delete নয়—Archive করুন।" }, { status: 409 });
    if ((kind === "bill" && existing.status === "paid") || (kind === "maintenance" && existing.status === "completed")) return Response.json({ error: "Paid/completed record audit history-এর জন্য delete করা যাবে না।" }, { status: 409 });
    const documentEntity = kind === "list" ? "shopping_list" : kind === "bill" || kind === "maintenance" ? kind : null;
    if (documentEntity) {
      const attached = (await supabaseRest<Array<{ id: string }>>(`household_documents?${new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, entity_type: `eq.${documentEntity}`, entity_id: `eq.${recordId}`, limit: "1" })}`))[0];
      if (attached) return Response.json({ error: "Attached documents must be removed before this record can be deleted." }, { status: 409 });
    }
    await supabaseRest(`${table}?${new URLSearchParams({ id: `eq.${recordId}`, family_id: `eq.${membership.family_id}` })}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await audit(membership.family_id, user.userId, `household_${kind}_deleted`, table, recordId); return Response.json({ message: `${kind} record স্থায়ীভাবে delete হয়েছে।` });
  } catch (error) { return householdErrorResponse(error, "Unable to delete household record"); }
}

async function householdChanges(kind: HouseholdKind, data: Record<string, unknown>, familyId: string, canManage: boolean): Promise<Record<string, unknown> | Response> {
  if (kind === "household") { if (!canManage) return Response.json({ error: "Family Admin household edit করবেন।" }, { status: 403 }); const name = text(data.name, 160); if (!name) return Response.json({ error: "Household name প্রয়োজন।" }, { status: 400 }); return { name, address: text(data.address, 1000), city: text(data.city, 120), notes: text(data.notes, 2000) }; }
  if (kind === "list") { const householdId = text(data.householdId, 80), title = text(data.title, 180), budget = number(data.budgetAmount, 0); if (!householdId || !(await exists("households", familyId, householdId)) || !title || budget === undefined || budget < 0) return Response.json({ error: "Household, list title ও budget সঠিকভাবে দিন।" }, { status: 400 }); return { household_id: householdId, title, description: text(data.description, 2000), budget_amount: budget, needed_by: text(data.neededBy, 10) }; }
  if (kind === "item") { const listId = text(data.listId, 80), itemName = text(data.itemName, 180), quantity = number(data.quantity, 1), estimatedCost = number(data.estimatedCost, 0); if (!listId || !(await exists("household_shopping_lists", familyId, listId)) || !itemName || !quantity || quantity <= 0 || estimatedCost === undefined || estimatedCost < 0) return Response.json({ error: "List, item name, quantity ও cost সঠিকভাবে দিন।" }, { status: 400 }); return { list_id: listId, item_name: itemName, category: choice(data.category, ["grocery", "medicine", "household", "baby", "personal", "other"] as const, "grocery"), quantity, unit: text(data.unit, 30) ?? "pcs", estimated_cost: estimatedCost, priority: choice(data.priority, ["low", "normal", "high", "urgent"] as const, "normal"), assigned_to_name: text(data.assignedToName, 160), notes: text(data.notes, 2000) }; }
  if (kind === "bill") { if (!canManage) return Response.json({ error: "Family Admin utility bill edit করবেন।" }, { status: 403 }); const householdId = text(data.householdId, 80), title = text(data.title, 180), billAmount = number(data.amount), dueDate = text(data.dueDate, 10); if (!householdId || !(await exists("households", familyId, householdId)) || !title || !billAmount || billAmount <= 0 || !dueDate) return Response.json({ error: "Household, bill title, amount ও due date প্রয়োজন।" }, { status: 400 }); return { household_id: householdId, title, category: choice(data.category, ["electricity", "gas", "water", "internet", "phone", "rent", "maintenance", "other"] as const, "other"), provider: text(data.provider, 180), account_number: text(data.accountNumber, 120), billing_month: date(data.billingMonth), amount: billAmount, due_date: dueDate, recurrence: choice(data.recurrence, ["none", "monthly", "quarterly", "yearly"] as const, "monthly"), notes: text(data.notes, 2000) }; }
  if (kind === "task") { const householdId = text(data.householdId, 80), title = text(data.title, 180); if (!householdId || !(await exists("households", familyId, householdId)) || !title) return Response.json({ error: "Household ও task title প্রয়োজন।" }, { status: 400 }); return { household_id: householdId, title, category: choice(data.category, ["cleaning", "cooking", "shopping", "care", "repair", "bill", "other"] as const, "other"), assigned_to_name: text(data.assignedToName, 160), due_at: text(data.dueAt, 30), recurrence: choice(data.recurrence, ["none", "daily", "weekly", "monthly"] as const, "none"), priority: choice(data.priority, ["low", "normal", "high", "urgent"] as const, "normal"), notes: text(data.notes, 2000) }; }
  if (kind === "contact") { if (!canManage) return Response.json({ error: "Family Admin service contact edit করবেন।" }, { status: 403 }); const name = text(data.name, 180), phone = text(data.phone, 80), rating = number(data.rating, 0), householdId = text(data.householdId, 80); if (!name || !phone || rating === undefined || rating < 0 || rating > 5 || (householdId && !(await exists("households", familyId, householdId)))) return Response.json({ error: "Service name, phone ও rating সঠিকভাবে দিন।" }, { status: 400 }); return { household_id: householdId, name, service_type: choice(data.serviceType, ["electrician", "plumber", "cleaner", "driver", "technician", "caregiver", "security", "other"] as const, "other"), phone, alternate_phone: text(data.alternatePhone, 80), address: text(data.address, 1000), rating, is_trusted: data.isTrusted === true || data.isTrusted === "true", notes: text(data.notes, 2000) }; }
  const householdId = text(data.householdId, 80), title = text(data.title, 180), description = text(data.description, 5000), contactId = text(data.serviceContactId, 80), estimated = number(data.estimatedCost, 0); if (!householdId || !(await exists("households", familyId, householdId)) || !title || !description || estimated === undefined || estimated < 0 || (contactId && !(await exists("household_service_contacts", familyId, contactId)))) return Response.json({ error: "Household, সমস্যা, বিস্তারিত ও cost সঠিকভাবে দিন।" }, { status: 400 });
  return { household_id: householdId, service_contact_id: contactId, title, description, category: choice(data.category, ["electrical", "plumbing", "appliance", "building", "cleaning", "security", "other"] as const, "other"), urgency: choice(data.urgency, ["normal", "high", "critical"] as const, "normal"), estimated_cost: estimated, assigned_vendor_name: text(data.assignedVendorName, 180), scheduled_at: text(data.scheduledAt, 30) };
}

async function updateStatus(data: Record<string, unknown>, familyId: string, userId: string, userName: string, canManage: boolean) {
  const entity = choice(data.entity, ["household", "list", "item", "bill", "task", "contact", "maintenance"] as const, "task");
  const id = text(data.id, 80), status = text(data.status, 40); if (!id || !uuid.test(id) || !status) return Response.json({ error: "Record ও status প্রয়োজন।" }, { status: 400 });
  const tables = { household: "households", list: "household_shopping_lists", item: "household_shopping_items", bill: "household_utility_bills", task: "household_tasks", contact: "household_service_contacts", maintenance: "household_maintenance_requests" } as const;
  const allowed = { household: ["active", "archived"], list: ["active", "completed", "archived"], item: ["needed", "purchased", "unavailable", "cancelled"], bill: ["pending", "paid", "overdue", "skipped"], task: ["todo", "in_progress", "completed", "cancelled"], contact: ["active", "inactive"], maintenance: ["reported", "approved", "scheduled", "in_progress", "completed", "cancelled"] }[entity];
  if (!allowed.includes(status)) return Response.json({ error: "Status গ্রহণযোগ্য নয়।" }, { status: 400 });
  if (!canManage && ["household", "bill", "contact", "maintenance"].includes(entity)) {
    if (entity !== "maintenance" || status !== "cancelled") return Response.json({ error: "Family Admin action প্রয়োজন।" }, { status: 403 });
  }
  const table = tables[entity], lookup = new URLSearchParams({ select: "*", id: `eq.${id}`, family_id: `eq.${familyId}`, limit: "1" });
  const existing = (await supabaseRest<Array<Record<string, unknown>>>(`${table}?${lookup}`))[0]; if (!existing) return Response.json({ error: "Record পাওয়া যায়নি।" }, { status: 404 });
  if (!canManage && entity === "maintenance" && existing.reported_by_user_id !== userId) return Response.json({ error: "শুধু নিজের maintenance report cancel করতে পারবেন।" }, { status: 403 });
  const now = new Date().toISOString(); const changes: Record<string, unknown> = { status, updated_at: now };
  if (entity === "item" && status === "purchased") Object.assign(changes, { actual_cost: Math.max(0, number(data.actualCost, Number(existing.estimated_cost ?? 0)) ?? 0), purchased_by_user_id: userId, purchased_by_name: userName, purchased_at: now });
  if (entity === "bill" && status === "paid") Object.assign(changes, { payment_method: choice(data.paymentMethod, ["cash", "bank", "mobile", "card", "other"] as const, "cash"), reference: text(data.reference, 180), paid_by_user_id: userId, paid_by_name: userName, paid_at: now });
  if (entity === "task" && status === "completed") Object.assign(changes, { completed_by_user_id: userId, completed_by_name: userName, completed_at: now });
  if (entity === "maintenance" && canManage) Object.assign(changes, { actual_cost: Math.max(0, number(data.actualCost, Number(existing.actual_cost ?? 0)) ?? 0), assigned_vendor_name: text(data.assignedVendorName, 180) ?? existing.assigned_vendor_name, scheduled_at: text(data.scheduledAt, 30) ?? existing.scheduled_at, resolved_by_user_id: status === "completed" ? userId : existing.resolved_by_user_id, resolved_by_name: status === "completed" ? userName : existing.resolved_by_name, resolved_at: status === "completed" ? now : existing.resolved_at });
  const filter = new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${familyId}` }); const [updated] = await supabaseRest<Array<Record<string, unknown>>>(`${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes) });
  await audit(familyId, userId, `household_${entity}_${status}`, table, id); return Response.json({ record: updated });
}

async function audit(familyId: string, userId: string, action: string, entityType: string, entityId: string) { await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata: { module: "household" } }) }); }
