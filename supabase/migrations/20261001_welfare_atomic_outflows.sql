-- Apply after 20260930_welfare_disbursement_guard.sql. All application paths
-- that reduce a fund's available balance must use this transaction function.
-- It serializes those paths on the fund row and updates the ledger atomically.
create or replace function public.settle_welfare_outflow(
  p_family_id uuid,
  p_entity text,
  p_record_id uuid,
  p_actor_user_id text,
  p_actor_name text,
  p_approved_amount numeric default null,
  p_admin_note text default null,
  p_payment_method text default 'cash',
  p_reference text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fund_id uuid;
  v_fund_status text;
  v_opening_balance numeric(14,2);
  v_available numeric;
  v_approved_amount numeric(14,2);
  v_expense public.welfare_expenses%rowtype;
  v_request public.welfare_requests%rowtype;
  v_contribution public.welfare_contributions%rowtype;
  v_linked public.welfare_expenses%rowtype;
  v_result jsonb;
  v_table text;
  v_action text;
begin
  if not exists (
    select 1 from public.family_memberships m
    where m.family_id = p_family_id and m.auth_user_id = p_actor_user_id
      and m.status = 'active' and m.role in ('owner', 'family_admin', 'manager')
  ) then
    raise exception using errcode = 'P0001', message = 'WELFARE_UNAUTHORIZED';
  end if;

  -- Read the fund ID first, then lock the fund before any record row. Every
  -- outflow uses this order, including requests that later inspect an expense.
  -- Recheck fund_id after the record lock in case it changed meanwhile.
  if p_entity = 'expense' then
    select fund_id into v_fund_id from public.welfare_expenses
    where id = p_record_id and family_id = p_family_id;
  elsif p_entity = 'request' then
    select fund_id into v_fund_id from public.welfare_requests
    where id = p_record_id and family_id = p_family_id;
  elsif p_entity = 'contribution' then
    select fund_id into v_fund_id from public.welfare_contributions
    where id = p_record_id and family_id = p_family_id;
  else
    raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_ENTITY';
  end if;
  if v_fund_id is null then
    raise exception using errcode = 'P0001', message = 'WELFARE_FUND_REQUIRED';
  end if;

  select status, opening_balance into v_fund_status, v_opening_balance
  from public.welfare_funds
  where id = v_fund_id and family_id = p_family_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_TRANSITION';
  end if;

  if p_entity = 'expense' then
    select * into v_expense from public.welfare_expenses
    where id = p_record_id and family_id = p_family_id for update;
    if v_expense.id is null or v_expense.status <> 'approved' then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_TRANSITION';
    end if;
    if v_expense.fund_id is distinct from v_fund_id then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_TRANSITION';
    end if;
  elsif p_entity = 'request' then
    select * into v_request from public.welfare_requests
    where id = p_record_id and family_id = p_family_id for update;
    if v_request.id is null or v_request.status <> 'approved' then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_TRANSITION';
    end if;
    if v_request.fund_id is null then
      raise exception using errcode = 'P0001', message = 'WELFARE_FUND_REQUIRED';
    end if;
    if v_request.fund_id is distinct from v_fund_id then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_TRANSITION';
    end if;
  elsif p_entity = 'contribution' then
    select * into v_contribution from public.welfare_contributions
    where id = p_record_id and family_id = p_family_id for update;
    if v_contribution.id is null or v_contribution.status <> 'approved' then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_TRANSITION';
    end if;
    if v_contribution.fund_id is distinct from v_fund_id then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_TRANSITION';
    end if;
  end if;

  -- Under READ COMMITTED, the aggregate below sees the prior holder's
  -- committed rows after waiting for the shared fund-row lock.
  if v_fund_status is distinct from 'active'
    and not (p_entity = 'contribution' and v_fund_status = 'paused') then
    raise exception using errcode = 'P0001', message = 'WELFARE_FUND_INACTIVE';
  end if;

  select v_opening_balance
    + coalesce((select sum(c.amount) from public.welfare_contributions c
        where c.family_id = p_family_id and c.fund_id = v_fund_id and c.status = 'approved'), 0)
    - coalesce((select sum(e.amount) from public.welfare_expenses e
        where e.family_id = p_family_id and e.fund_id = v_fund_id and e.status = 'paid'), 0)
  into v_available;

  if p_entity = 'expense' then
    if v_expense.amount > v_available then
      raise exception using errcode = 'P0001', message = 'WELFARE_INSUFFICIENT_BALANCE';
    end if;
    update public.welfare_expenses set status = 'paid', paid_at = now(),
      approved_by_user_id = p_actor_user_id, approved_by_name = p_actor_name,
      approved_at = now(), updated_at = now()
    where id = p_record_id and family_id = p_family_id
    returning * into v_expense;
    v_result := to_jsonb(v_expense);
    v_table := 'welfare_expenses';
    v_action := 'welfare_expense_paid';
  elsif p_entity = 'contribution' then
    if v_contribution.amount > v_available then
      raise exception using errcode = 'P0001', message = 'WELFARE_INSUFFICIENT_BALANCE';
    end if;
    update public.welfare_contributions set status = 'refunded', updated_at = now()
    where id = p_record_id and family_id = p_family_id
    returning * into v_contribution;
    v_result := to_jsonb(v_contribution);
    v_table := 'welfare_contributions';
    v_action := 'welfare_contribution_refunded';
  else
    v_approved_amount := coalesce(p_approved_amount, v_request.approved_amount);
    if v_approved_amount <= 0 or v_approved_amount > v_request.requested_amount then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_AMOUNT';
    end if;
    if coalesce(p_payment_method, '') not in ('cash', 'bank', 'mobile', 'card', 'other') then
      raise exception using errcode = 'P0001', message = 'WELFARE_INVALID_PAYMENT_METHOD';
    end if;

    select * into v_linked from public.welfare_expenses
    where family_id = p_family_id and linked_request_id = p_record_id for update;
    if v_linked.id is not null then
      if v_linked.fund_id <> v_fund_id or v_linked.amount <> v_approved_amount
        or v_linked.status <> 'paid' then
        raise exception using errcode = 'P0001', message = 'WELFARE_DISBURSEMENT_CONFLICT';
      end if;
    else
      if v_approved_amount > v_available then
        raise exception using errcode = 'P0001', message = 'WELFARE_INSUFFICIENT_BALANCE';
      end if;
      insert into public.welfare_expenses (
        family_id, fund_id, linked_request_id, title, beneficiary_name,
        category, amount, expense_date, payment_method, reference, notes,
        status, requested_by_user_id, approved_by_user_id, approved_by_name,
        approved_at, paid_at
      ) values (
        p_family_id, v_fund_id, p_record_id, 'সহায়তা: ' || v_request.title,
        v_request.requester_name,
        case when v_request.request_type in ('medical', 'education', 'emergency', 'charity')
          then v_request.request_type else 'other' end,
        v_approved_amount, current_date, p_payment_method, left(p_reference, 180),
        left(p_admin_note, 3000), 'paid', p_actor_user_id, p_actor_user_id,
        p_actor_name, now(), now()
      );
    end if;
    update public.welfare_requests set status = 'disbursed',
      approved_amount = v_approved_amount, admin_note = left(p_admin_note, 3000),
      reviewed_by_user_id = p_actor_user_id, reviewed_by_name = p_actor_name,
      reviewed_at = now(), updated_at = now()
    where id = p_record_id and family_id = p_family_id
    returning * into v_request;
    v_result := to_jsonb(v_request);
    v_table := 'welfare_requests';
    v_action := 'welfare_request_disbursed';
  end if;

  insert into public.audit_logs (family_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_family_id, p_actor_user_id, v_action, v_table, p_record_id::text,
    jsonb_build_object('module', 'welfare', 'atomic_outflow', true));
  return v_result;
end;
$$;

revoke all on function public.settle_welfare_outflow(uuid,text,uuid,text,text,numeric,text,text,text)
  from public, anon, authenticated;
grant execute on function public.settle_welfare_outflow(uuid,text,uuid,text,text,numeric,text,text,text)
  to service_role;
