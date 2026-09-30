-- Family privacy policy, member consent controls, and data-rights requests.
create table if not exists public.family_privacy_settings (
  family_id uuid primary key references public.families(id) on delete cascade,
  privacy_notice_bn text,
  privacy_notice_en text,
  record_retention_days integer not null default 3650,
  inactive_member_retention_days integer not null default 730,
  allow_member_data_requests boolean not null default true,
  updated_by_user_id text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_privacy_record_retention_check check (record_retention_days between 30 and 36500),
  constraint family_privacy_inactive_retention_check check (inactive_member_retention_days between 30 and 36500)
);

create table if not exists public.family_privacy_consents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id text not null,
  directory_visibility text not null default 'family',
  show_email_to_family boolean not null default false,
  show_phone_to_family boolean not null default false,
  allow_emergency_access boolean not null default true,
  allow_family_analytics boolean not null default false,
  consent_version text not null default '1.0',
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id),
  constraint family_privacy_directory_visibility_check check (directory_visibility in ('family','admins_only','hidden'))
);

create index if not exists family_privacy_consents_user_idx
  on public.family_privacy_consents(family_id, user_id);

create table if not exists public.family_data_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  request_type text not null,
  subject text not null,
  details text not null,
  status text not null default 'pending',
  requested_by_user_id text not null,
  requested_by_name text not null,
  admin_response text,
  assigned_to_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_data_requests_type_check check (request_type in ('access_export','correction','deletion','restriction')),
  constraint family_data_requests_status_check check (status in ('pending','in_review','approved','completed','rejected','cancelled'))
);

create index if not exists family_data_requests_family_status_idx
  on public.family_data_requests(family_id, status, created_at desc);
create index if not exists family_data_requests_requester_idx
  on public.family_data_requests(family_id, requested_by_user_id, created_at desc);

alter table public.family_privacy_settings enable row level security;
alter table public.family_privacy_consents enable row level security;
alter table public.family_data_requests enable row level security;
