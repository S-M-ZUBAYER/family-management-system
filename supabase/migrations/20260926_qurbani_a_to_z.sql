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
