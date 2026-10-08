-- Read-only installation/privilege baseline. Run before rollback acceptance,
-- preferably in staging. This neither applies migrations nor reads personal rows.
begin read only;
with installed as (
  select p.oid, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid = to_regprocedure('public.settle_welfare_outflow(uuid,text,uuid,text,text,numeric,text,text,text)')
), link_index as (
  select i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid) as definition
  from pg_index i
  where i.indexrelid = to_regclass('public.welfare_expenses_one_per_request_idx')
)
select jsonb_build_object(
  'rpc_installed', exists(select 1 from installed),
  'security_invoker', (select not prosecdef from installed),
  'function_config', (select to_jsonb(proconfig) from installed),
  'anon_execute', coalesce((select has_function_privilege('anon', oid, 'EXECUTE') from installed), false),
  'authenticated_execute', coalesce((select has_function_privilege('authenticated', oid, 'EXECUTE') from installed), false),
  'service_role_execute', coalesce((select has_function_privilege('service_role', oid, 'EXECUTE') from installed), false),
  'fund_lock_present', (select definition like '%where id = v_fund_id and family_id = p_family_id for update%' from installed),
  'scoped_actor_guard_present', (select definition like '%m.family_id = p_family_id and m.auth_user_id = p_actor_user_id%' from installed),
  'balance_guard_present', (select definition like '%WELFARE_INSUFFICIENT_BALANCE%' from installed),
  'audit_markers_present', (select definition like '%public.audit_logs%' and definition like '%atomic_outflow%' from installed),
  'linked_request_unique_valid', (select indisunique and indisvalid from link_index),
  'linked_request_index', (select definition from link_index),
  'document_guards', (select jsonb_agg(jsonb_build_object('name', t.tgname,
    'table', c.relname, 'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid)) order by t.tgname)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and t.tgname in ('welfare_document_relation_guard',
      'welfare_fund_document_delete_guard', 'welfare_contribution_document_delete_guard',
      'welfare_expense_document_delete_guard', 'welfare_request_document_delete_guard')),
  'baseline_counts', jsonb_build_object(
    'families', (select count(*) from public.families),
    'memberships', (select count(*) from public.family_memberships),
    'funds', (select count(*) from public.welfare_funds),
    'contributions', (select count(*) from public.welfare_contributions),
    'expenses', (select count(*) from public.welfare_expenses),
    'requests', (select count(*) from public.welfare_requests),
    'documents', (select count(*) from public.welfare_documents),
    'audits', (select count(*) from public.audit_logs)
  )
) as welfare_preflight;
rollback;
