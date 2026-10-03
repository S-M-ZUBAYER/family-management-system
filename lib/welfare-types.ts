export type WelfareFund = {
  id: string;
  name: string;
  description: string | null;
  category: "general" | "emergency" | "medical" | "education" | "charity";
  target_amount: number | string;
  opening_balance: number | string;
  status: "active" | "paused" | "closed";
  visibility: "family" | "admins";
  created_at: string;
  updated_at: string;
};

export type WelfareContribution = {
  id: string;
  fund_id: string;
  contributor_user_id: string | null;
  contributor_name: string;
  amount: number | string;
  contribution_date: string;
  payment_method: "cash" | "bank" | "mobile" | "card" | "other";
  reference: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "refunded";
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  is_mine: boolean;
};

export type WelfareExpense = {
  id: string;
  fund_id: string;
  linked_request_id: string | null;
  title: string;
  beneficiary_name: string | null;
  category: "medical" | "education" | "emergency" | "charity" | "operations" | "other";
  amount: number | string;
  expense_date: string;
  payment_method: "cash" | "bank" | "mobile" | "card" | "other";
  reference: string | null;
  notes: string | null;
  status: "pending" | "approved" | "paid" | "rejected";
  approved_by_name: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type WelfareRequest = {
  id: string;
  fund_id: string | null;
  requester_user_id: string;
  requester_name: string;
  request_type: "medical" | "education" | "emergency" | "livelihood" | "charity" | "other";
  title: string;
  description: string;
  requested_amount: number | string;
  approved_amount: number | string;
  urgency: "normal" | "high" | "critical";
  visibility: "admins" | "family";
  status: "submitted" | "under_review" | "approved" | "rejected" | "disbursed" | "cancelled";
  admin_note: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

export type WelfarePledge = {
  id: string;
  fund_id: string;
  auth_user_id: string;
  member_name: string;
  frequency: "monthly" | "quarterly" | "yearly" | "one_time";
  amount: number | string;
  start_date: string;
  next_due_date: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

export type WelfareDocument = {
  id: string;
  entity_type: "fund" | "contribution" | "expense" | "request";
  entity_id: string;
  document_type: "receipt" | "invoice" | "approval" | "evidence" | "other";
  title: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  visibility: "admins" | "family";
  uploaded_by_name: string;
  created_at: string;
  can_view: boolean;
  is_mine: boolean;
};

export type WelfarePayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  funds?: WelfareFund[];
  contributions?: WelfareContribution[];
  expenses?: WelfareExpense[];
  requests?: WelfareRequest[];
  pledges?: WelfarePledge[];
  documents?: WelfareDocument[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
