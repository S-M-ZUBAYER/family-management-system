-- Family proposals, secure voting, discussions and formal decisions.

create table if not exists public.family_polls (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'general'
    check (category in ('event', 'finance', 'welfare', 'property', 'qurbani', 'policy', 'general')),
  decision_type text not null default 'advisory'
    check (decision_type in ('advisory', 'binding', 'informal')),
  voting_mode text not null default 'single'
    check (voting_mode in ('single', 'multiple', 'yes_no')),
  max_choices integer not null default 1 check (max_choices between 1 and 20),
  is_anonymous boolean not null default false,
  results_visibility text not null default 'after_close'
    check (results_visibility in ('live', 'after_close', 'admins')),
  audience text not null default 'family'
    check (audience in ('family', 'admins')),
  quorum_percent integer not null default 50 check (quorum_percent between 0 and 100),
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'proposed'
    check (status in ('proposed', 'draft', 'open', 'closed', 'rejected', 'archived')),
  created_by_user_id text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create index if not exists family_polls_family_status_idx
  on public.family_polls(family_id, status, closes_at, created_at desc);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  poll_id uuid not null references public.family_polls(id) on delete cascade,
  label text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (poll_id, position)
);

create index if not exists poll_options_poll_idx
  on public.poll_options(family_id, poll_id, position);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  poll_id uuid not null references public.family_polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_user_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_user_id, option_id)
);

create index if not exists poll_votes_poll_idx
  on public.poll_votes(family_id, poll_id, option_id);
create index if not exists poll_votes_voter_idx
  on public.poll_votes(family_id, voter_user_id, poll_id);

create table if not exists public.poll_comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  poll_id uuid not null references public.family_polls(id) on delete cascade,
  body text not null,
  author_user_id text not null,
  author_name text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists poll_comments_poll_idx
  on public.poll_comments(family_id, poll_id, status, created_at);

create table if not exists public.family_decisions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  poll_id uuid references public.family_polls(id) on delete set null,
  title text not null,
  summary text not null,
  final_outcome text not null,
  effective_date date,
  status text not null default 'adopted'
    check (status in ('adopted', 'rejected', 'superseded', 'archived')),
  decided_by_user_id text not null,
  decided_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_decisions_family_idx
  on public.family_decisions(family_id, status, effective_date desc nulls last, created_at desc);

alter table public.family_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.poll_comments enable row level security;
alter table public.family_decisions enable row level security;
