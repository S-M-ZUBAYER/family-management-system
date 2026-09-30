import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageNotices, getActiveFamilyMembership } from "@/lib/family-access";
import type { FamilyNotification, NotificationCategory, NotificationDigest, NotificationPayload, NotificationPreferences, NotificationSeverity } from "@/lib/notification-types";
import { notificationVisibleToUser, safeNotificationActionPath } from "@/lib/notification-visibility";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories = ["announcement", "membership", "event", "qurbani", "health", "finance", "governance", "household", "system"] as const;
const severities = ["info", "success", "warning", "urgent"] as const;
const digests = ["instant", "daily", "weekly", "off"] as const;
const stateActions = ["mark_read", "mark_unread", "archive", "restore"] as const;
const preferenceKeys = ["in_app_enabled", "family_announcements", "membership_updates", "event_reminders", "qurbani_updates", "health_reminders", "finance_reminders", "governance_updates", "household_updates"] as const;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T) { const candidate = text(value, 40); return candidate && allowed.includes(candidate as T) ? candidate as T : fallback; }

const defaultPreferences: NotificationPreferences = {
  in_app_enabled: true, email_enabled: false, sms_enabled: false, push_enabled: false,
  family_announcements: true, membership_updates: true, event_reminders: true, qurbani_updates: true,
  health_reminders: true, finance_reminders: true, governance_updates: true, household_updates: true,
  digest_frequency: "instant", quiet_hours_start: null, quiet_hours_end: null, timezone: "Asia/Dhaka",
};

function errorResponse(error: unknown, label: string) {
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection is not configured." }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(label, error.status, error.message); return Response.json({ error: "Notification data is temporarily unavailable." }, { status: 502 }); }
  console.error(label, error); return Response.json({ error: "The notification request could not be completed." }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "Complete family setup first." }, { status: 409 });
    const familyFilter = `eq.${membership.family_id}`;
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${new URLSearchParams({ select: "id,name_bn,name_en", id: familyFilter, limit: "1" })}`))[0];
    let notifications: FamilyNotification[] = [], preferences = defaultPreferences, migrationRequired = false;
    try {
      const now = Date.now();
      const stored = (await supabaseRest<NotificationPreferences[]>(`family_notification_preferences?${new URLSearchParams({ select: "in_app_enabled,email_enabled,sms_enabled,push_enabled,family_announcements,membership_updates,event_reminders,qurbani_updates,health_reminders,finance_reminders,governance_updates,household_updates,digest_frequency,quiet_hours_start,quiet_hours_end,timezone", family_id: familyFilter, user_id: `eq.${user.userId}`, limit: "1" })}`))[0];
      if (stored) preferences = { ...defaultPreferences, ...stored };
      const rows = await supabaseRest<Array<Omit<FamilyNotification, "read_at" | "archived_at"> & { recipient_user_id: string | null }>>(`family_notifications?${new URLSearchParams({ select: "id,recipient_user_id,category,severity,title_bn,title_en,message_bn,message_en,action_url,scheduled_for,expires_at,created_by_name,created_at", family_id: familyFilter, scheduled_for: `lte.${new Date(now).toISOString()}`, order: "scheduled_for.desc", limit: "500" })}`);
      const eligible = rows.filter((row) => notificationVisibleToUser(row, user.userId, preferences, now));
      const states = await supabaseRest<Array<{ notification_id: string; read_at: string | null; archived_at: string | null }>>(`family_notification_states?${new URLSearchParams({ select: "notification_id,read_at,archived_at", family_id: familyFilter, user_id: `eq.${user.userId}`, limit: "1000" })}`);
      const byId = new Map(states.map((state) => [state.notification_id, state]));
      notifications = eligible.map((row) => ({ id: row.id, category: row.category, severity: row.severity, title_bn: row.title_bn, title_en: row.title_en, message_bn: row.message_bn, message_en: row.message_en, action_url: safeNotificationActionPath(row.action_url), scheduled_for: row.scheduled_for, expires_at: row.expires_at, created_by_name: row.created_by_name, created_at: row.created_at, read_at: byId.get(row.id)?.read_at ?? null, archived_at: byId.get(row.id)?.archived_at ?? null }));
    } catch (error) { if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true; else throw error; }
    const payload: NotificationPayload = { family, viewer: { displayName: user.displayName, role: membership.role }, notifications, preferences, permissions: { canManage: canManageNotices(membership.role) }, migrationRequired };
    return Response.json(payload);
  } catch (error) { return errorResponse(error, "Unable to load notifications"); }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40);
    if (action === "save_preferences") {
      const record: Record<string, unknown> = { family_id: membership.family_id, user_id: user.userId, email_enabled: false, sms_enabled: false, push_enabled: false, digest_frequency: choice(body.digestFrequency, digests, "instant") as NotificationDigest, quiet_hours_start: text(body.quietHoursStart, 8), quiet_hours_end: text(body.quietHoursEnd, 8), timezone: text(body.timezone, 80) ?? "Asia/Dhaka", updated_at: new Date().toISOString() };
      for (const key of preferenceKeys) record[key] = bool(body[key], true);
      await supabaseRest("family_notification_preferences?on_conflict=family_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
      await audit(membership.family_id, user.userId, "update_preferences", null, { digest: record.digest_frequency });
      return Response.json({ message: "Notification preferences saved." });
    }
    if (action !== "create_notification") return Response.json({ error: "Unsupported notification action." }, { status: 400 });
    if (!canManageNotices(membership.role)) return Response.json({ error: "Only a family manager can publish notifications." }, { status: 403 });
    const titleBn = text(body.titleBn, 180), titleEn = text(body.titleEn, 180), messageBn = text(body.messageBn, 3000), messageEn = text(body.messageEn, 3000);
    if (!titleBn && !titleEn) return Response.json({ error: "At least one notification title is required." }, { status: 400 });
    const actionUrl = text(body.actionUrl, 400);
    if (actionUrl && !safeNotificationActionPath(actionUrl)) return Response.json({ error: "Action link must be a safe internal path." }, { status: 400 });
    const scheduledInput = text(body.scheduledFor, 40);
    const expiryInput = text(body.expiresAt, 40);
    const scheduledTime = scheduledInput ? Date.parse(scheduledInput) : Date.now();
    const expiryTime = expiryInput ? Date.parse(expiryInput) : null;
    if (!Number.isFinite(scheduledTime) || (expiryTime !== null && (!Number.isFinite(expiryTime) || expiryTime <= scheduledTime))) {
      return Response.json({ error: "Choose valid dates with expiry after the publish time." }, { status: 400 });
    }
    const record = { family_id: membership.family_id, recipient_user_id: null, category: choice(body.category, categories, "announcement") as NotificationCategory, severity: choice(body.severity, severities, "info") as NotificationSeverity, title_bn: titleBn, title_en: titleEn, message_bn: messageBn, message_en: messageEn, action_url: safeNotificationActionPath(actionUrl), scheduled_for: new Date(scheduledTime).toISOString(), expires_at: expiryTime === null ? null : new Date(expiryTime).toISOString(), created_by_user_id: user.userId, created_by_name: user.displayName };
    const created = await supabaseRest<Array<{ id: string }>>("family_notifications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) });
    const id = created[0]?.id; if (!id) throw new Error("Notification was not created.");
    await audit(membership.family_id, user.userId, "create", id, { category: record.category, severity: record.severity });
    return Response.json({ id, message: "Family notification published." }, { status: 201 });
  } catch (error) { return errorResponse(error, "Unable to save notification"); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, id = text(body.id, 40), action = text(body.action, 40);
    if (!id || !uuid.test(id)) return Response.json({ error: "A valid notification is required." }, { status: 400 });
    if (!action || !stateActions.includes(action as typeof stateActions[number])) return Response.json({ error: "A valid notification action is required." }, { status: 400 });
    const row = (await supabaseRest<Array<{ id: string; recipient_user_id: string | null }>>(`family_notifications?${new URLSearchParams({ select: "id,recipient_user_id", id: `eq.${id}`, family_id: `eq.${membership.family_id}`, limit: "1" })}`))[0];
    if (!row || (row.recipient_user_id && row.recipient_user_id !== user.userId)) return Response.json({ error: "Notification was not found." }, { status: 404 });
    const current = (await supabaseRest<Array<{ read_at: string | null; archived_at: string | null }>>(`family_notification_states?${new URLSearchParams({ select: "read_at,archived_at", notification_id: `eq.${id}`, family_id: `eq.${membership.family_id}`, user_id: `eq.${user.userId}`, limit: "1" })}`))[0];
    const next = { notification_id: id, family_id: membership.family_id, user_id: user.userId, read_at: action === "mark_read" ? new Date().toISOString() : action === "mark_unread" ? null : current?.read_at ?? null, archived_at: action === "archive" ? new Date().toISOString() : action === "restore" ? null : current?.archived_at ?? null, updated_at: new Date().toISOString() };
    await supabaseRest("family_notification_states?on_conflict=notification_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(next) });
    return Response.json({ message: "Notification status updated." });
  } catch (error) { return errorResponse(error, "Unable to update notification state"); }
}

async function audit(familyId: string, userId: string, action: string, entityId: string | null, metadata: Record<string, unknown>) {
  await supabaseRest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ family_id: familyId, actor_user_id: userId, action, entity_type: "notification", entity_id: entityId, metadata: { module: "notifications", ...metadata } }) });
}
