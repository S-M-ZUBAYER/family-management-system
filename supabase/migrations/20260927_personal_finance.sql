-- Private personal finance, budget, debt, bill and savings-goal records.
-- Every API query is scoped by both family_id and auth_user_id.

create table if not exists public.personal_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  name text not null,
  account_type text not null default 'cash'
    check (account_type in ('cash', 'bank', 'mobile', 'savings', 'credit')),
  opening_balance numeric(14,2) not null default 0,
  currency text not null default 'BDT',
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_finance_accounts_owner_idx
  on public.personal_finance_accounts(family_id, auth_user_id, status);

create table if not exists public.personal_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  account_id uuid not null references public.personal_finance_accounts(id) on delete restrict,
  direction text not null check (direction in ('income', 'expense')),
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank', 'mobile', 'card', 'other')),
  reference text,
  notes text,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists personal_finance_transactions_owner_date_idx
  on public.personal_finance_transactions(family_id, auth_user_id, transaction_date desc);

create index if not exists personal_finance_transactions_account_idx
  on public.personal_finance_transactions(account_id, transaction_date desc);

create table if not exists public.personal_finance_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  budget_month date not null,
  category text not null,
  limit_amount numeric(14,2) not null check (limit_amount > 0),
  alert_percent integer not null default 80 check (alert_percent between 1 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, auth_user_id, budget_month, category)
);

create index if not exists personal_finance_budgets_owner_month_idx
  on public.personal_finance_budgets(family_id, auth_user_id, budget_month desc);

create table if not exists public.personal_finance_debts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  debt_type text not null check (debt_type in ('lent', 'borrowed')),
  counterparty text not null,
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  settled_amount numeric(14,2) not null default 0 check (settled_amount >= 0),
  due_date date,
  status text not null default 'open'
    check (status in ('open', 'partial', 'settled', 'overdue')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (settled_amount <= principal_amount)
);

create index if not exists personal_finance_debts_owner_idx
  on public.personal_finance_debts(family_id, auth_user_id, status, due_date);

create table if not exists public.personal_finance_bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  title text not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'monthly', 'yearly')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'skipped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_finance_bills_owner_due_idx
  on public.personal_finance_bills(family_id, auth_user_id, status, due_date);

create table if not exists public.personal_finance_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  title text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date,
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_finance_goals_owner_idx
  on public.personal_finance_goals(family_id, auth_user_id, status, target_date);

alter table public.personal_finance_accounts enable row level security;
alter table public.personal_finance_transactions enable row level security;
alter table public.personal_finance_budgets enable row level security;
alter table public.personal_finance_debts enable row level security;
alter table public.personal_finance_bills enable row level security;
alter table public.personal_finance_goals enable row level security;
