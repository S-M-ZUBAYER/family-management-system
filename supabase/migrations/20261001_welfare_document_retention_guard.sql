-- Protect Welfare evidence and its parent links at the database boundary.
-- Apply after the existing Welfare schema. Validate in staging first.
begin;

create or replace function public.guard_welfare_document_relation()
returns trigger
language plpgsql
as $$
declare
  v_family_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_status text;
begin
  if tg_op = 'UPDATE' then
    if (new.family_id, new.entity_type, new.entity_id) is distinct from
       (old.family_id, old.entity_type, old.entity_id) then
      raise exception 'WELFARE_DOCUMENT_LINK_IMMUTABLE';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_family_id := old.family_id;
    v_entity_id := old.entity_id;
    v_entity_type := old.entity_type;
  else
    v_family_id := new.family_id;
    v_entity_id := new.entity_id;
    v_entity_type := new.entity_type;
  end if;

  if v_entity_type = 'fund' then
    select status into v_status from public.welfare_funds
    where id = v_entity_id and family_id = v_family_id for share;
  elsif v_entity_type = 'contribution' then
    select status into v_status from public.welfare_contributions
    where id = v_entity_id and family_id = v_family_id for share;
  elsif v_entity_type = 'expense' then
    select status into v_status from public.welfare_expenses
    where id = v_entity_id and family_id = v_family_id for share;
  elsif v_entity_type = 'request' then
    select status into v_status from public.welfare_requests
    where id = v_entity_id and family_id = v_family_id for share;
  else
    raise exception 'WELFARE_DOCUMENT_PARENT_MISSING';
  end if;

  if v_status is null then
    raise exception 'WELFARE_DOCUMENT_PARENT_MISSING';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and not (
    (v_entity_type = 'fund' and v_status in ('active', 'paused')) or
    (v_entity_type in ('contribution', 'expense') and v_status = 'pending') or
    (v_entity_type = 'request' and v_status = 'submitted')
  ) then
    raise exception 'WELFARE_DOCUMENT_FINALIZED';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists welfare_document_relation_guard on public.welfare_documents;
create trigger welfare_document_relation_guard
before insert or update or delete on public.welfare_documents
for each row execute function public.guard_welfare_document_relation();

create or replace function public.guard_welfare_parent_with_documents()
returns trigger
language plpgsql
as $$
declare
  v_entity_type text;
begin
  v_entity_type := case tg_table_name
    when 'welfare_funds' then 'fund'
    when 'welfare_contributions' then 'contribution'
    when 'welfare_expenses' then 'expense'
    when 'welfare_requests' then 'request'
    else null
  end;
  if v_entity_type is null then raise exception 'WELFARE_DOCUMENT_PARENT_MISSING'; end if;
  if exists (
    select 1 from public.welfare_documents
    where family_id = old.family_id and entity_type = v_entity_type and entity_id = old.id
  ) then
    raise exception 'WELFARE_DOCUMENTS_ATTACHED';
  end if;
  return old;
end;
$$;

drop trigger if exists welfare_fund_document_delete_guard on public.welfare_funds;
create trigger welfare_fund_document_delete_guard before delete on public.welfare_funds
for each row execute function public.guard_welfare_parent_with_documents();

drop trigger if exists welfare_contribution_document_delete_guard on public.welfare_contributions;
create trigger welfare_contribution_document_delete_guard before delete on public.welfare_contributions
for each row execute function public.guard_welfare_parent_with_documents();

drop trigger if exists welfare_expense_document_delete_guard on public.welfare_expenses;
create trigger welfare_expense_document_delete_guard before delete on public.welfare_expenses
for each row execute function public.guard_welfare_parent_with_documents();

drop trigger if exists welfare_request_document_delete_guard on public.welfare_requests;
create trigger welfare_request_document_delete_guard before delete on public.welfare_requests
for each row execute function public.guard_welfare_parent_with_documents();

commit;
