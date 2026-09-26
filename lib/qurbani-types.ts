export type QurbaniCampaignStatus =
  | "planning"
  | "registration"
  | "procurement"
  | "slaughter"
  | "distribution"
  | "settled"
  | "closed";

export type QurbaniCampaign = {
  id: string;
  family_id: string;
  title: string;
  year: number;
  hijri_year: string | null;
  status: QurbaniCampaignStatus;
  registration_deadline: string | null;
  share_price: number | string;
  target_shares: number | string;
  location: string | null;
  slaughter_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QurbaniParticipant = {
  id: string;
  campaign_id: string;
  animal_id: string | null;
  member_name: string;
  phone: string | null;
  share_count: number | string;
  amount_due: number | string;
  amount_paid: number | string;
  status: "pending" | "confirmed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QurbaniAnimal = {
  id: string;
  campaign_id: string;
  tag_code: string;
  animal_type: "cow" | "goat" | "sheep" | "buffalo";
  breed: string | null;
  color: string | null;
  live_weight_kg: number | string;
  estimated_meat_kg: number | string;
  purchase_price: number | string;
  vendor_name: string | null;
  purchase_date: string | null;
  health_status: "pending" | "fit" | "observation" | "rejected";
  vet_notes: string | null;
  transport_cost: number | string;
  feed_cost: number | string;
  status: "shortlisted" | "purchased" | "received" | "slaughtered" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type QurbaniTransaction = {
  id: string;
  campaign_id: string;
  participant_id: string | null;
  animal_id: string | null;
  transaction_type: "collection" | "expense" | "refund";
  category:
    | "share_payment"
    | "animal_purchase"
    | "transport"
    | "feed"
    | "butcher"
    | "logistics"
    | "equipment"
    | "distribution"
    | "misc";
  amount: number | string;
  payment_method: "cash" | "bank" | "mobile" | "other";
  reference: string | null;
  transaction_date: string;
  notes: string | null;
  created_at: string;
};

export type QurbaniVendor = {
  id: string;
  campaign_id: string;
  name: string;
  vendor_type: "animal_seller" | "butcher" | "transport" | "feed" | "equipment" | "other";
  phone: string | null;
  address: string | null;
  agreed_amount: number | string;
  paid_amount: number | string;
  status: "planned" | "confirmed" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QurbaniSchedule = {
  id: string;
  campaign_id: string;
  animal_id: string | null;
  sequence_no: number;
  scheduled_at: string;
  location: string | null;
  butcher_team: string | null;
  status: "scheduled" | "in_progress" | "completed" | "delayed";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QurbaniTask = {
  id: string;
  campaign_id: string;
  title: string;
  category: "procurement" | "finance" | "logistics" | "slaughter" | "distribution" | "cleanup";
  assigned_to: string | null;
  due_at: string | null;
  priority: "normal" | "high" | "urgent";
  status: "todo" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type QurbaniDistribution = {
  id: string;
  campaign_id: string;
  recipient_name: string;
  recipient_type: "participant" | "family" | "relative" | "needy" | "worker" | "other";
  weight_kg: number | string;
  package_count: number;
  collected_at: string | null;
  notes: string | null;
  created_at: string;
};

export type QurbaniPayload = {
  family?: { id: string; name_bn: string; name_en: string };
  campaigns?: QurbaniCampaign[];
  participants?: QurbaniParticipant[];
  animals?: QurbaniAnimal[];
  transactions?: QurbaniTransaction[];
  vendors?: QurbaniVendor[];
  schedules?: QurbaniSchedule[];
  tasks?: QurbaniTask[];
  distributions?: QurbaniDistribution[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};

export type QurbaniRecordKind =
  | "participant"
  | "animal"
  | "transaction"
  | "vendor"
  | "schedule"
  | "task"
  | "distribution";
