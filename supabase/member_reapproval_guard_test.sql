-- Staging-only, rollback-only check after 20261002_member_reapproval_guard.sql.
-- Do not run against production without a reviewed test plan.
begin;

do $$
declare
  test_family_id uuid;
  fresh_request_id uuid;
  suspended_request_id uuid;
  active_request_id uuid;
  reviewer_id text;
  fresh_id text;
  suspended_id text;
  active_id text;
  result jsonb;
begin
  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values ('পরীক্ষা পরিবার', 'Membership guard test', 'member-guard-' || replace(gen_random_uuid()::text, '-', ''), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), 'member-guard-test')
  returning id into test_family_id;

  reviewer_id := 'reviewer-' || test_family_id::text;
  fresh_id := 'fresh-' || test_family_id::text;
  suspended_id := 'suspended-' || test_family_id::text;
  active_id := 'active-' || test_family_id::text;

  insert into public.family_memberships (family_id, auth_user_id, role, status)
  values
    (test_family_id, reviewer_id, 'owner', 'active'),
    (test_family_id, suspended_id, 'member', 'suspended'),
    (test_family_id, active_id, 'member', 'active');

  insert into public.family_member_requests (family_id, requester_user_id, requested_name_bn, relationship_text)
  values (test_family_id, fresh_id, 'নতুন সদস্য', 'relative')
  returning id into fresh_request_id;
  result := public.review_member_request(fresh_request_id, 'approve', reviewer_id, null);
  if result->>'status' <> 'approved' or not exists (
    select 1 from public.family_memberships
    where family_id = test_family_id and auth_user_id = fresh_id and status = 'active'
  ) then
    raise exception 'Fresh member approval did not create an active membership';
  end if;

  insert into public.family_member_requests (family_id, requester_user_id, requested_name_bn, relationship_text)
  values (test_family_id, suspended_id, 'স্থগিত সদস্য', 'relative')
  returning id into suspended_request_id;
  begin
    perform public.review_member_request(suspended_request_id, 'approve', reviewer_id, null);
    raise exception 'TEST FAILED: suspended membership was reactivated';
  exception when others then
    if sqlerrm not like 'Membership already exists; explicit restoration is required%' then raise; end if;
  end;
  if not exists (
    select 1 from public.family_memberships
    where family_id = test_family_id and auth_user_id = suspended_id and status = 'suspended'
  ) or not exists (
    select 1 from public.family_member_requests where id = suspended_request_id and status = 'pending'
  ) then
    raise exception 'Suspended membership/request changed after rejected approval';
  end if;

  insert into public.family_member_requests (family_id, requester_user_id, requested_name_bn, relationship_text)
  values (test_family_id, active_id, 'সক্রিয় সদস্য', 'relative')
  returning id into active_request_id;
  begin
    perform public.review_member_request(active_request_id, 'approve', reviewer_id, null);
    raise exception 'TEST FAILED: existing active membership was approved again';
  exception when others then
    if sqlerrm not like 'Membership already exists; explicit restoration is required%' then raise; end if;
  end;

  result := public.review_member_request(suspended_request_id, 'reject', reviewer_id, 'Existing access requires a separate review.');
  if result->>'status' <> 'rejected' or not exists (
    select 1 from public.family_memberships
    where family_id = test_family_id and auth_user_id = suspended_id and status = 'suspended'
  ) then
    raise exception 'Rejection unexpectedly changed suspended membership';
  end if;
end;
$$;

rollback;
