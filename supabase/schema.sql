-- Family Management System: PostgreSQL foundation
-- Run this once in the Supabase SQL editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name_bn text not null,
  name_en text not null,
  slug text not null unique,
  join_code text not null unique,
  theme text not null default 'heritage'
    check (theme in ('heritage', 'emerald', 'indigo', 'terracotta')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text,
  name_bn text not null,
  name_en text,
  email text,
  phone text,
  relationship_text text,
  gender text check (gender is null or gender in ('male', 'female', 'other')),
  date_of_birth date,
  blood_group text,
  occupation text,
  city text,
  country text,
  profile_status text not null default 'active'
    check (profile_status in ('active', 'inactive', 'deceased', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists member_profiles_family_auth_user_unique
  on public.member_profiles(family_id, auth_user_id)
  where auth_user_id is not null;

create table if not exists public.family_relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  from_member_id uuid not null references public.member_profiles(id) on delete cascade,
  to_member_id uuid not null references public.member_profiles(id) on delete cascade,
  relationship_type text not null
    check (relationship_type in ('parent', 'spouse', 'guardian')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  check (from_member_id <> to_member_id),
  unique (family_id, from_member_id, to_member_id, relationship_type)
);

create index if not exists family_relationships_family_idx
  on public.family_relationships(family_id, relationship_type);

create table if not exists public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  member_profile_id uuid references public.member_profiles(id) on delete set null,
  role text not null default 'member'
    check (role in ('owner', 'family_admin', 'manager', 'member')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, auth_user_id)
);

create index if not exists family_memberships_auth_user_idx
  on public.family_memberships(auth_user_id, status);

create table if not exists public.family_member_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  requester_user_id text not null,
  requested_name_bn text not null,
  requested_name_en text,
  relationship_text text not null,
  sponsor_name text,
  email text,
  phone text,
  requested_role text not null default 'member'
    check (requested_role in ('member', 'manager')),
  duplicate_hint boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason text,
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists family_member_requests_one_pending_per_user
  on public.family_member_requests(family_id, requester_user_id)
  where status = 'pending';

create index if not exists family_member_requests_admin_queue_idx
  on public.family_member_requests(family_id, status, created_at desc);

create table if not exists public.family_notices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title_bn text not null,
  title_en text,
  body_bn text not null,
  body_en text,
  category text not null default 'general'
    check (category in ('general', 'urgent', 'event', 'finance', 'qurbani', 'health')),
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'urgent')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  is_pinned boolean not null default false,
  publish_at timestamptz,
  expires_at timestamptz,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or publish_at is null or expires_at > publish_at)
);

create index if not exists family_notices_family_status_idx
  on public.family_notices(family_id, status, is_pinned desc, publish_at desc);

create table if not exists public.family_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title_bn text not null,
  title_en text,
  description_bn text not null,
  description_en text,
  event_type text not null default 'reunion'
    check (event_type in ('reunion', 'tour', 'wedding', 'religious', 'meeting', 'other')),
  start_at timestamptz not null,
  end_at timestamptz,
  venue text not null,
  city text,
  meeting_point text,
  estimated_cost_per_person numeric(14,2) not null default 0,
  total_budget numeric(14,2) not null default 0,
  capacity integer check (capacity is null or capacity > 0),
  registration_deadline timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'registration_closed', 'completed', 'cancelled')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create index if not exists family_events_family_start_idx
  on public.family_events(family_id, status, start_at);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  auth_user_id text not null,
  respondent_name text not null,
  response text not null check (response in ('going', 'maybe', 'not_going')),
  guest_count integer not null default 0 check (guest_count between 0 and 10),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, auth_user_id)
);

create index if not exists event_rsvps_event_idx
  on public.event_rsvps(family_id, event_id, response);

create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  auth_user_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_comments_event_idx
  on public.event_comments(family_id, event_id, created_at);

create table if not exists public.event_media (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  caption text,
  uploaded_by_user_id text not null,
  uploader_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_media_event_idx
  on public.event_media(family_id, event_id, created_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  family_id uuid references public.families(id) on delete set null,
  actor_user_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_family_created_idx
  on public.audit_logs(family_id, created_at desc);

alter table public.families enable row level security;
alter table public.member_profiles enable row level security;
alter table public.family_relationships enable row level security;
alter table public.family_memberships enable row level security;
alter table public.family_member_requests enable row level security;
alter table public.family_notices enable row level security;
alter table public.family_events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.event_comments enable row level security;
alter table public.event_media enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.review_member_request(
  p_request_id uuid,
  p_decision text,
  p_reviewer_user_id text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.family_member_requests%rowtype;
  reviewer_role text;
  new_profile_id uuid;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unsupported review decision';
  end if;

  select * into request_row
  from public.family_member_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Membership request not found';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'Membership request is no longer pending';
  end if;

  select role into reviewer_role
  from public.family_memberships
  where family_id = request_row.family_id
    and auth_user_id = p_reviewer_user_id
    and status = 'active';

  if reviewer_role is null or reviewer_role not in ('owner', 'family_admin') then
    raise exception 'Family Admin permission is required';
  end if;

  if p_decision = 'approve' then
    insert into public.member_profiles (
      family_id,
      auth_user_id,
      name_bn,
      name_en,
      email,
      phone,
      relationship_text
    ) values (
      request_row.family_id,
      request_row.requester_user_id,
      request_row.requested_name_bn,
      request_row.requested_name_en,
      request_row.email,
      request_row.phone,
      request_row.relationship_text
    )
    on conflict (family_id, auth_user_id) where auth_user_id is not null
    do update set
      name_bn = excluded.name_bn,
      name_en = excluded.name_en,
      email = excluded.email,
      phone = excluded.phone,
      relationship_text = excluded.relationship_text,
      updated_at = now()
    returning id into new_profile_id;

    insert into public.family_memberships (
      family_id,
      auth_user_id,
      member_profile_id,
      role,
      status
    ) values (
      request_row.family_id,
      request_row.requester_user_id,
      new_profile_id,
      request_row.requested_role,
      'active'
    )
    on conflict (family_id, auth_user_id)
    do update set
      member_profile_id = excluded.member_profile_id,
      role = excluded.role,
      status = 'active',
      updated_at = now();
  end if;

  update public.family_member_requests
  set
    status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    rejection_reason = case when p_decision = 'reject' then nullif(trim(p_rejection_reason), '') else null end,
    reviewed_by_user_id = p_reviewer_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id;

  insert into public.audit_logs (
    family_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    request_row.family_id,
    p_reviewer_user_id,
    'member_request_' || p_decision,
    'family_member_request',
    p_request_id::text,
    jsonb_build_object('requested_user_id', request_row.requester_user_id)
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'status', case when p_decision = 'approve' then 'approved' else 'rejected' end
  );
end;
$$;

revoke all on function public.review_member_request(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.review_member_request(uuid, text, text, text)
  to service_role;

-- Qurbani A-Z operations for the Family Management System.
-- Run once in Supabase SQL Editor after the foundation schema.

create table if not exists public.qurbani_campaigns (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  year integer not null check (year between 2000 and 2200),
  hijri_year text,
  status text not null default 'planning'
    check (status in ('planning', 'registration', 'procurement', 'slaughter', 'distribution', 'settled', 'closed')),
  registration_deadline timestamptz,
  share_price numeric(14,2) not null default 0 check (share_price >= 0),
  target_shares numeric(10,2) not null default 1 check (target_shares > 0),
  location text,
  slaughter_date date,
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, year, title)
);

create index if not exists qurbani_campaigns_family_year_idx
  on public.qurbani_campaigns(family_id, year desc, status);

create table if not exists public.qurbani_animals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  campaign_id uuid not null references public.qurbani_campaigns(id) on delete cascade,
  tag_code text not null,
  animal_type text not null default 'cow'
    check (animal_type in ('cow', 'goat', 'sheep', 'buffalo')),
  breed text,
  color text,
  live_weight_kg numeric(12,2) not null default 0 check (live_weight_kg >= 0),
  estimated_meat_kg numeric(12,2) not null default 0 check (estimated_meat_kg >= 0),
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  vendor_name text,
  purchase_date date,
  health_status text not null default 'pending'
    check (health_status in ('pending', 'fit', 'observation', 'rejected')),
  vet_notes text,
  transport_cost numeric(14,2) not null default 0 check (transport_cost >= 0),
  feed_cost numeric(14,2) not null default 0 check (feed_cost >= 0),
  status text not null default 'shortlisted'
    check (status in ('shortlisted', 'purchased', 'received', 'slaughtered', 'cancelled')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, tag_code)
);

create index if not exists qurbani_animals_campaign_idx
  on public.qurbani_animals(family_id, campaign_id, status);

create table if not exists public.qurbani_participants (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  campaign_id uuid not null references public.qurbani_campaigns(id) on delete cascade,
  animal_id uuid references public.qurbani_animals(id) on delete set null,
  member_name text not null,
  phone text,
  share_count numeric(10,2) not null default 1 check (share_count > 0),
  amount_due numeric(14,2) not null default 0 check (amount_due >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled')),
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qurbani_participants_campaign_idx
  on public.qurbani_participants(family_id, campaign_id, status);

create table if not exists public.qurbani_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  campaign_id uuid not null references public.qurbani_campaigns(id) on delete cascade,
  participant_id uuid references public.qurbani_participants(id) on delete set null,
  animal_id uuid references public.qurbani_animals(id) on delete set null,
  transaction_type text not null
    check (transaction_type in ('collection', 'expense', 'refund')),
  category text not null
    check (category in ('share_payment', 'animal_purchase', 'transport', 'feed', 'butcher', 'logistics', 'equipment', 'distribution', 'misc')),
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank', 'mobile', 'other')),
  reference text,
  transaction_date date not null default current_date,
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists qurbani_transactions_campaign_idx
  on public.qurbani_transactions(family_id, campaign_id, transaction_date desc);

create table if not exists public.qurbani_vendors (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  campaign_id uuid not null references public.qurbani_campaigns(id) on delete cascade,
  name text not null,
  vendor_type text not null default 'other'
    check (vendor_type in ('animal_seller', 'butcher', 'transport', 'feed', 'equipment', 'other')),
  phone text,
  address text,
  agreed_amount numeric(14,2) not null default 0 check (agreed_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'planned'
    check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qurbani_vendors_campaign_idx
  on public.qurbani_vendors(family_id, campaign_id, status);

create table if not exists public.qurbani_schedules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  campaign_id uuid not null references public.qurbani_campaigns(id) on delete cascade,
  animal_id uuid references public.qurbani_animals(id) on delete set null,
  sequence_no integer not null default 1 check (sequence_no > 0),
  scheduled_at timestamptz not null,
  location text,
  butcher_team text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'delayed')),
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qurbani_schedules_campaign_idx
  on public.qurbani_schedules(family_id, campaign_id, sequence_no, scheduled_at);

create table if not exists public.qurbani_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  campaign_id uuid not null references public.qurbani_campaigns(id) on delete cascade,
  title text not null,
  category text not null default 'logistics'
    check (category in ('procurement', 'finance', 'logistics', 'slaughter', 'distribution', 'cleanup')),
  assigned_to text,
  due_at timestamptz,
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'urgent')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qurbani_tasks_campaign_idx
  on public.qurbani_tasks(family_id, campaign_id, status, due_at);

create table if not exists public.qurbani_distributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  campaign_id uuid not null references public.qurbani_campaigns(id) on delete cascade,
  recipient_name text not null,
  recipient_type text not null default 'participant'
    check (recipient_type in ('participant', 'family', 'relative', 'needy', 'worker', 'other')),
  weight_kg numeric(12,2) not null default 0 check (weight_kg >= 0),
  package_count integer not null default 1 check (package_count > 0),
  collected_at timestamptz,
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists qurbani_distributions_campaign_idx
  on public.qurbani_distributions(family_id, campaign_id, recipient_type);

alter table public.qurbani_campaigns enable row level security;
alter table public.qurbani_animals enable row level security;
alter table public.qurbani_participants enable row level security;
alter table public.qurbani_transactions enable row level security;
alter table public.qurbani_vendors enable row level security;
alter table public.qurbani_schedules enable row level security;
alter table public.qurbani_tasks enable row level security;
alter table public.qurbani_distributions enable row level security;

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

-- Secure family chat, direct messages, reactions, read state and private attachments.

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  description text,
  channel_type text not null default 'custom'
    check (channel_type in ('general', 'custom', 'event', 'qurbani', 'admin', 'direct')),
  visibility text not null default 'family'
    check (visibility in ('family', 'admins', 'invite_only')),
  direct_key text,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_channels_one_general_per_family
  on public.chat_channels(family_id)
  where channel_type = 'general';

create unique index if not exists chat_channels_direct_key_unique
  on public.chat_channels(family_id, direct_key)
  where direct_key is not null;

create index if not exists chat_channels_family_status_idx
  on public.chat_channels(family_id, status, updated_at desc);

create table if not exists public.chat_channel_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  auth_user_id text not null,
  role text not null default 'member'
    check (role in ('owner', 'moderator', 'member')),
  notification_level text not null default 'all'
    check (notification_level in ('all', 'mentions', 'muted')),
  status text not null default 'active'
    check (status in ('active', 'left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, auth_user_id)
);

create index if not exists chat_channel_members_user_idx
  on public.chat_channel_members(family_id, auth_user_id, status);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  auth_user_id text not null,
  author_name text not null,
  message_type text not null default 'text'
    check (message_type in ('text', 'attachment', 'system')),
  body text,
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check (body is not null or message_type = 'attachment')
);

create index if not exists chat_messages_channel_created_idx
  on public.chat_messages(family_id, channel_id, created_at desc);

create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  auth_user_id text not null,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, auth_user_id, emoji)
);

create index if not exists chat_message_reactions_message_idx
  on public.chat_message_reactions(family_id, message_id);

create table if not exists public.chat_read_receipts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  auth_user_id text not null,
  last_read_message_id uuid references public.chat_messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, auth_user_id)
);

create index if not exists chat_read_receipts_user_idx
  on public.chat_read_receipts(family_id, auth_user_id, updated_at desc);

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_by_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_attachments_message_idx
  on public.chat_attachments(family_id, channel_id, message_id);

alter table public.chat_channels enable row level security;
alter table public.chat_channel_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reactions enable row level security;
alter table public.chat_read_receipts enable row level security;
alter table public.chat_attachments enable row level security;

insert into public.chat_channels (
  family_id,
  name,
  description,
  channel_type,
  visibility,
  created_by_user_id
)
select
  id,
  'সবার আড্ডা',
  'পরিবারের সবার সাধারণ আলোচনা',
  'general',
  'family',
  created_by_user_id
from public.families
on conflict do nothing;

create or replace function public.create_default_family_chat_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_channels (
    family_id,
    name,
    description,
    channel_type,
    visibility,
    created_by_user_id
  ) values (
    new.id,
    'সবার আড্ডা',
    'পরিবারের সবার সাধারণ আলোচনা',
    'general',
    'family',
    new.created_by_user_id
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists families_create_default_chat on public.families;
create trigger families_create_default_chat
  after insert on public.families
  for each row execute function public.create_default_family_chat_channel();

-- Private health workspace, family emergency directory and SOS coordination.

create table if not exists public.health_profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  member_name text not null,
  blood_group text,
  date_of_birth date,
  height_cm numeric(6,2) check (height_cm is null or height_cm > 0),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg > 0),
  conditions text,
  allergies text,
  emergency_notes text,
  doctor_name text,
  doctor_phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  donor_available boolean not null default false,
  last_donation_date date,
  visibility text not null default 'private'
    check (visibility in ('private', 'emergency', 'family')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, auth_user_id)
);

create index if not exists health_profiles_family_visibility_idx
  on public.health_profiles(family_id, visibility, donor_available);

create table if not exists public.health_medications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  medicine_name text not null,
  dosage text not null,
  frequency text not null,
  reminder_times text[] not null default '{}'::text[],
  start_date date not null default current_date,
  end_date date,
  instructions text,
  prescribing_doctor text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists health_medications_owner_status_idx
  on public.health_medications(family_id, auth_user_id, status, start_date desc);

create table if not exists public.health_appointments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  title text not null,
  doctor_name text,
  facility text,
  scheduled_at timestamptz not null,
  reminder_minutes integer not null default 60 check (reminder_minutes between 0 and 10080),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_appointments_owner_schedule_idx
  on public.health_appointments(family_id, auth_user_id, status, scheduled_at);

create table if not exists public.health_measurements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  measurement_type text not null
    check (measurement_type in ('blood_pressure', 'blood_sugar', 'pulse', 'temperature', 'weight', 'oxygen')),
  value_primary numeric(10,2) not null,
  value_secondary numeric(10,2),
  unit text not null,
  measured_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists health_measurements_owner_time_idx
  on public.health_measurements(family_id, auth_user_id, measurement_type, measured_at desc);

create table if not exists public.health_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  category text not null default 'other'
    check (category in ('prescription', 'lab_report', 'imaging', 'vaccine', 'insurance', 'other')),
  title text not null,
  document_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists health_documents_owner_idx
  on public.health_documents(family_id, auth_user_id, document_date desc nulls last, created_at desc);

create table if not exists public.health_sos_alerts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  reporter_user_id text not null,
  reporter_name text not null,
  alert_type text not null default 'medical'
    check (alert_type in ('medical', 'accident', 'fire', 'safety', 'other')),
  message text not null,
  preferred_contact text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  location_accuracy_m numeric(10,2),
  location_label text,
  status text not null default 'active'
    check (status in ('active', 'acknowledged', 'resolved', 'cancelled')),
  acknowledged_by_user_id text,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  resolved_by_user_id text,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
);

create index if not exists health_sos_alerts_family_status_idx
  on public.health_sos_alerts(family_id, status, created_at desc);

create table if not exists public.health_sos_responses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  alert_id uuid not null references public.health_sos_alerts(id) on delete cascade,
  responder_user_id text not null,
  responder_name text not null,
  response_type text not null
    check (response_type in ('acknowledged', 'on_the_way', 'called_emergency', 'update', 'resolved')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists health_sos_responses_alert_idx
  on public.health_sos_responses(family_id, alert_id, created_at asc);

alter table public.health_profiles enable row level security;
alter table public.health_medications enable row level security;
alter table public.health_appointments enable row level security;
alter table public.health_measurements enable row level security;
alter table public.health_documents enable row level security;
alter table public.health_sos_alerts enable row level security;
alter table public.health_sos_responses enable row level security;

-- Family Welfare Fund: transparent contributions, controlled expenses and confidential assistance.

create table if not exists public.welfare_funds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'general' check (category in ('general', 'emergency', 'medical', 'education', 'charity')),
  target_amount numeric(14,2) not null default 0 check (target_amount >= 0),
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  visibility text not null default 'family' check (visibility in ('family', 'admins')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists welfare_funds_family_status_idx on public.welfare_funds(family_id, status, created_at desc);

create table if not exists public.welfare_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid references public.welfare_funds(id) on delete set null,
  requester_user_id text not null,
  requester_name text not null,
  request_type text not null default 'other' check (request_type in ('medical', 'education', 'emergency', 'livelihood', 'charity', 'other')),
  title text not null,
  description text not null,
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  approved_amount numeric(14,2) not null default 0 check (approved_amount >= 0),
  urgency text not null default 'normal' check (urgency in ('normal', 'high', 'critical')),
  visibility text not null default 'admins' check (visibility in ('admins', 'family')),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'cancelled')),
  admin_note text,
  reviewed_by_user_id text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_amount <= requested_amount)
);
create index if not exists welfare_requests_family_status_idx on public.welfare_requests(family_id, status, urgency, created_at desc);
create index if not exists welfare_requests_owner_idx on public.welfare_requests(family_id, requester_user_id, created_at desc);

create table if not exists public.welfare_contributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid not null references public.welfare_funds(id) on delete restrict,
  contributor_user_id text,
  contributor_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  contribution_date date not null default current_date,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'mobile', 'card', 'other')),
  reference text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'refunded')),
  submitted_by_user_id text not null,
  approved_by_user_id text,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists welfare_contributions_family_date_idx on public.welfare_contributions(family_id, status, contribution_date desc);
create index if not exists welfare_contributions_fund_idx on public.welfare_contributions(fund_id, status, contribution_date desc);

create table if not exists public.welfare_expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid not null references public.welfare_funds(id) on delete restrict,
  linked_request_id uuid references public.welfare_requests(id) on delete set null,
  title text not null,
  beneficiary_name text,
  category text not null default 'other' check (category in ('medical', 'education', 'emergency', 'charity', 'operations', 'other')),
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'mobile', 'card', 'other')),
  reference text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  requested_by_user_id text not null,
  approved_by_user_id text,
  approved_by_name text,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists welfare_expenses_family_date_idx on public.welfare_expenses(family_id, status, expense_date desc);
create index if not exists welfare_expenses_fund_idx on public.welfare_expenses(fund_id, status, expense_date desc);

create table if not exists public.welfare_pledges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  fund_id uuid not null references public.welfare_funds(id) on delete cascade,
  auth_user_id text not null,
  member_name text not null,
  frequency text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'yearly', 'one_time')),
  amount numeric(14,2) not null check (amount > 0),
  start_date date not null default current_date,
  next_due_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists welfare_pledges_family_due_idx on public.welfare_pledges(family_id, status, next_due_date);
create index if not exists welfare_pledges_owner_idx on public.welfare_pledges(family_id, auth_user_id, status);

create table if not exists public.welfare_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entity_type text not null check (entity_type in ('fund', 'contribution', 'expense', 'request')),
  entity_id uuid not null,
  document_type text not null default 'other' check (document_type in ('receipt', 'invoice', 'approval', 'evidence', 'other')),
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  title text not null,
  visibility text not null default 'admins' check (visibility in ('admins', 'family')),
  uploaded_by_user_id text not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists welfare_documents_entity_idx on public.welfare_documents(family_id, entity_type, entity_id, created_at desc);

alter table public.welfare_funds enable row level security;
alter table public.welfare_contributions enable row level security;
alter table public.welfare_expenses enable row level security;
alter table public.welfare_requests enable row level security;
alter table public.welfare_pledges enable row level security;
alter table public.welfare_documents enable row level security;

-- Shared households, shopping, bills, tasks, trusted services and maintenance.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  address text,
  city text,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists households_family_status_idx on public.households(family_id, status, created_at);

create table if not exists public.household_shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  budget_amount numeric(14,2) not null default 0 check (budget_amount >= 0),
  needed_by date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_by_user_id text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_shopping_lists_family_idx on public.household_shopping_lists(family_id, household_id, status, needed_by);

create table if not exists public.household_shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  list_id uuid not null references public.household_shopping_lists(id) on delete cascade,
  item_name text not null,
  category text not null default 'grocery' check (category in ('grocery', 'medicine', 'household', 'baby', 'personal', 'other')),
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit text not null default 'pcs',
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,2) not null default 0 check (actual_cost >= 0),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to_name text,
  status text not null default 'needed' check (status in ('needed', 'purchased', 'unavailable', 'cancelled')),
  purchased_by_user_id text,
  purchased_by_name text,
  purchased_at timestamptz,
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_shopping_items_list_idx on public.household_shopping_items(family_id, list_id, status, priority);

create table if not exists public.household_utility_bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('electricity', 'gas', 'water', 'internet', 'phone', 'rent', 'maintenance', 'other')),
  provider text,
  account_number text,
  billing_month date not null,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  recurrence text not null default 'monthly' check (recurrence in ('none', 'monthly', 'quarterly', 'yearly')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'skipped')),
  payment_method text check (payment_method is null or payment_method in ('cash', 'bank', 'mobile', 'card', 'other')),
  reference text,
  paid_by_user_id text,
  paid_by_name text,
  paid_at timestamptz,
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_utility_bills_due_idx on public.household_utility_bills(family_id, status, due_date);

create table if not exists public.household_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('cleaning', 'cooking', 'shopping', 'care', 'repair', 'bill', 'other')),
  assigned_to_name text,
  due_at timestamptz,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  notes text,
  completed_by_user_id text,
  completed_by_name text,
  completed_at timestamptz,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_tasks_due_idx on public.household_tasks(family_id, household_id, status, due_at);

create table if not exists public.household_service_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  service_type text not null default 'other' check (service_type in ('electrician', 'plumber', 'cleaner', 'driver', 'technician', 'caregiver', 'security', 'other')),
  phone text not null,
  alternate_phone text,
  address text,
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  is_trusted boolean not null default false,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_service_contacts_family_idx on public.household_service_contacts(family_id, status, service_type);

create table if not exists public.household_maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  service_contact_id uuid references public.household_service_contacts(id) on delete set null,
  title text not null,
  description text not null,
  category text not null default 'other' check (category in ('electrical', 'plumbing', 'appliance', 'building', 'cleaning', 'security', 'other')),
  urgency text not null default 'normal' check (urgency in ('normal', 'high', 'critical')),
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,2) not null default 0 check (actual_cost >= 0),
  assigned_vendor_name text,
  scheduled_at timestamptz,
  status text not null default 'reported' check (status in ('reported', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  reported_by_user_id text not null,
  reported_by_name text not null,
  resolved_by_user_id text,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_maintenance_family_idx on public.household_maintenance_requests(family_id, status, urgency, created_at desc);

create table if not exists public.household_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entity_type text not null check (entity_type in ('shopping_list', 'bill', 'maintenance')),
  entity_id uuid not null,
  document_type text not null default 'other' check (document_type in ('receipt', 'invoice', 'warranty', 'quotation', 'other')),
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  title text not null,
  uploaded_by_user_id text not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists household_documents_entity_idx on public.household_documents(family_id, entity_type, entity_id, created_at desc);

alter table public.households enable row level security;
alter table public.household_shopping_lists enable row level security;
alter table public.household_shopping_items enable row level security;
alter table public.household_utility_bills enable row level security;
alter table public.household_tasks enable row level security;
alter table public.household_service_contacts enable row level security;
alter table public.household_maintenance_requests enable row level security;
alter table public.household_documents enable row level security;

-- Family archives, heritage stories, secure vault, asset register and time capsules.

create table if not exists public.archive_collections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  description text,
  collection_type text not null default 'album' check (collection_type in ('album', 'heritage', 'documents', 'property', 'time_capsule', 'other')),
  cover_color text not null default '#153A5B',
  visibility text not null default 'family' check (visibility in ('family', 'admins', 'private')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by_user_id text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists archive_collections_family_idx on public.archive_collections(family_id, status, collection_type, created_at desc);

create table if not exists public.archive_memories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  collection_id uuid not null references public.archive_collections(id) on delete cascade,
  title text not null,
  description text,
  memory_type text not null default 'photo' check (memory_type in ('photo', 'video', 'audio', 'document', 'object', 'other')),
  memory_date date,
  place text,
  people_tags text[] not null default '{}'::text[],
  visibility text not null default 'family' check (visibility in ('family', 'admins', 'private')),
  status text not null default 'active' check (status in ('active', 'archived')),
  uploaded_by_user_id text not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists archive_memories_collection_idx on public.archive_memories(family_id, collection_id, status, memory_date desc nulls last, created_at desc);

create table if not exists public.archive_stories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  content text not null,
  story_date date,
  storyteller text,
  people_tags text[] not null default '{}'::text[],
  place text,
  visibility text not null default 'family' check (visibility in ('family', 'admins')),
  status text not null default 'pending' check (status in ('draft', 'pending', 'published', 'archived')),
  author_user_id text not null,
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists archive_stories_family_idx on public.archive_stories(family_id, status, story_date desc nulls last, created_at desc);

create table if not exists public.archive_vault_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('property_deed', 'nid', 'passport', 'birth_certificate', 'legal', 'financial', 'insurance', 'education', 'other')),
  owner_name text,
  document_number_masked text,
  issue_date date,
  expiry_date date,
  issuer text,
  notes text,
  visibility text not null default 'private' check (visibility in ('family', 'admins', 'private')),
  uploaded_by_user_id text not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);
create index if not exists archive_vault_expiry_idx on public.archive_vault_documents(family_id, visibility, expiry_date);

create table if not exists public.family_assets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  asset_type text not null default 'other' check (asset_type in ('land', 'house', 'flat', 'vehicle', 'business', 'investment', 'jewelry', 'other')),
  ownership text,
  location text,
  identifier_masked text,
  acquisition_date date,
  estimated_value numeric(16,2) not null default 0 check (estimated_value >= 0),
  notes text,
  visibility text not null default 'admins' check (visibility in ('family', 'admins')),
  status text not null default 'active' check (status in ('active', 'disputed', 'sold', 'inactive')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists family_assets_family_idx on public.family_assets(family_id, status, asset_type, created_at desc);

create table if not exists public.time_capsules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  message text not null,
  recipient_names text,
  unlock_at timestamptz not null,
  visibility text not null default 'family' check (visibility in ('family', 'admins')),
  status text not null default 'locked' check (status in ('locked', 'opened', 'cancelled')),
  created_by_user_id text not null,
  created_by_name text not null,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unlock_at > created_at)
);
create index if not exists time_capsules_unlock_idx on public.time_capsules(family_id, status, unlock_at);

create table if not exists public.archive_files (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entity_type text not null check (entity_type in ('memory', 'vault_document')),
  entity_id uuid not null,
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  visibility text not null default 'family' check (visibility in ('family', 'admins', 'private')),
  uploaded_by_user_id text not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists archive_files_entity_idx on public.archive_files(family_id, entity_type, entity_id, created_at desc);

alter table public.archive_collections enable row level security;
alter table public.archive_memories enable row level security;
alter table public.archive_stories enable row level security;
alter table public.archive_vault_documents enable row level security;
alter table public.family_assets enable row level security;
alter table public.time_capsules enable row level security;
alter table public.archive_files enable row level security;
