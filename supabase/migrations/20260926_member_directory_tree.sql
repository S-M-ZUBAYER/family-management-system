-- Apply once to an existing Family Management System database.

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

alter table public.family_relationships enable row level security;
