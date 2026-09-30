export type NotificationCategory =
  | "announcement"
  | "membership"
  | "event"
  | "qurbani"
  | "health"
  | "finance"
  | "governance"
  | "household"
  | "system";

export type NotificationSeverity = "info" | "success" | "warning" | "urgent";
export type NotificationDigest = "instant" | "daily" | "weekly" | "off";

export type FamilyNotification = {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title_bn: string | null;
  title_en: string | null;
  message_bn: string | null;
  message_en: string | null;
  action_url: string | null;
  scheduled_for: string;
  expires_at: string | null;
  created_by_name: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

export type NotificationPreferences = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  family_announcements: boolean;
  membership_updates: boolean;
  event_reminders: boolean;
  qurbani_updates: boolean;
  health_reminders: boolean;
  finance_reminders: boolean;
  governance_updates: boolean;
  household_updates: boolean;
  digest_frequency: NotificationDigest;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

export type NotificationPayload = {
  code?: string;
  error?: string;
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  notifications?: FamilyNotification[];
  preferences?: NotificationPreferences;
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
};
