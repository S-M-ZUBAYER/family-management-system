import type { NotificationCategory, NotificationPreferences, NotificationSeverity } from "./notification-types";

type NotificationForViewer = {
  recipient_user_id: string | null;
  category: NotificationCategory;
  severity: NotificationSeverity;
  scheduled_for: string;
  expires_at: string | null;
};

const categoryPreference: Partial<Record<NotificationCategory, keyof NotificationPreferences>> = {
  announcement: "family_announcements",
  membership: "membership_updates",
  event: "event_reminders",
  qurbani: "qurbani_updates",
  health: "health_reminders",
  finance: "finance_reminders",
  governance: "governance_updates",
  household: "household_updates",
};

export function notificationVisibleToUser(
  notification: NotificationForViewer,
  userId: string,
  preferences: NotificationPreferences,
  now: number,
) {
  if (notification.recipient_user_id && notification.recipient_user_id !== userId) return false;
  const scheduled = Date.parse(notification.scheduled_for);
  if (!Number.isFinite(scheduled) || scheduled > now) return false;
  if (notification.expires_at) {
    const expiry = Date.parse(notification.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now) return false;
  }

  // Critical alerts remain visible even if ordinary in-app categories are muted.
  if (notification.severity === "urgent" || notification.category === "system") return true;
  if (!preferences.in_app_enabled) return false;
  const setting = categoryPreference[notification.category];
  return setting ? preferences[setting] === true : false;
}

export function safeNotificationActionPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const url = new URL(value, "https://family.invalid");
  return url.origin === "https://family.invalid" ? `${url.pathname}${url.search}${url.hash}` : null;
}
