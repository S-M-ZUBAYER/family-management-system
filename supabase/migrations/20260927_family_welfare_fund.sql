-- Family Welfare Fund: transparent contributions, controlled expenses and confidential assistance.

create table if not exists public.welfare_funds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'general'
    check (category in ('general', 'emergency', 'medical', 'education', 'charity')),
  target_amount numeric(14,2) not null default 0 check (target_amount >= 0),
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'closed')),
  visibility text not null default 'family'
    check (visibility in ('family', 'admins')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welfare_funds_family_status_idx
  on public.welfare_funds(family_id, status, created_at desc);

create table if not exists public.welfare_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid references public.welfare_funds(id) on delete set null,
  requester_user_id text not null,
  requester_name text not null,
  request_type text not null default 'other'
    check (request_type in ('medical', 'education', 'emergency', 'livelihood', 'charity', 'other')),
  title text not null,
  description text not null,
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  approved_amount numeric(14,2) not null default 0 check (approved_amount >= 0),
  urgency text not null default 'normal'
    check (urgency in ('normal', 'high', 'critical')),
  visibility text not null default 'admins'
    check (visibility in ('admins', 'family')),
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'cancelled')),
  admin_note text,
  reviewed_by_user_id text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_amount <= requested_amount)
);

create index if not exists welfare_requests_family_status_idx
  on public.welfare_requests(family_id, status, urgency, created_at desc);

create index if not exists welfare_requests_owner_idx
  on public.welfare_requests(family_id, requester_user_id, created_at desc);

create table if not exists public.welfare_contributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid not null references public.welfare_funds(id) on delete restrict,
  contributor_user_id text,
  contributor_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  contribution_date date not null default current_date,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank', 'mobile', 'card', 'other')),
  reference text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'refunded')),
  submitted_by_user_id text not null,
  approved_by_user_id text,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welfare_contributions_family_date_idx
  on public.welfare_contributions(family_id, status, contribution_date desc);

create index if not exists welfare_contributions_fund_idx
  on public.welfare_contributions(fund_id, status, contribution_date desc);

create table if not exists public.welfare_expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid not null references public.welfare_funds(id) on delete restrict,
  linked_request_id uuid references public.welfare_requests(id) on delete set null,
  title text not null,
  beneficiary_name text,
  category text not null default 'other'
    check (category in ('medical', 'education', 'emergency', 'charity', 'operations', 'other')),
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank', 'mobile', 'card', 'other')),
  reference text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'rejected')),
  requested_by_user_id text not null,
  approved_by_user_id text,
  approved_by_name text,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welfare_expenses_family_date_idx
  on public.welfare_expenses(family_id, status, expense_date desc);

create index if not exists welfare_expenses_fund_idx
  on public.welfare_expenses(fund_id, status, expense_date desc);

create table if not exists public.welfare_pledges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid not null references public.welfare_funds(id) on delete cascade,
  auth_user_id text not null,
  member_name text not null,
  frequency text not null default 'monthly'
    check (frequency in ('monthly', 'quarterly', 'yearly', 'one_time')),
  amount numeric(14,2) not null check (amount > 0),
  start_date date not null default current_date,
  next_due_date date,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welfare_pledges_family_due_idx
  on public.welfare_pledges(family_id, status, next_due_date);

create index if not exists welfare_pledges_owner_idx
  on public.welfare_pledges(family_id, auth_user_id, status);

create table if not exists public.welfare_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('fund', 'contribution', 'expense', 'request')),
  entity_id uuid not null,
  document_type text not null default 'other'
    check (document_type in ('receipt', 'invoice', 'approval', 'evidence', 'other')),
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  title text not null,
  visibility text not null default 'admins'
    check (visibility in ('admins', 'family')),
  uploaded_by_user_id text not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists welfare_documents_entity_idx
  on public.welfare_documents(family_id, entity_type, entity_id, created_at desc);

alter table public.welfare_funds enable row level security;
alter table public.welfare_contributions enable row level security;
alter table public.welfare_expenses enable row level security;
alter table public.welfare_requests enable row level security;
alter table public.welfare_pledges enable row level security;
alter table public.welfare_documents enable row level security;
