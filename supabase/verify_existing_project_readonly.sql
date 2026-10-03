-- Run once in the EXISTING project's Supabase SQL Editor.
-- This query changes no data or schema and returns no member records or secrets.
-- REVIEW counts need investigation; never delete financial or document history blindly.
-- Do not rerun migrations merely because a table already exists.
with expected(kind, object_name, parent_table) as (
  values
    ('index', 'chat_channels_one_general_per_family', 'chat_channels'),
    ('index', 'chat_channels_direct_key_unique', 'chat_channels'),
    ('index', 'welfare_expenses_one_per_request_idx', 'welfare_expenses'),
    ('function', 'create_default_family_chat_channel()', null),
    ('function', 'settle_welfare_outflow(uuid,text,uuid,text,text,numeric,text,text,text)', null),
    ('function', 'guard_qurbani_campaign_finalization()', null),
    ('function', 'guard_qurbani_child_finalization()', null),
    ('function', 'guard_welfare_document_relation()', null),
    ('function', 'guard_welfare_parent_with_documents()', null),
    ('trigger', 'families_create_default_chat', 'families'),
    ('trigger', 'qurbani_campaign_finalization_guard', 'qurbani_campaigns'),
    ('trigger', 'qurbani_participants_finalization_guard', 'qurbani_participants'),
    ('trigger', 'qurbani_animals_finalization_guard', 'qurbani_animals'),
    ('trigger', 'qurbani_transactions_finalization_guard', 'qurbani_transactions'),
    ('trigger', 'qurbani_vendors_finalization_guard', 'qurbani_vendors'),
    ('trigger', 'qurbani_schedules_finalization_guard', 'qurbani_schedules'),
    ('trigger', 'qurbani_tasks_finalization_guard', 'qurbani_tasks'),
    ('trigger', 'qurbani_distributions_finalization_guard', 'qurbani_distributions'),
    ('trigger', 'welfare_document_relation_guard', 'welfare_documents'),
    ('trigger', 'welfare_fund_document_delete_guard', 'welfare_funds'),
    ('trigger', 'welfare_contribution_document_delete_guard', 'welfare_contributions'),
    ('trigger', 'welfare_expense_document_delete_guard', 'welfare_expenses'),
    ('trigger', 'welfare_request_document_delete_guard', 'welfare_requests')
), checks as (
  select e.kind, e.object_name, e.parent_table,
    case e.kind
      when 'index' then exists (
        select 1 from pg_class idx
        join pg_namespace ns on ns.oid = idx.relnamespace
        join pg_index ix on ix.indexrelid = idx.oid
        join pg_class parent on parent.oid = ix.indrelid
        where ns.nspname = 'public' and idx.relname = e.object_name
          and parent.relname = e.parent_table and ix.indisvalid and ix.indisunique
      )
      when 'function' then to_regprocedure('public.' || e.object_name) is not null
      when 'trigger' then exists (
        select 1 from pg_trigger tr
        join pg_class parent on parent.oid = tr.tgrelid
        join pg_namespace ns on ns.oid = parent.relnamespace
        where ns.nspname = 'public' and parent.relname = e.parent_table
          and tr.tgname = e.object_name and not tr.tgisinternal and tr.tgenabled <> 'D'
      )
    end as present
  from expected e
), rpc as (
  select
    to_regprocedure('public.settle_welfare_outflow(uuid,text,uuid,text,text,numeric,text,text,text)') as oid,
    to_regprocedure('public.review_member_request(uuid,text,text,text)') as review_oid
), duplicate_expense_links as (
  select count(*) as groups_found
  from (
    select family_id, linked_request_id
    from public.welfare_expenses
    where linked_request_id is not null
    group by family_id, linked_request_id
    having count(*) > 1
  ) duplicates
), orphan_welfare_documents as (
  select count(*) as records_found
  from public.welfare_documents d
  where (d.entity_type = 'fund' and not exists (
      select 1 from public.welfare_funds p where p.id = d.entity_id and p.family_id = d.family_id
    ))
    or (d.entity_type = 'contribution' and not exists (
      select 1 from public.welfare_contributions p where p.id = d.entity_id and p.family_id = d.family_id
    ))
    or (d.entity_type = 'expense' and not exists (
      select 1 from public.welfare_expenses p where p.id = d.entity_id and p.family_id = d.family_id
    ))
    or (d.entity_type = 'request' and not exists (
      select 1 from public.welfare_requests p where p.id = d.entity_id and p.family_id = d.family_id
    ))
), orphan_household_documents as (
  select count(*) as records_found
  from public.household_documents d
  where (d.entity_type = 'shopping_list' and not exists (
      select 1 from public.household_shopping_lists p where p.id = d.entity_id and p.family_id = d.family_id
    ))
    or (d.entity_type = 'bill' and not exists (
      select 1 from public.household_utility_bills p where p.id = d.entity_id and p.family_id = d.family_id
    ))
    or (d.entity_type = 'maintenance' and not exists (
      select 1 from public.household_maintenance_requests p where p.id = d.entity_id and p.family_id = d.family_id
    ))
)
select kind, object_name, coalesce(parent_table, '') as parent_table,
  case when present then 'OK' else 'MISSING_OR_DISABLED' end as result
from checks
union all
select 'permission', 'settle_welfare_outflow service_role EXECUTE', '',
  case when oid is not null and has_function_privilege('service_role', oid, 'EXECUTE') then 'OK' else 'MISSING_OR_DISABLED' end
from rpc
union all
select 'function', 'review_member_request reapproval guard', '',
  case when review_oid is not null
    and position('Membership already exists; explicit restoration is required' in pg_get_functiondef(review_oid)) > 0
    and position('on conflict (family_id, auth_user_id) do nothing' in lower(pg_get_functiondef(review_oid))) > 0
    then 'OK' else 'MISSING_OR_DISABLED' end
from rpc
union all
select 'permission', 'review_member_request service_role EXECUTE', '',
  case when review_oid is not null and has_function_privilege('service_role', review_oid, 'EXECUTE') then 'OK' else 'MISSING_OR_DISABLED' end
from rpc
union all
select 'permission', 'review_member_request anon/authenticated denied', '',
  case when review_oid is not null
    and not has_function_privilege('anon', review_oid, 'EXECUTE')
    and not has_function_privilege('authenticated', review_oid, 'EXECUTE')
    then 'OK' else 'MISSING_OR_DISABLED' end
from rpc
union all
select 'permission', 'settle_welfare_outflow anon denied', '',
  case when oid is not null and not has_function_privilege('anon', oid, 'EXECUTE') then 'OK' else 'MISSING_OR_DISABLED' end
from rpc
union all
select 'permission', 'settle_welfare_outflow authenticated denied', '',
  case when oid is not null and not has_function_privilege('authenticated', oid, 'EXECUTE') then 'OK' else 'MISSING_OR_DISABLED' end
from rpc
union all
select 'integrity', 'duplicate Welfare expense/request links', '',
  case when groups_found = 0 then 'OK' else 'REVIEW: ' || groups_found::text || ' duplicate groups' end
from duplicate_expense_links
union all
select 'integrity', 'orphan Welfare document records', '',
  case when records_found = 0 then 'OK' else 'REVIEW: ' || records_found::text || ' records' end
from orphan_welfare_documents
union all
select 'integrity', 'orphan Household document records', '',
  case when records_found = 0 then 'OK' else 'REVIEW: ' || records_found::text || ' records' end
from orphan_household_documents
union all
-- Trigger functions cannot be invoked as ordinary RPCs; check callable functions.
select 'permission', 'non-trigger functions callable by browser roles', '',
  case when count(*) = 0 then 'OK' else 'REVIEW: ' || string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype <> 'pg_catalog.trigger'::regtype
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
union all
select 'rls', 'public tables with RLS disabled', '',
  case when count(*) = 0 then 'OK' else 'REVIEW: ' || string_agg(c.relname, ', ' order by c.relname) end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
order by kind, object_name;
