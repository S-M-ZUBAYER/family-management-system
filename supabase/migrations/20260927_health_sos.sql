-- Private health workspace, family emergency directory and SOS coordination.
-- Run once in Supabase SQL Editor after the foundation schema.

create table if not exists public.health_profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  member_name text not null,
  blood_group text,
  date_of_birth date,
  height_cm numeric(6,2) check (height_cm is null or height_cm > 0),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg > 0),
  conditions text,
  allergies text,
  emergency_notes text,
  doctor_name text,
  doctor_phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  donor_available boolean not null default false,
  last_donation_date date,
  visibility text not null default 'private'
    check (visibility in ('private', 'emergency', 'family')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, auth_user_id)
);

create index if not exists health_profiles_family_visibility_idx
  on public.health_profiles(family_id, visibility, donor_available);

create table if not exists public.health_medications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  medicine_name text not null,
  dosage text not null,
  frequency text not null,
  reminder_times text[] not null default '{}'::text[],
  start_date date not null default current_date,
  end_date date,
  instructions text,
  prescribing_doctor text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists health_medications_owner_status_idx
  on public.health_medications(family_id, auth_user_id, status, start_date desc);

create table if not exists public.health_appointments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  title text not null,
  doctor_name text,
  facility text,
  scheduled_at timestamptz not null,
  reminder_minutes integer not null default 60 check (reminder_minutes between 0 and 10080),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_appointments_owner_schedule_idx
  on public.health_appointments(family_id, auth_user_id, status, scheduled_at);

create table if not exists public.health_measurements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  measurement_type text not null
    check (measurement_type in ('blood_pressure', 'blood_sugar', 'pulse', 'temperature', 'weight', 'oxygen')),
  value_primary numeric(10,2) not null,
  value_secondary numeric(10,2),
  unit text not null,
  measured_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists health_measurements_owner_time_idx
  on public.health_measurements(family_id, auth_user_id, measurement_type, measured_at desc);

create table if not exists public.health_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id text not null,
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  category text not null default 'other'
    check (category in ('prescription', 'lab_report', 'imaging', 'vaccine', 'insurance', 'other')),
  title text not null,
  document_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists health_documents_owner_idx
  on public.health_documents(family_id, auth_user_id, document_date desc nulls last, created_at desc);

create table if not exists public.health_sos_alerts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  reporter_user_id text not null,
  reporter_name text not null,
  alert_type text not null default 'medical'
    check (alert_type in ('medical', 'accident', 'fire', 'safety', 'other')),
  message text not null,
  preferred_contact text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  location_accuracy_m numeric(10,2),
  location_label text,
  status text not null default 'active'
    check (status in ('active', 'acknowledged', 'resolved', 'cancelled')),
  acknowledged_by_user_id text,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  resolved_by_user_id text,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
);

create index if not exists health_sos_alerts_family_status_idx
  on public.health_sos_alerts(family_id, status, created_at desc);

create table if not exists public.health_sos_responses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  alert_id uuid not null references public.health_sos_alerts(id) on delete cascade,
  responder_user_id text not null,
  responder_name text not null,
  response_type text not null
    check (response_type in ('acknowledged', 'on_the_way', 'called_emergency', 'update', 'resolved')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists health_sos_responses_alert_idx
  on public.health_sos_responses(family_id, alert_id, created_at asc);

alter table public.health_profiles enable row level security;
alter table public.health_medications enable row level security;
alter table public.health_appointments enable row level security;
alter table public.health_measurements enable row level security;
alter table public.health_documents enable row level security;
alter table public.health_sos_alerts enable row level security;
alter table public.health_sos_responses enable row level security;
