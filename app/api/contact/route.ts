import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canViewAdministration, getActiveFamilyMembership } from "@/lib/family-access";
import type { ContactPayload, ContactTicket, ContactTicketPriority, ContactTicketStatus } from "@/lib/contact-types";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories = ["general", "family_admin", "technical", "privacy", "event", "qurbani", "finance", "health", "other"] as const;
const statuses = ["open", "in_progress", "waiting_member", "resolved", "closed"] as const;
const priorities = ["normal", "high", "urgent"] as const;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T) { const candidate = text(value, 40); return candidate && allowed.includes(candidate as T) ? candidate as T : fallback; }
async function readAllTickets(query: URLSearchParams): Promise<Array<Omit<ContactTicket, "is_mine">>> {
  return collectPaginatedRows(
    (offset, limit) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set("offset", String(offset));
      pageQuery.set("limit", String(limit));
      return supabaseRest<Array<Omit<ContactTicket, "is_mine">>>(`family_contact_tickets?${pageQuery}`);
    },
    { pageSize: 500, maxRows: 20000 },
  );
}
function errorResponse(error: unknown, label: string) {
  if (error instanceof PaginatedRowLimitError) return Response.json({ code: "CONTACT_ROW_LIMIT", maxRows: error.maxRows, error: `Contact & Support history exceeds ${error.maxRows} rows. No partial data was shown or exported; contact support for a paged export.` }, { status: 413 });
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection is not configured." }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(label, error.status, error.message); return Response.json({ error: "Contact support data is temporarily unavailable." }, { status: 502 }); }
  console.error(label, error); return Response.json({ error: "The contact support request could not be completed." }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "Complete family setup first." }, { status: 409 });
    const canManage = canViewAdministration(membership.role), familyFilter = `eq.${membership.family_id}`;
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${new URLSearchParams({ select: "id,name_bn,name_en", id: familyFilter, limit: "1" })}`))[0];
    let rows: Array<Omit<ContactTicket, "is_mine">> = [], migrationRequired = false;
    try {
      const query = new URLSearchParams({ select: "id,category,subject,message,preferred_contact,priority,status,admin_response,assigned_to_name,created_by_user_id,created_by_name,resolved_at,created_at,updated_at", family_id: familyFilter, order: "status.asc,priority.desc,created_at.desc,id.asc" });
      if (!canManage) query.set("created_by_user_id", `eq.${user.userId}`);
      rows = await readAllTickets(query);
    } catch (error) { if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true; else throw error; }
    const payload: ContactPayload = { family, viewer: { displayName: user.displayName, email: user.email, role: membership.role }, tickets: rows.map((row) => ({ ...row, is_mine: row.created_by_user_id === user.userId })), permissions: { canManage }, migrationRequired };
    return Response.json(payload);
  } catch (error) { return errorResponse(error, "Unable to load contact support"); }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, subject = text(body.subject, 180), message = text(body.message, 5000);
    if (!subject || !message) return Response.json({ error: "Subject and message are required." }, { status: 400 });
    const category = choice(body.category, categories, "general");
    const created = await supabaseRest<Array<{ id: string }>>("family_contact_tickets", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, category, subject, message, preferred_contact: text(body.preferredContact, 240), priority: choice(body.priority, priorities, "normal"), status: "open", created_by_user_id: user.userId, created_by_name: user.displayName }) });
    const id = created[0]?.id; if (!id) throw new Error("Ticket was not created.");
    await audit(membership.family_id, user.userId, "create", id, { category });
    return Response.json({ id, message: "Support request submitted." }, { status: 201 });
  } catch (error) { return errorResponse(error, "Unable to create contact ticket"); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, id = text(body.id, 40);
    if (!id || !uuid.test(id)) return Response.json({ error: "A valid support request is required." }, { status: 400 });
    const canManage = canViewAdministration(membership.role);
    const query = new URLSearchParams({ select: "id,created_by_user_id,status", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" });
    const ticket = (await supabaseRest<Array<{ id: string; created_by_user_id: string; status: ContactTicketStatus }>>(`family_contact_tickets?${query}`))[0];
    if (!ticket) return Response.json({ error: "Support request was not found." }, { status: 404 });
    const nextStatus = choice(body.status, statuses, ticket.status);
    if (!canManage && (ticket.created_by_user_id !== user.userId || !["closed", "open"].includes(nextStatus))) return Response.json({ error: "You cannot update this support request." }, { status: 403 });
    const update: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString(), resolved_at: ["resolved", "closed"].includes(nextStatus) ? new Date().toISOString() : null };
    if (canManage) { update.priority = choice(body.priority, priorities, "normal") as ContactTicketPriority; update.admin_response = text(body.adminResponse, 5000); update.assigned_to_name = text(body.assignedToName, 180); }
    const filter = new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${membership.family_id}` });
    await supabaseRest(`family_contact_tickets?${filter}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(update) });
    await audit(membership.family_id, user.userId, "update", id, { status: nextStatus });
    return Response.json({ message: "Support request updated." });
  } catch (error) { return errorResponse(error, "Unable to update contact ticket"); }
}

async function audit(familyId: string, userId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: "contact_ticket", entity_id: entityId, metadata: { module: "contact", ...metadata } }) });
}
