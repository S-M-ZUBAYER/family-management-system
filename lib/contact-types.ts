export type ContactTicketStatus = "open" | "in_progress" | "waiting_member" | "resolved" | "closed";
export type ContactTicketPriority = "normal" | "high" | "urgent";

export type ContactTicket = {
  id: string;
  category: "general" | "family_admin" | "technical" | "privacy" | "event" | "qurbani" | "finance" | "health" | "other";
  subject: string;
  message: string;
  preferred_contact: string | null;
  priority: ContactTicketPriority;
  status: ContactTicketStatus;
  admin_response: string | null;
  assigned_to_name: string | null;
  created_by_user_id: string;
  created_by_name: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

export type ContactPayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; email: string; role: string };
  tickets?: ContactTicket[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
