-- Secure family chat, direct messages, reactions, read state and private attachments.
-- Run once in Supabase SQL Editor after the foundation schema.

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

-- Every family gets a single default general room. Existing families are backfilled,
-- and the trigger covers families created after this migration.
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
