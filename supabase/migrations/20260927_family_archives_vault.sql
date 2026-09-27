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
