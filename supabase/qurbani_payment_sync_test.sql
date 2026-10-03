-- Run in staging after 20261003_qurbani_payment_sync.sql.
-- All synthetic rows are rolled back. No existing family rows are modified.
begin;

do $$
declare
  v_actor text := 'qurbani-payment-sync-test';
  v_family uuid;
  v_other_family uuid;
  v_campaign uuid;
  v_other_campaign uuid;
  v_participant uuid;
  v_second_participant uuid;
  v_other_participant uuid;
  v_collection uuid;
  v_refund uuid;
  v_paid numeric(14,2);
begin
  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values ('পেমেন্ট পরীক্ষা', 'Payment test', 'payment-test-' || replace(gen_random_uuid()::text, '-', ''),
          'PT-' || replace(gen_random_uuid()::text, '-', ''), v_actor)
  returning id into v_family;
  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values ('অন্য পেমেন্ট পরীক্ষা', 'Other payment test', 'payment-test-' || replace(gen_random_uuid()::text, '-', ''),
          'PT-' || replace(gen_random_uuid()::text, '-', ''), v_actor)
  returning id into v_other_family;
  insert into public.qurbani_campaigns (family_id, title, year, status, created_by_user_id)
  values (v_family, 'Payment sync test', 2028, 'planning', v_actor) returning id into v_campaign;
  insert into public.qurbani_campaigns (family_id, title, year, status, created_by_user_id)
  values (v_other_family, 'Other payment test', 2028, 'planning', v_actor) returning id into v_other_campaign;
  insert into public.qurbani_participants (family_id, campaign_id, member_name, amount_due, created_by_user_id)
  values (v_family, v_campaign, 'Test participant', 500, v_actor) returning id into v_participant;
  insert into public.qurbani_participants (family_id, campaign_id, member_name, amount_due, created_by_user_id)
  values (v_family, v_campaign, 'Second participant', 500, v_actor) returning id into v_second_participant;
  insert into public.qurbani_participants (family_id, campaign_id, member_name, amount_due, created_by_user_id)
  values (v_other_family, v_other_campaign, 'Other participant', 500, v_actor) returning id into v_other_participant;

  begin
    insert into public.qurbani_transactions
      (family_id, campaign_id, category, transaction_type, amount, created_by_user_id)
    values (v_family, v_campaign, 'share_payment', 'collection', 20, v_actor);
    raise exception 'Unlinked share payment was accepted';
  exception when sqlstate '23514' then
    if position('QURBANI_PAYMENT_LINK_INVALID' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    insert into public.qurbani_transactions
      (family_id, campaign_id, participant_id, category, transaction_type, amount, created_by_user_id)
    values (v_family, v_campaign, v_other_participant, 'share_payment', 'collection', 20, v_actor);
    raise exception 'Cross-family share payment was accepted';
  exception when sqlstate '23514' then
    if position('QURBANI_PAYMENT_LINK_INVALID' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    insert into public.qurbani_transactions
      (family_id, campaign_id, participant_id, category, transaction_type, amount, created_by_user_id)
    values (v_family, v_campaign, v_participant, 'share_payment', 'expense', 20, v_actor);
    raise exception 'Share-payment expense was accepted';
  exception when sqlstate '23514' then
    if position('QURBANI_PAYMENT_LINK_INVALID' in sqlerrm) = 0 then raise; end if;
  end;

  insert into public.qurbani_transactions
    (family_id, campaign_id, participant_id, category, transaction_type, amount, created_by_user_id)
  values (v_family, v_campaign, v_participant, 'share_payment', 'collection', 200.50, v_actor)
  returning id into v_collection;
  select amount_paid into v_paid from public.qurbani_participants where id = v_participant;
  if v_paid <> 200.50 then raise exception 'Collection did not update paid: %', v_paid; end if;

  update public.qurbani_transactions set amount = 250.75 where id = v_collection;
  select amount_paid into v_paid from public.qurbani_participants where id = v_participant;
  if v_paid <> 250.75 then raise exception 'Edit did not update paid: %', v_paid; end if;

  update public.qurbani_transactions set participant_id = v_second_participant where id = v_collection;
  select amount_paid into v_paid from public.qurbani_participants where id = v_participant;
  if v_paid <> 0 then raise exception 'Reassignment did not debit first participant: %', v_paid; end if;
  select amount_paid into v_paid from public.qurbani_participants where id = v_second_participant;
  if v_paid <> 250.75 then raise exception 'Reassignment did not credit second participant: %', v_paid; end if;
  update public.qurbani_transactions set participant_id = v_participant where id = v_collection;

  insert into public.qurbani_transactions
    (family_id, campaign_id, participant_id, category, transaction_type, amount, created_by_user_id)
  values (v_family, v_campaign, v_participant, 'share_payment', 'refund', 50.25, v_actor)
  returning id into v_refund;
  select amount_paid into v_paid from public.qurbani_participants where id = v_participant;
  if v_paid <> 200.50 then raise exception 'Refund did not update paid: %', v_paid; end if;

  begin
    delete from public.qurbani_participants where id = v_participant;
    raise exception 'Participant with linked payment was deleted';
  exception when sqlstate '23514' then
    if position('QURBANI_PAYMENT_LINKED' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    insert into public.qurbani_transactions
      (family_id, campaign_id, participant_id, category, transaction_type, amount, created_by_user_id)
    values (v_family, v_campaign, v_participant, 'share_payment', 'refund', 999, v_actor);
    raise exception 'Over-refund was accepted';
  exception when sqlstate '23514' then
    if position('qurbani_participants_amount_paid_check' in sqlerrm) = 0
       and position('violates check constraint' in sqlerrm) = 0 then raise; end if;
  end;

  -- A legacy/manual paid balance must not be silently treated as a ledger payment.
  update public.qurbani_participants set amount_paid = 201 where id = v_participant;
  begin
    update public.qurbani_campaigns set status = 'settled' where id = v_campaign;
    raise exception 'Unbalanced campaign was settled';
  exception when sqlstate '23514' then
    if position('QURBANI_PAYMENT_RECONCILIATION_REQUIRED' in sqlerrm) = 0 then raise; end if;
  end;
  update public.qurbani_participants set amount_paid = 200.50 where id = v_participant;
  delete from public.qurbani_transactions where id = v_refund;
  select amount_paid into v_paid from public.qurbani_participants where id = v_participant;
  if v_paid <> 250.75 then raise exception 'Refund delete did not update paid: %', v_paid; end if;
  delete from public.qurbani_transactions where id = v_collection;
  select amount_paid into v_paid from public.qurbani_participants where id = v_participant;
  if v_paid <> 0 then raise exception 'Collection delete did not update paid: %', v_paid; end if;
  update public.qurbani_campaigns set status = 'settled' where id = v_campaign;
  if not exists (select 1 from public.qurbani_campaigns where id = v_campaign and status = 'settled') then
    raise exception 'Balanced campaign could not settle';
  end if;
end;
$$;

rollback;
