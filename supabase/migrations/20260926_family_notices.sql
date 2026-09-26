-- Apply once to an existing Family Management System database.

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

alter table public.family_notices enable row level security;
