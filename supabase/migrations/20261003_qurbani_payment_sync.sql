-- Keep participant paid balances in step with linked share-payment ledger entries.
-- Historical balances are deliberately untouched. Run the rollback-only test in
-- staging before applying here; review existing reconciliation differences first.
begin;

create or replace function public.guard_qurbani_payment_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.participant_id is not null and not exists (
    select 1 from public.qurbani_participants p
    where p.id = new.participant_id
      and p.family_id = new.family_id and p.campaign_id = new.campaign_id
  ) then
    raise exception using errcode = '23514', message = 'QURBANI_PAYMENT_LINK_INVALID: participant belongs to another family or campaign';
  end if;
  if new.category = 'share_payment'
     and (new.participant_id is null or new.transaction_type not in ('collection', 'refund')) then
    raise exception using errcode = '23514', message = 'QURBANI_PAYMENT_LINK_INVALID: share payment requires a participant and collection/refund type';
  end if;
  return new;
end;
$$;

drop trigger if exists qurbani_payment_entry_guard on public.qurbani_transactions;
create trigger qurbani_payment_entry_guard
before insert or update on public.qurbani_transactions
for each row execute function public.guard_qurbani_payment_entry();

create or replace function public.sync_qurbani_participant_paid()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  old_participant uuid;
  new_participant uuid;
  old_amount numeric(14,2) := 0;
  new_amount numeric(14,2) := 0;
begin
  if tg_op <> 'INSERT' and old.category = 'share_payment' and old.participant_id is not null then
    old_participant := old.participant_id;
    old_amount := case when old.transaction_type = 'refund' then -old.amount else old.amount end;
  end if;
  if tg_op <> 'DELETE' and new.category = 'share_payment' and new.participant_id is not null then
    new_participant := new.participant_id;
    new_amount := case when new.transaction_type = 'refund' then -new.amount else new.amount end;
  end if;

  if old_participant is not distinct from new_participant then
    if new_participant is not null and new_amount <> old_amount then
      update public.qurbani_participants
      set amount_paid = amount_paid + new_amount - old_amount, updated_at = now()
      where id = new_participant;
    end if;
  elsif old_participant is null then
    update public.qurbani_participants
    set amount_paid = amount_paid + new_amount, updated_at = now()
    where id = new_participant;
  elsif new_participant is null then
    update public.qurbani_participants
    set amount_paid = amount_paid - old_amount, updated_at = now()
    where id = old_participant;
  elsif old_participant < new_participant then
    update public.qurbani_participants
    set amount_paid = amount_paid - old_amount, updated_at = now()
    where id = old_participant;
    update public.qurbani_participants
    set amount_paid = amount_paid + new_amount, updated_at = now()
    where id = new_participant;
  else
    update public.qurbani_participants
    set amount_paid = amount_paid + new_amount, updated_at = now()
    where id = new_participant;
    update public.qurbani_participants
    set amount_paid = amount_paid - old_amount, updated_at = now()
    where id = old_participant;
  end if;
  return null;
end;
$$;

drop trigger if exists qurbani_payment_balance_sync on public.qurbani_transactions;
create trigger qurbani_payment_balance_sync
after insert or update or delete on public.qurbani_transactions
for each row execute function public.sync_qurbani_participant_paid();

create or replace function public.guard_qurbani_paid_participant_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.qurbani_transactions t
    where t.participant_id = old.id and t.category = 'share_payment'
  ) then
    raise exception using errcode = '23514', message = 'QURBANI_PAYMENT_LINKED: delete share-payment ledger entries before participant';
  end if;
  return old;
end;
$$;

drop trigger if exists qurbani_paid_participant_delete_guard on public.qurbani_participants;
create trigger qurbani_paid_participant_delete_guard
before delete on public.qurbani_participants
for each row execute function public.guard_qurbani_paid_participant_delete();

create or replace function public.guard_qurbani_payment_settlement()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'settled' and old.status is distinct from 'settled' then
    if exists (
      select 1 from public.qurbani_transactions t
      left join public.qurbani_participants p on p.id = t.participant_id
      where t.campaign_id = new.id and t.family_id = new.family_id
        and t.category = 'share_payment'
        and (p.id is null or p.campaign_id <> new.id or p.family_id <> new.family_id
             or t.transaction_type not in ('collection', 'refund'))
    ) or exists (
      select 1 from public.qurbani_participants p
      where p.campaign_id = new.id and p.family_id = new.family_id
        and p.amount_paid <> coalesce((
          select sum(case when t.transaction_type = 'refund' then -t.amount else t.amount end)
          from public.qurbani_transactions t
          where t.participant_id = p.id and t.campaign_id = new.id
            and t.family_id = new.family_id and t.category = 'share_payment'
        ), 0)
    ) then
      raise exception using errcode = '23514', message = 'QURBANI_PAYMENT_RECONCILIATION_REQUIRED: participant balance and ledger differ';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists qurbani_campaign_payment_settlement_guard on public.qurbani_campaigns;
create trigger qurbani_campaign_payment_settlement_guard
before update on public.qurbani_campaigns
for each row execute function public.guard_qurbani_payment_settlement();

commit;
