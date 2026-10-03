-- Run only after 20260926_qurbani_a_to_z.sql and
-- 20261001_qurbani_finalization_guard.sql. Prefer staging.
-- All synthetic rows are rolled back. Never use real family records.
begin;

do $$
declare
  v_family uuid;
  v_other_family uuid;
  v_campaign uuid;
  v_other_campaign uuid;
  v_empty_campaign uuid;
  v_participant uuid;
  v_actor text := 'qurbani-finalization-test';
begin
  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values (
    'পরীক্ষা পরিবার', 'Qurbani finalization test',
    'qurbani-test-' || replace(gen_random_uuid()::text, '-', ''),
    'QT-' || replace(gen_random_uuid()::text, '-', ''), v_actor
  ) returning id into v_family;

  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values (
    'অন্য পরীক্ষা পরিবার', 'Other Qurbani test',
    'qurbani-test-' || replace(gen_random_uuid()::text, '-', ''),
    'QT-' || replace(gen_random_uuid()::text, '-', ''), v_actor
  ) returning id into v_other_family;

  insert into public.qurbani_campaigns
    (family_id, title, year, status, created_by_user_id)
  values (v_family, 'Finalization test', 2026, 'planning', v_actor)
  returning id into v_campaign;

  insert into public.qurbani_campaigns
    (family_id, title, year, status, created_by_user_id)
  values (v_other_family, 'Other test', 2026, 'planning', v_actor)
  returning id into v_other_campaign;

  insert into public.qurbani_campaigns
    (family_id, title, year, status, created_by_user_id)
  values (v_family, 'Empty draft', 2027, 'planning', v_actor)
  returning id into v_empty_campaign;

  begin
    insert into public.qurbani_campaigns
      (family_id, title, year, status, created_by_user_id)
    values (v_family, 'Invalid start', 2028, 'closed', v_actor);
    raise exception 'Finalized campaign was created';
  exception when sqlstate '23514' then
    if position('QURBANI_FINALIZED' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    insert into public.qurbani_participants
      (family_id, campaign_id, member_name, created_by_user_id)
    values (v_family, v_other_campaign, 'Cross-family participant', v_actor);
    raise exception 'Cross-family Qurbani record was created';
  exception when sqlstate '23503' then
    if position('QURBANI_CAMPAIGN_NOT_FOUND' in sqlerrm) = 0 then raise; end if;
  end;

  insert into public.qurbani_participants
    (family_id, campaign_id, member_name, created_by_user_id)
  values (v_family, v_campaign, 'Test participant', v_actor)
  returning id into v_participant;

  begin
    delete from public.qurbani_campaigns where id = v_campaign;
    raise exception 'Nonempty campaign was deleted';
  exception when sqlstate '23514' then
    if position('QURBANI_DRAFT_NOT_EMPTY' in sqlerrm) = 0 then raise; end if;
  end;

  update public.qurbani_campaigns set status = 'settled' where id = v_campaign;

  begin
    insert into public.qurbani_participants
      (family_id, campaign_id, member_name, created_by_user_id)
    values (v_family, v_campaign, 'Too late', v_actor);
    raise exception 'Participant was inserted after settlement';
  exception when sqlstate '23514' then
    if position('QURBANI_FINALIZED' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.qurbani_participants set member_name = 'Changed' where id = v_participant;
    raise exception 'Participant was updated after settlement';
  exception when sqlstate '23514' then
    if position('QURBANI_FINALIZED' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.qurbani_participants where id = v_participant;
    raise exception 'Participant was deleted after settlement';
  exception when sqlstate '23514' then
    if position('QURBANI_FINALIZED' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.qurbani_campaigns set title = 'Changed' where id = v_campaign;
    raise exception 'Settled campaign details were changed';
  exception when sqlstate '23514' then
    if position('QURBANI_FINALIZED' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.qurbani_campaigns set status = 'distribution' where id = v_campaign;
    raise exception 'Settled campaign was reopened';
  exception when sqlstate '23514' then
    if position('QURBANI_FINALIZED' in sqlerrm) = 0 then raise; end if;
  end;

  update public.qurbani_campaigns set status = 'closed', updated_at = now()
  where id = v_campaign;

  begin
    update public.qurbani_campaigns set status = 'planning' where id = v_campaign;
    raise exception 'Closed campaign was reopened';
  exception when sqlstate '23514' then
    if position('QURBANI_FINALIZED' in sqlerrm) = 0 then raise; end if;
  end;

  delete from public.qurbani_campaigns where id = v_empty_campaign;
  if exists (select 1 from public.qurbani_campaigns where id = v_empty_campaign) then
    raise exception 'Empty planning campaign was not deleted';
  end if;

  if not exists (
    select 1 from public.qurbani_participants
    where id = v_participant and member_name = 'Test participant'
  ) then
    raise exception 'Finalized participant was lost or modified';
  end if;
end;
$$;

rollback;
