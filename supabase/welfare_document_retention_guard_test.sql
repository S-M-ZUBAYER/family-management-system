-- Run only after 20261001_welfare_document_retention_guard.sql in staging.
-- Uses synthetic rows and rolls them all back; do not run on a real family.
begin;

do $$
declare
  v_family uuid;
  v_other_family uuid;
  v_fund uuid;
  v_contribution uuid;
  v_request uuid;
  v_document uuid;
  v_request_document uuid;
  v_actor text := 'welfare-document-test-actor';
begin
  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values ('পরীক্ষা পরিবার', 'Document retention test',
    'welfare-doc-' || replace(gen_random_uuid()::text, '-', ''),
    'WD-' || replace(gen_random_uuid()::text, '-', ''), v_actor)
  returning id into v_family;

  insert into public.families (name_bn, name_en, slug, join_code, created_by_user_id)
  values ('অন্য পরীক্ষা পরিবার', 'Other document test family',
    'welfare-doc-' || replace(gen_random_uuid()::text, '-', ''),
    'WD-' || replace(gen_random_uuid()::text, '-', ''), v_actor)
  returning id into v_other_family;

  insert into public.welfare_funds (family_id, name, created_by_user_id)
  values (v_family, 'Document test fund', v_actor)
  returning id into v_fund;

  insert into public.welfare_contributions
    (family_id, fund_id, contributor_name, amount, submitted_by_user_id)
  values (v_family, v_fund, 'Synthetic donor', 10, v_actor)
  returning id into v_contribution;

  insert into public.welfare_documents
    (family_id, entity_type, entity_id, storage_key, file_name, mime_type,
     file_size, title, uploaded_by_user_id, uploaded_by_name)
  values (v_family, 'contribution', v_contribution,
    'test/welfare/' || gen_random_uuid()::text, 'test.pdf', 'application/pdf',
    1, 'Synthetic receipt', v_actor, 'Test actor')
  returning id into v_document;

  begin
    delete from public.welfare_contributions where id = v_contribution;
    raise exception 'Parent delete unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WELFARE_DOCUMENTS_ATTACHED' then raise; end if;
  end;

  begin
    update public.welfare_documents set entity_id = v_fund where id = v_document;
    raise exception 'Document reassignment unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WELFARE_DOCUMENT_LINK_IMMUTABLE' then raise; end if;
  end;

  begin
    insert into public.welfare_documents
      (family_id, entity_type, entity_id, storage_key, file_name, mime_type,
       file_size, title, uploaded_by_user_id, uploaded_by_name)
    values (v_other_family, 'contribution', v_contribution,
      'test/welfare/' || gen_random_uuid()::text, 'wrong.pdf', 'application/pdf',
      1, 'Wrong-family receipt', v_actor, 'Test actor');
    raise exception 'Cross-family document unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WELFARE_DOCUMENT_PARENT_MISSING' then raise; end if;
  end;

  update public.welfare_contributions set status = 'approved' where id = v_contribution;
  begin
    delete from public.welfare_documents where id = v_document;
    raise exception 'Finalized document delete unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WELFARE_DOCUMENT_FINALIZED' then raise; end if;
  end;

  insert into public.welfare_requests
    (family_id, fund_id, requester_user_id, requester_name, title,
     description, requested_amount)
  values (v_family, v_fund, v_actor, 'Test requester', 'Draft request',
    'Synthetic request', 5)
  returning id into v_request;

  insert into public.welfare_documents
    (family_id, entity_type, entity_id, storage_key, file_name, mime_type,
     file_size, title, uploaded_by_user_id, uploaded_by_name)
  values (v_family, 'request', v_request,
    'test/welfare/' || gen_random_uuid()::text, 'draft.pdf', 'application/pdf',
    1, 'Draft evidence', v_actor, 'Test actor')
  returning id into v_request_document;

  delete from public.welfare_documents where id = v_request_document;
  delete from public.welfare_requests where id = v_request;
  if exists (select 1 from public.welfare_requests where id = v_request) then
    raise exception 'Draft request remained after document removal';
  end if;
  if not exists (select 1 from public.welfare_documents where id = v_document) then
    raise exception 'Finalized receipt was lost';
  end if;
end;
$$;

rollback;
