-- Prevent stale pending requests from reactivating a suspended or departed member.
-- Apply only after reviewing the existing function in the target project.
create or replace function public.review_member_request(
  p_request_id uuid,
  p_decision text,
  p_reviewer_user_id text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.family_member_requests%rowtype;
  reviewer_role text;
  new_profile_id uuid;
  new_membership_id uuid;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unsupported review decision';
  end if;

  select * into request_row
  from public.family_member_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Membership request not found';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'Membership request is no longer pending';
  end if;

  select role into reviewer_role
  from public.family_memberships
  where family_id = request_row.family_id
    and auth_user_id = p_reviewer_user_id
    and status = 'active';

  if reviewer_role is null or reviewer_role not in ('owner', 'family_admin') then
    raise exception 'Family Admin permission is required';
  end if;

  if p_decision = 'approve' then
    if exists (
      select 1 from public.family_memberships
      where family_id = request_row.family_id
        and auth_user_id = request_row.requester_user_id
    ) then
      raise exception 'Membership already exists; explicit restoration is required';
    end if;

    insert into public.member_profiles (
      family_id,
      auth_user_id,
      name_bn,
      name_en,
      email,
      phone,
      relationship_text
    ) values (
      request_row.family_id,
      request_row.requester_user_id,
      request_row.requested_name_bn,
      request_row.requested_name_en,
      request_row.email,
      request_row.phone,
      request_row.relationship_text
    )
    on conflict (family_id, auth_user_id) where auth_user_id is not null
    do update set
      name_bn = excluded.name_bn,
      name_en = excluded.name_en,
      email = excluded.email,
      phone = excluded.phone,
      relationship_text = excluded.relationship_text,
      updated_at = now()
    returning id into new_profile_id;

    insert into public.family_memberships (
      family_id,
      auth_user_id,
      member_profile_id,
      role,
      status
    ) values (
      request_row.family_id,
      request_row.requester_user_id,
      new_profile_id,
      request_row.requested_role,
      'active'
    )
    on conflict (family_id, auth_user_id) do nothing
    returning id into new_membership_id;

    if new_membership_id is null then
      raise exception 'Membership already exists; explicit restoration is required';
    end if;
  end if;

  update public.family_member_requests
  set
    status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    rejection_reason = case when p_decision = 'reject' then nullif(trim(p_rejection_reason), '') else null end,
    reviewed_by_user_id = p_reviewer_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id;

  insert into public.audit_logs (
    family_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    request_row.family_id,
    p_reviewer_user_id,
    'member_request_' || p_decision,
    'family_member_request',
    p_request_id::text,
    jsonb_build_object('requested_user_id', request_row.requester_user_id)
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'status', case when p_decision = 'approve' then 'approved' else 'rejected' end
  );
end;
$$;

revoke all on function public.review_member_request(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.review_member_request(uuid, text, text, text)
  to service_role;
