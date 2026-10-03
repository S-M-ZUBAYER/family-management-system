-- Finalized Qurbani campaigns are immutable across concurrent requests.
-- Apply after 20260926_qurbani_a_to_z.sql. Never run this in a production
-- database until the rollback-only staging test has passed.

begin;

create or replace function public.guard_qurbani_campaign_finalization()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('planning', 'registration') then
      raise exception using errcode = '23514', message = 'QURBANI_FINALIZED: a new campaign must start in planning or registration';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'planning'
      or exists (select 1 from public.qurbani_participants where campaign_id = old.id)
      or exists (select 1 from public.qurbani_animals where campaign_id = old.id)
      or exists (select 1 from public.qurbani_transactions where campaign_id = old.id)
      or exists (select 1 from public.qurbani_vendors where campaign_id = old.id)
      or exists (select 1 from public.qurbani_schedules where campaign_id = old.id)
      or exists (select 1 from public.qurbani_tasks where campaign_id = old.id)
      or exists (select 1 from public.qurbani_distributions where campaign_id = old.id)
    then
      raise exception using errcode = '23514', message = 'QURBANI_DRAFT_NOT_EMPTY: only an empty planning campaign may be deleted';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id or new.family_id is distinct from old.family_id then
    raise exception using errcode = '23514', message = 'QURBANI_CAMPAIGN_LINK_IMMUTABLE';
  end if;

  if old.status = 'closed' then
    raise exception using errcode = '23514', message = 'QURBANI_FINALIZED: closed campaigns are immutable';
  end if;

  if old.status = 'settled' then
    if new.status <> 'closed'
      or (to_jsonb(new) - 'status' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status' - 'updated_at')
    then
      raise exception using errcode = '23514', message = 'QURBANI_FINALIZED: settled campaigns may only be closed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists qurbani_campaign_finalization_guard on public.qurbani_campaigns;
create trigger qurbani_campaign_finalization_guard
before insert or update or delete on public.qurbani_campaigns
for each row execute function public.guard_qurbani_campaign_finalization();

create or replace function public.guard_qurbani_child_finalization()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  row_campaign_id uuid;
  row_family_id uuid;
  campaign_status text;
begin
  if tg_op = 'DELETE' then
    row_campaign_id := old.campaign_id;
    row_family_id := old.family_id;
  else
    row_campaign_id := new.campaign_id;
    row_family_id := new.family_id;
  end if;

  if tg_op = 'UPDATE' and
     (new.campaign_id is distinct from old.campaign_id
      or new.family_id is distinct from old.family_id) then
    raise exception using errcode = '23514', message = 'QURBANI_CAMPAIGN_LINK_IMMUTABLE';
  end if;

  -- FOR SHARE conflicts with campaign UPDATE/DELETE. A finalization waits for
  -- an in-flight child change; a later child change sees the finalized status.
  select status into campaign_status
  from public.qurbani_campaigns
  where id = row_campaign_id and family_id = row_family_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'QURBANI_CAMPAIGN_NOT_FOUND: family/campaign mismatch';
  end if;
  if campaign_status in ('settled', 'closed') then
    raise exception using errcode = '23514', message = 'QURBANI_FINALIZED: campaign records are read-only';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists qurbani_participants_finalization_guard on public.qurbani_participants;
create trigger qurbani_participants_finalization_guard
before insert or update or delete on public.qurbani_participants
for each row execute function public.guard_qurbani_child_finalization();

drop trigger if exists qurbani_animals_finalization_guard on public.qurbani_animals;
create trigger qurbani_animals_finalization_guard
before insert or update or delete on public.qurbani_animals
for each row execute function public.guard_qurbani_child_finalization();

drop trigger if exists qurbani_transactions_finalization_guard on public.qurbani_transactions;
create trigger qurbani_transactions_finalization_guard
before insert or update or delete on public.qurbani_transactions
for each row execute function public.guard_qurbani_child_finalization();

drop trigger if exists qurbani_vendors_finalization_guard on public.qurbani_vendors;
create trigger qurbani_vendors_finalization_guard
before insert or update or delete on public.qurbani_vendors
for each row execute function public.guard_qurbani_child_finalization();

drop trigger if exists qurbani_schedules_finalization_guard on public.qurbani_schedules;
create trigger qurbani_schedules_finalization_guard
before insert or update or delete on public.qurbani_schedules
for each row execute function public.guard_qurbani_child_finalization();

drop trigger if exists qurbani_tasks_finalization_guard on public.qurbani_tasks;
create trigger qurbani_tasks_finalization_guard
before insert or update or delete on public.qurbani_tasks
for each row execute function public.guard_qurbani_child_finalization();

drop trigger if exists qurbani_distributions_finalization_guard on public.qurbani_distributions;
create trigger qurbani_distributions_finalization_guard
before insert or update or delete on public.qurbani_distributions
for each row execute function public.guard_qurbani_child_finalization();

commit;
