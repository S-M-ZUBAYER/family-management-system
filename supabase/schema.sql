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
