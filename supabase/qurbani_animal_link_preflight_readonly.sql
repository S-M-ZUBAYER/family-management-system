-- Read-only preflight for 20261007_qurbani_animal_link_guard.sql.
-- Run in each project's SQL Editor before applying the migration.
-- Expected: exactly three named FKs, each with delete_action = SET NULL before
-- migration or NO ACTION afterwards. All orphan_count values must be zero.
select
  c.conname as constraint_name,
  c.conrelid::regclass::text as referencing_table,
  case c.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end as delete_action,
  c.convalidated as validated
from pg_constraint c
where c.contype = 'f'
  and c.conname in (
    'qurbani_participants_animal_id_fkey',
    'qurbani_transactions_animal_id_fkey',
    'qurbani_schedules_animal_id_fkey'
  )
order by c.conname;

select 'qurbani_participants' as referencing_table, count(*) as orphan_count
from public.qurbani_participants child
left join public.qurbani_animals animal on animal.id = child.animal_id
where child.animal_id is not null and animal.id is null
union all
select 'qurbani_transactions', count(*)
from public.qurbani_transactions child
left join public.qurbani_animals animal on animal.id = child.animal_id
where child.animal_id is not null and animal.id is null
union all
select 'qurbani_schedules', count(*)
from public.qurbani_schedules child
left join public.qurbani_animals animal on animal.id = child.animal_id
where child.animal_id is not null and animal.id is null;
