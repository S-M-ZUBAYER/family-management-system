-- Family-scoped in-app notifications, per-user state, and delivery preferences.
create table if not exists public.family_notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_user_id text,
  category text not null default 'announcement',
  severity text not null default 'info',
  title_bn text,
  title_en text,
  message_bn text,
  message_en text,
  action_url text,
  source_type text,
  source_id text,
  scheduled_for timestamptz not null default now(),
  expires_at timestamptz,
  created_by_user_id text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint family_notifications_category_check check (category in ('announcement','membership','event','qurbani','health','finance','governance','household','system')),
  constraint family_notifications_severity_check check (severity in ('info','success','warning','urgent')),
  constraint family_notifications_content_check check (coalesce(nullif(trim(title_bn), ''), nullif(trim(title_en), '')) is not null),
  constraint family_notifications_action_url_check check (action_url is null or action_url like '/%')
);

create index if not exists family_notifications_family_schedule_idx
  on public.family_notifications(family_id, scheduled_for desc);
create index if not exists family_notifications_recipient_idx
  on public.family_notifications(family_id, recipient_user_id, scheduled_for desc);

create table if not exists public.family_notification_states (
  notification_id uuid not null references public.family_notifications(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id text not null,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists family_notification_states_user_idx
  on public.family_notification_states(family_id, user_id, updated_at desc);

create table if not exists public.family_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  push_enabled boolean not null default false,
  family_announcements boolean not null default true,
  membership_updates boolean not null default true,
  event_reminders boolean not null default true,
  qurbani_updates boolean not null default true,
  health_reminders boolean not null default true,
  finance_reminders boolean not null default true,
  governance_updates boolean not null default true,
  household_updates boolean not null default true,
  digest_frequency text not null default 'instant',
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Asia/Dhaka',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id),
  constraint family_notification_digest_check check (digest_frequency in ('instant','daily','weekly','off'))
);

alter table public.family_notifications enable row level security;
alter table public.family_notification_states enable row level security;
alter table public.family_notification_preferences enable row level security;
