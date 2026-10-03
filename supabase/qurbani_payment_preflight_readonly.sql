-- Read-only preflight. Run separately in each target Supabase project.
-- Review mismatch/unlinked counts before applying payment-sync migration.
with ledger as (
  select t.family_id, t.campaign_id, t.participant_id,
    sum(case when t.transaction_type = 'refund' then -t.amount else t.amount end) as net_paid
  from public.qurbani_transactions t
  where t.category = 'share_payment' and t.participant_id is not null
  group by t.family_id, t.campaign_id, t.participant_id
), mismatches as (
  select p.family_id, p.campaign_id, count(*) as mismatch_count
  from public.qurbani_participants p
  left join ledger l on l.family_id = p.family_id
    and l.campaign_id = p.campaign_id and l.participant_id = p.id
  where p.amount_paid <> coalesce(l.net_paid, 0)
  group by p.family_id, p.campaign_id
), invalid_entries as (
  select t.family_id, t.campaign_id, count(*) as invalid_count
  from public.qurbani_transactions t
  left join public.qurbani_participants p on p.id = t.participant_id
  where t.category = 'share_payment'
    and (p.id is null or p.family_id <> t.family_id
      or p.campaign_id <> t.campaign_id or t.transaction_type not in ('collection', 'refund'))
  group by t.family_id, t.campaign_id
)
select c.family_id, c.id as campaign_id, c.year, c.title, c.status,
  (select count(*) from public.qurbani_participants p where p.campaign_id = c.id) as participants,
  coalesce(m.mismatch_count, 0) as payment_mismatches,
  coalesce(i.invalid_count, 0) as invalid_share_entries
from public.qurbani_campaigns c
left join mismatches m on m.family_id = c.family_id and m.campaign_id = c.id
left join invalid_entries i on i.family_id = c.family_id and i.campaign_id = c.id
order by c.family_id, c.year, c.id;
