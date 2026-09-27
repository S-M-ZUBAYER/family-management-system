-- Shared households, shopping, bills, tasks, trusted services and maintenance.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  address text,
  city text,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists households_family_status_idx on public.households(family_id, status, created_at);

create table if not exists public.household_shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  budget_amount numeric(14,2) not null default 0 check (budget_amount >= 0),
  needed_by date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_by_user_id text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_shopping_lists_family_idx on public.household_shopping_lists(family_id, household_id, status, needed_by);

create table if not exists public.household_shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  list_id uuid not null references public.household_shopping_lists(id) on delete cascade,
  item_name text not null,
  category text not null default 'grocery' check (category in ('grocery', 'medicine', 'household', 'baby', 'personal', 'other')),
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit text not null default 'pcs',
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,2) not null default 0 check (actual_cost >= 0),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to_name text,
  status text not null default 'needed' check (status in ('needed', 'purchased', 'unavailable', 'cancelled')),
  purchased_by_user_id text,
  purchased_by_name text,
  purchased_at timestamptz,
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_shopping_items_list_idx on public.household_shopping_items(family_id, list_id, status, priority);

create table if not exists public.household_utility_bills (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('electricity', 'gas', 'water', 'internet', 'phone', 'rent', 'maintenance', 'other')),
  provider text,
  account_number text,
  billing_month date not null,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  recurrence text not null default 'monthly' check (recurrence in ('none', 'monthly', 'quarterly', 'yearly')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'skipped')),
  payment_method text check (payment_method is null or payment_method in ('cash', 'bank', 'mobile', 'card', 'other')),
  reference text,
  paid_by_user_id text,
  paid_by_name text,
  paid_at timestamptz,
  notes text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_utility_bills_due_idx on public.household_utility_bills(family_id, status, due_date);

create table if not exists public.household_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('cleaning', 'cooking', 'shopping', 'care', 'repair', 'bill', 'other')),
  assigned_to_name text,
  due_at timestamptz,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  notes text,
  completed_by_user_id text,
  completed_by_name text,
  completed_at timestamptz,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_tasks_due_idx on public.household_tasks(family_id, household_id, status, due_at);

create table if not exists public.household_service_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  service_type text not null default 'other' check (service_type in ('electrician', 'plumber', 'cleaner', 'driver', 'technician', 'caregiver', 'security', 'other')),
  phone text not null,
  alternate_phone text,
  address text,
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  is_trusted boolean not null default false,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_service_contacts_family_idx on public.household_service_contacts(family_id, status, service_type);

create table if not exists public.household_maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  service_contact_id uuid references public.household_service_contacts(id) on delete set null,
  title text not null,
  description text not null,
  category text not null default 'other' check (category in ('electrical', 'plumbing', 'appliance', 'building', 'cleaning', 'security', 'other')),
  urgency text not null default 'normal' check (urgency in ('normal', 'high', 'critical')),
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,2) not null default 0 check (actual_cost >= 0),
  assigned_vendor_name text,
  scheduled_at timestamptz,
  status text not null default 'reported' check (status in ('reported', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  reported_by_user_id text not null,
  reported_by_name text not null,
  resolved_by_user_id text,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_maintenance_family_idx on public.household_maintenance_requests(family_id, status, urgency, created_at desc);

create table if not exists public.household_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entity_type text not null check (entity_type in ('shopping_list', 'bill', 'maintenance')),
  entity_id uuid not null,
  document_type text not null default 'other' check (document_type in ('receipt', 'invoice', 'warranty', 'quotation', 'other')),
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  title text not null,
  uploaded_by_user_id text not null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists household_documents_entity_idx on public.household_documents(family_id, entity_type, entity_id, created_at desc);

alter table public.households enable row level security;
alter table public.household_shopping_lists enable row level security;
alter table public.household_shopping_items enable row level security;
alter table public.household_utility_bills enable row level security;
alter table public.household_tasks enable row level security;
alter table public.household_service_contacts enable row level security;
alter table public.household_maintenance_requests enable row level security;
alter table public.household_documents enable row level security;
