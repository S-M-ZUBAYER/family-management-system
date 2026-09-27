export type Household = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  notes: string | null;
  status: "active" | "archived";
  created_at: string;
};

export type ShoppingList = {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  budget_amount: number | string;
  needed_by: string | null;
  status: "active" | "completed" | "archived";
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

export type ShoppingItem = {
  id: string;
  list_id: string;
  item_name: string;
  category: "grocery" | "medicine" | "household" | "baby" | "personal" | "other";
  quantity: number | string;
  unit: string;
  estimated_cost: number | string;
  actual_cost: number | string;
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to_name: string | null;
  status: "needed" | "purchased" | "unavailable" | "cancelled";
  purchased_by_name: string | null;
  purchased_at: string | null;
  notes: string | null;
  created_at: string;
};

export type UtilityBill = {
  id: string;
  household_id: string;
  title: string;
  category: "electricity" | "gas" | "water" | "internet" | "phone" | "rent" | "maintenance" | "other";
  provider: string | null;
  account_number: string | null;
  billing_month: string;
  amount: number | string;
  due_date: string;
  recurrence: "none" | "monthly" | "quarterly" | "yearly";
  status: "pending" | "paid" | "overdue" | "skipped";
  payment_method: "cash" | "bank" | "mobile" | "card" | "other" | null;
  reference: string | null;
  paid_by_name: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HouseholdTask = {
  id: string;
  household_id: string;
  title: string;
  category: "cleaning" | "cooking" | "shopping" | "care" | "repair" | "bill" | "other";
  assigned_to_name: string | null;
  due_at: string | null;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  priority: "low" | "normal" | "high" | "urgent";
  status: "todo" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceContact = {
  id: string;
  household_id: string | null;
  name: string;
  service_type: "electrician" | "plumber" | "cleaner" | "driver" | "technician" | "caregiver" | "security" | "other";
  phone: string;
  alternate_phone: string | null;
  address: string | null;
  rating: number | string;
  is_trusted: boolean;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
};

export type MaintenanceRequest = {
  id: string;
  household_id: string;
  service_contact_id: string | null;
  title: string;
  description: string;
  category: "electrical" | "plumbing" | "appliance" | "building" | "cleaning" | "security" | "other";
  urgency: "normal" | "high" | "critical";
  estimated_cost: number | string;
  actual_cost: number | string;
  assigned_vendor_name: string | null;
  scheduled_at: string | null;
  status: "reported" | "approved" | "scheduled" | "in_progress" | "completed" | "cancelled";
  reported_by_name: string;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HouseholdDocument = {
  id: string;
  entity_type: "shopping_list" | "bill" | "maintenance";
  entity_id: string;
  document_type: "receipt" | "invoice" | "warranty" | "quotation" | "other";
  title: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_name: string;
  created_at: string;
};

export type HouseholdPayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; role: string };
  households?: Household[];
  shoppingLists?: ShoppingList[];
  shoppingItems?: ShoppingItem[];
  bills?: UtilityBill[];
  tasks?: HouseholdTask[];
  contacts?: ServiceContact[];
  maintenance?: MaintenanceRequest[];
  documents?: HouseholdDocument[];
  permissions?: { canManage: boolean };
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
