-- Run only after 20260930_welfare_disbursement_guard.sql and
-- 20261001_welfare_atomic_outflows.sql have been applied. Prefer a staging
-- project. This test inserts synthetic records inside a transaction and
-- rolls them all back; it never uses real family or payment records.
begin;

do $$
declare
  v_family uuid;
  v_fund uuid;
  v_expense uuid;
  v_large_expense uuid;
  v_request uuid;
  v_contribution uuid;
  v_actor text := 'welfare-atomic-test-actor';
  v_result jsonb;
  v_count integer;
begin
  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values (
    'পরীক্ষা পরিবার', 'Welfare atomic test',
    'welfare-test-' || replace(gen_random_uuid()::text, '-', ''),
    'WT-' || replace(gen_random_uuid()::text, '-', ''), v_actor
  ) returning id into v_family;

  insert into public.family_memberships (family_id, auth_user_id, role, status)
  values (v_family, v_actor, 'family_admin', 'active');

  insert into public.welfare_funds
    (family_id, name, opening_balance, created_by_user_id)
  values (v_family, 'Atomic test fund', 150, v_actor)
  returning id into v_fund;

  insert into public.welfare_expenses
    (family_id, fund_id, title, amount, status, requested_by_user_id)
  values (v_family, v_fund, 'Approved expense', 60, 'approved', v_actor)
  returning id into v_expense;

  insert into public.welfare_expenses
    (family_id, fund_id, title, amount, status, requested_by_user_id)
  values (v_family, v_fund, 'Over balance', 100, 'approved', v_actor)
  returning id into v_large_expense;

  insert into public.welfare_requests
    (family_id, fund_id, requester_user_id, requester_name, title,
     description, requested_amount, approved_amount, status)
  values (v_family, v_fund, v_actor, 'Test requester', 'Test assistance',
          'Synthetic request', 40, 35, 'approved')
  returning id into v_request;

  insert into public.welfare_contributions
    (family_id, fund_id, contributor_name, amount, status, submitted_by_user_id)
  values (v_family, v_fund, 'Test contributor', 10, 'approved', v_actor)
  returning id into v_contribution;

  begin
    perform public.settle_welfare_outflow(v_family, 'expense', v_expense,
      'not-a-member', 'Intruder');
    raise exception 'Unauthorized outflow unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WELFARE_UNAUTHORIZED' then raise; end if;
  end;

  v_result := public.settle_welfare_outflow(v_family, 'expense', v_expense,
    v_actor, 'Test Admin');
  if v_result->>'status' <> 'paid' then
    raise exception 'Approved expense was not paid';
  end if;

  v_result := public.settle_welfare_outflow(v_family, 'request', v_request,
    v_actor, 'Test Admin', 35, 'Approved test aid', 'bank', 'TEST-REF');
  if v_result->>'status' <> 'disbursed' then
    raise exception 'Approved request was not disbursed';
  end if;

  select count(*) into v_count from public.welfare_expenses
  where family_id = v_family and linked_request_id = v_request
    and status = 'paid' and amount = 35;
  if v_count <> 1 then
    raise exception 'Expected exactly one linked paid expense, got %', v_count;
  end if;

  v_result := public.settle_welfare_outflow(v_family, 'contribution',
    v_contribution, v_actor, 'Test Admin');
  if v_result->>'status' <> 'refunded' then
    raise exception 'Approved contribution was not refunded';
  end if;

  begin
    perform public.settle_welfare_outflow(v_family, 'expense', v_large_expense,
      v_actor, 'Test Admin');
    raise exception 'Over-balance expense unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WELFARE_INSUFFICIENT_BALANCE' then raise; end if;
  end;

  if (select status from public.welfare_expenses where id = v_large_expense)
    <> 'approved' then
    raise exception 'Failed payment changed the expense status';
  end if;

  begin
    perform public.settle_welfare_outflow(v_family, 'request', v_request,
      v_actor, 'Test Admin', 35);
    raise exception 'Repeated disbursement unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WELFARE_INVALID_TRANSITION' then raise; end if;
  end;

  select count(*) into v_count from public.audit_logs
  where family_id = v_family and metadata->>'atomic_outflow' = 'true';
  if v_count <> 3 then
    raise exception 'Expected three atomic audit events, got %', v_count;
  end if;
end;
$$;

rollback;

-- Concurrency requires two separate database sessions. In staging, create
-- two approved expenses whose sum exceeds one fund's available balance, then
-- pay them simultaneously. Exactly one should succeed; the other must return
-- WELFARE_INSUFFICIENT_BALANCE. Also test request disbursement against a
-- concurrent payment of an existing linked expense to detect deadlocks.
