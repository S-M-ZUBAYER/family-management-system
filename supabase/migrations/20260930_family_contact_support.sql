-- Family-scoped contact and support tickets.
create table if not exists public.family_contact_tickets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category text not null default 'general' check (category in ('general','family_admin','technical','privacy','event','qurbani','finance','health','other')),
  subject text not null,
  message text not null,
  preferred_contact text,
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_member','resolved','closed')),
  admin_response text,
  assigned_to_name text,
  created_by_user_id text not null,
  created_by_name text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_contact_tickets_family_status_idx
  on public.family_contact_tickets(family_id, status, priority desc, created_at desc);
create index if not exists family_contact_tickets_creator_idx
  on public.family_contact_tickets(family_id, created_by_user_id, created_at desc);
alter table public.family_contact_tickets enable row level security;
