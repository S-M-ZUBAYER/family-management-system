export type PrivacyRequestType = "access_export" | "correction" | "deletion" | "restriction";
export type PrivacyRequestStatus = "pending" | "in_review" | "approved" | "completed" | "rejected" | "cancelled";
export type DirectoryVisibility = "family" | "admins_only" | "hidden";

export type PrivacyConsent = {
  directory_visibility: DirectoryVisibility;
  show_email_to_family: boolean;
  show_phone_to_family: boolean;
  allow_emergency_access: boolean;
  allow_family_analytics: boolean;
  consent_version: string;
  consented_at: string | null;
};

export type PrivacyPolicy = {
  privacy_notice_bn: string | null;
  privacy_notice_en: string | null;
  record_retention_days: number;
  inactive_member_retention_days: number;
  allow_member_data_requests: boolean;
  updated_at: string | null;
};

export type PrivacyRequest = {
  id: string;
  request_type: PrivacyRequestType;
  subject: string;
  details: string;
  status: PrivacyRequestStatus;
  requested_by_user_id: string;
  requested_by_name: string;
  admin_response: string | null;
  assigned_to_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

export type PrivacyPayload = {
  code?: string;
  error?: string;
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  consent?: PrivacyConsent;
  policy?: PrivacyPolicy;
  requests?: PrivacyRequest[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
};
