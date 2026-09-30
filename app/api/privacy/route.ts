import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canViewAdministration, getActiveFamilyMembership } from "@/lib/family-access";
import type { DirectoryVisibility, PrivacyConsent, PrivacyPayload, PrivacyPolicy, PrivacyRequest, PrivacyRequestStatus, PrivacyRequestType } from "@/lib/privacy-types";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestTypes = ["access_export", "correction", "deletion", "restriction"] as const;
const requestStatuses = ["pending", "in_review", "approved", "completed", "rejected", "cancelled"] as const;
const visibilityValues = ["family", "admins_only", "hidden"] as const;
const terminalStatuses: PrivacyRequestStatus[] = ["completed", "rejected", "cancelled"];
const allowedTransitions: Record<PrivacyRequestStatus, PrivacyRequestStatus[]> = { pending: ["in_review", "approved", "rejected"], in_review: ["approved", "rejected"], approved: ["completed", "rejected"], completed: [], rejected: [], cancelled: [] };
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const integer = (value: unknown, fallback: number, min: number, max: number) => { const parsed = Number(value); return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; };
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T) { const candidate = text(value, 40); return candidate && allowed.includes(candidate as T) ? candidate as T : fallback; }

const defaultConsent: PrivacyConsent = { directory_visibility: "family", show_email_to_family: false, show_phone_to_family: false, allow_emergency_access: true, allow_family_analytics: false, consent_version: "1.0", consented_at: null };
const defaultPolicy: PrivacyPolicy = { privacy_notice_bn: null, privacy_notice_en: null, record_retention_days: 3650, inactive_member_retention_days: 730, allow_member_data_requests: true, updated_at: null };

function errorResponse(error: unknown, label: string) {
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection is not configured." }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(label, error.status, error.message); return Response.json({ error: "Privacy data is temporarily unavailable." }, { status: 502 }); }
  console.error(label, error); return Response.json({ error: "The privacy request could not be completed." }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "Complete family setup first." }, { status: 409 });
    const familyFilter = `eq.${membership.family_id}`, canManage = canViewAdministration(membership.role);
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${new URLSearchParams({ select: "id,name_bn,name_en", id: familyFilter, limit: "1" })}`))[0];
    let consent = defaultConsent, policy = defaultPolicy, requests: PrivacyRequest[] = [], migrationRequired = false;
    try {
      const storedConsent = (await supabaseRest<PrivacyConsent[]>(`family_privacy_consents?${new URLSearchParams({ select: "directory_visibility,show_email_to_family,show_phone_to_family,allow_emergency_access,allow_family_analytics,consent_version,consented_at", family_id: familyFilter, user_id: `eq.${user.userId}`, limit: "1" })}`))[0];
      if (storedConsent) consent = { ...defaultConsent, ...storedConsent };
      const storedPolicy = (await supabaseRest<PrivacyPolicy[]>(`family_privacy_settings?${new URLSearchParams({ select: "privacy_notice_bn,privacy_notice_en,record_retention_days,inactive_member_retention_days,allow_member_data_requests,updated_at", family_id: familyFilter, limit: "1" })}`))[0];
      if (storedPolicy) policy = { ...defaultPolicy, ...storedPolicy };
      const query = new URLSearchParams({ select: "id,request_type,subject,details,status,requested_by_user_id,requested_by_name,admin_response,assigned_to_name,resolved_at,created_at,updated_at", family_id: familyFilter, order: "created_at.desc", limit: "500" });
      if (!canManage) query.set("requested_by_user_id", `eq.${user.userId}`);
      const rows = await supabaseRest<Array<Omit<PrivacyRequest, "is_mine">>>(`family_data_requests?${query}`);
      requests = rows.map((row) => ({ ...row, is_mine: row.requested_by_user_id === user.userId }));
    } catch (error) { if (error instanceof SupabaseRequestError) migrationRequired = true; else throw error; }
    const payload: PrivacyPayload = { family, viewer: { displayName: user.displayName, role: membership.role }, consent, policy, requests, permissions: { canManage }, migrationRequired };
    return Response.json(payload);
  } catch (error) { return errorResponse(error, "Unable to load privacy center"); }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, action = text(body.action, 40);
    if (action === "save_consent") {
      const record = { family_id: membership.family_id, user_id: user.userId, directory_visibility: choice(body.directoryVisibility, visibilityValues, "family") as DirectoryVisibility, show_email_to_family: bool(body.showEmailToFamily, false), show_phone_to_family: bool(body.showPhoneToFamily, false), allow_emergency_access: bool(body.allowEmergencyAccess, true), allow_family_analytics: bool(body.allowFamilyAnalytics, false), consent_version: "1.0", consented_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      await supabaseRest("family_privacy_consents?on_conflict=family_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
      await audit(membership.family_id, user.userId, "privacy_consent_updated", null, { visibility: record.directory_visibility });
      return Response.json({ message: "Privacy choices saved." });
    }
    if (action === "save_policy") {
      if (!canViewAdministration(membership.role)) return Response.json({ error: "Family administration access is required." }, { status: 403 });
      const record = { family_id: membership.family_id, privacy_notice_bn: text(body.privacyNoticeBn, 12000), privacy_notice_en: text(body.privacyNoticeEn, 12000), record_retention_days: integer(body.recordRetentionDays, 3650, 30, 36500), inactive_member_retention_days: integer(body.inactiveMemberRetentionDays, 730, 30, 36500), allow_member_data_requests: bool(body.allowMemberDataRequests, true), updated_by_user_id: user.userId, updated_by_name: user.displayName, updated_at: new Date().toISOString() };
      await supabaseRest("family_privacy_settings?on_conflict=family_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
      await audit(membership.family_id, user.userId, "privacy_policy_updated", membership.family_id, { record_retention_days: record.record_retention_days });
      return Response.json({ message: "Family privacy policy saved." });
    }
    if (action !== "create_request") return Response.json({ error: "Unsupported privacy action." }, { status: 400 });
    const policy = (await supabaseRest<Array<{ allow_member_data_requests: boolean }>>(`family_privacy_settings?${new URLSearchParams({ select: "allow_member_data_requests", family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (policy?.allow_member_data_requests === false) return Response.json({ error: "New data-rights requests are currently paused by the family administrator." }, { status: 403 });
    const requestType = choice(body.requestType, requestTypes, "access_export") as PrivacyRequestType, subject = text(body.subject, 180), details = text(body.details, 5000);
    if (!subject || !details) return Response.json({ error: "Subject and details are required." }, { status: 400 });
    const duplicate = await supabaseRest<Array<{ id: string }>>(`family_data_requests?${new URLSearchParams({ select: "id", family_id: `eq.${membership.family_id}`, requested_by_user_id: `eq.${user.userId}`, request_type: `eq.${requestType}`, status: "in.(pending,in_review,approved)", limit: "1" })}`);
    if (duplicate.length) return Response.json({ error: "You already have an active request of this type." }, { status: 409 });
    const created = await supabaseRest<Array<{ id: string }>>("family_data_requests", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ family_id: membership.family_id, request_type: requestType, subject, details, status: "pending", requested_by_user_id: user.userId, requested_by_name: user.displayName }) });
    const id = created[0]?.id; if (!id) throw new Error("Privacy request was not created.");
    await audit(membership.family_id, user.userId, "privacy_request_created", id, { request_type: requestType });
    return Response.json({ id, message: "Data-rights request submitted." }, { status: 201 });
  } catch (error) { return errorResponse(error, "Unable to save privacy data"); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser(); if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId); if (!membership) return Response.json({ error: "Active family membership is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, id = text(body.id, 40), action = text(body.action, 40);
    if (!id || !uuid.test(id)) return Response.json({ error: "A valid privacy request is required." }, { status: 400 });
    const existing = (await supabaseRest<Array<{ id: string; status: PrivacyRequestStatus; requested_by_user_id: string }>>(`family_data_requests?${new URLSearchParams({ select: "id,status,requested_by_user_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!existing) return Response.json({ error: "Privacy request was not found." }, { status: 404 });
    if (action === "cancel_request") {
      if (existing.requested_by_user_id !== user.userId || existing.status !== "pending") return Response.json({ error: "Only your pending request can be cancelled." }, { status: 403 });
      await updateRequest(id, membership.family_id, { status: "cancelled", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      await audit(membership.family_id, user.userId, "privacy_request_cancelled", id, {});
      return Response.json({ message: "Privacy request cancelled." });
    }
    if (action !== "review_request" || !canViewAdministration(membership.role)) return Response.json({ error: "Family administration access is required." }, { status: 403 });
    if (terminalStatuses.includes(existing.status)) return Response.json({ error: "A completed, rejected, or cancelled request cannot be changed." }, { status: 409 });
    const nextStatus = choice(body.status, requestStatuses, existing.status) as PrivacyRequestStatus;
    if (nextStatus !== existing.status && !allowedTransitions[existing.status].includes(nextStatus)) return Response.json({ error: "That privacy request status transition is not allowed." }, { status: 409 });
    const update = { status: nextStatus, admin_response: text(body.adminResponse, 5000), assigned_to_name: text(body.assignedToName, 180), resolved_at: ["completed", "rejected"].includes(nextStatus) ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
    await updateRequest(id, membership.family_id, update);
    await audit(membership.family_id, user.userId, "privacy_request_reviewed", id, { status: nextStatus });
    return Response.json({ message: "Privacy request updated." });
  } catch (error) { return errorResponse(error, "Unable to update privacy request"); }
}

async function updateRequest(id: string, familyId: string, update: Record<string, unknown>) {
  await supabaseRest(`family_data_requests?${new URLSearchParams({ id: `eq.${id}`, family_id: `eq.${familyId}` })}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(update) });
}
async function audit(familyId: string, userId: string, action: string, entityId: string | null, metadata: Record<string, unknown>) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: "privacy", entity_id: entityId, metadata: { module: "privacy", ...metadata } }) });
}
