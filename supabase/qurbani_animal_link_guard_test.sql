-- Run in staging after 20261007_qurbani_animal_link_guard.sql.
-- Synthetic rows are rolled back; existing families and records are untouched.
begin;

do $$
declare
  v_actor text := 'qurbani-animal-link-test';
  v_family uuid;
  v_campaign uuid;
  v_animal uuid;
  v_participant uuid;
  v_transaction uuid;
  v_schedule uuid;
begin
  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values ('পশুর সংযোগ পরীক্ষা', 'Animal link test',
          'animal-link-test-' || replace(gen_random_uuid()::text, '-', ''),
          'ALT-' || replace(gen_random_uuid()::text, '-', ''), v_actor)
  returning id into v_family;

  insert into public.qurbani_campaigns (family_id, title, year, status, created_by_user_id)
  values (v_family, 'Animal link test', 2028, 'planning', v_actor)
  returning id into v_campaign;

  insert into public.qurbani_animals (family_id, campaign_id, tag_code, created_by_user_id)
  values (v_family, v_campaign, 'QA-LINK-ANIMAL', v_actor)
  returning id into v_animal;

  insert into public.qurbani_participants
    (family_id, campaign_id, animal_id, member_name, created_by_user_id)
  values (v_family, v_campaign, v_animal, 'QA participant', v_actor)
  returning id into v_participant;
  begin
    delete from public.qurbani_animals where id = v_animal;
    raise exception 'Linked participant animal was deleted';
  exception when foreign_key_violation then
    if position('qurbani_participants_animal_id_fkey' in sqlerrm) = 0 then raise; end if;
  end;
  if not exists (select 1 from public.qurbani_participants where id = v_participant and animal_id = v_animal) then
    raise exception 'Participant animal link was lost';
  end if;
  update public.qurbani_participants set animal_id = null where id = v_participant;

  insert into public.qurbani_transactions
    (family_id, campaign_id, animal_id, transaction_type, category, amount, created_by_user_id)
  values (v_family, v_campaign, v_animal, 'expense', 'animal_purchase', 10, v_actor)
  returning id into v_transaction;
  begin
    delete from public.qurbani_animals where id = v_animal;
    raise exception 'Linked ledger animal was deleted';
  exception when foreign_key_violation then
    if position('qurbani_transactions_animal_id_fkey' in sqlerrm) = 0 then raise; end if;
  end;
  if not exists (select 1 from public.qurbani_transactions where id = v_transaction and animal_id = v_animal) then
    raise exception 'Ledger animal link was lost';
  end if;
  update public.qurbani_transactions set animal_id = null where id = v_transaction;

  insert into public.qurbani_schedules
    (family_id, campaign_id, animal_id, scheduled_at, created_by_user_id)
  values (v_family, v_campaign, v_animal, now(), v_actor)
  returning id into v_schedule;
  begin
    delete from public.qurbani_animals where id = v_animal;
    raise exception 'Linked schedule animal was deleted';
  exception when foreign_key_violation then
    if position('qurbani_schedules_animal_id_fkey' in sqlerrm) = 0 then raise; end if;
  end;
  if not exists (select 1 from public.qurbani_schedules where id = v_schedule and animal_id = v_animal) then
    raise exception 'Schedule animal link was lost';
  end if;
  update public.qurbani_schedules set animal_id = null where id = v_schedule;

  delete from public.qurbani_animals where id = v_animal;
  if exists (select 1 from public.qurbani_animals where id = v_animal) then
    raise exception 'Unlinked animal could not be deleted';
  end if;
end;
$$;

rollback;
