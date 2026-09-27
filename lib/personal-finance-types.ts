export type FinanceAccount = {
  id: string;
  name: string;
  account_type: "cash" | "bank" | "mobile" | "savings" | "credit";
  opening_balance: number | string;
  currency: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type FinanceTransaction = {
  id: string;
  account_id: string;
  direction: "income" | "expense";
  category: string;
  amount: number | string;
  transaction_date: string;
  payment_method: "cash" | "bank" | "mobile" | "card" | "other";
  reference: string | null;
  notes: string | null;
  is_recurring: boolean;
  created_at: string;
};

export type FinanceBudget = {
  id: string;
  budget_month: string;
  category: string;
  limit_amount: number | string;
  alert_percent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceDebt = {
  id: string;
  debt_type: "lent" | "borrowed";
  counterparty: string;
  principal_amount: number | string;
  settled_amount: number | string;
  due_date: string | null;
  status: "open" | "partial" | "settled" | "overdue";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceBill = {
  id: string;
  title: string;
  category: string;
  amount: number | string;
  due_date: string;
  recurrence: "none" | "monthly" | "yearly";
  status: "pending" | "paid" | "skipped";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceGoal = {
  id: string;
  title: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string | null;
  status: "active" | "completed" | "paused";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceRecordKind =
  | "account"
  | "transaction"
  | "budget"
  | "debt"
  | "bill"
  | "goal";

export type FinancePayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { displayName: string; email: string };
  accounts?: FinanceAccount[];
  transactions?: FinanceTransaction[];
  budgets?: FinanceBudget[];
  debts?: FinanceDebt[];
  bills?: FinanceBill[];
  goals?: FinanceGoal[];
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};
