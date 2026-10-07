-- An animal with participants, ledger entries or schedules must not be deleted
-- while those records still point to it. NO ACTION checks the whole statement,
-- so deleting an entire family/campaign with its children remains possible.
-- Run the rollback-only test in staging before applying to production.
begin;

alter table public.qurbani_participants
  drop constraint if exists qurbani_participants_animal_id_fkey;
alter table public.qurbani_participants
  add constraint qurbani_participants_animal_id_fkey
  foreign key (animal_id) references public.qurbani_animals(id) on delete no action;

alter table public.qurbani_transactions
  drop constraint if exists qurbani_transactions_animal_id_fkey;
alter table public.qurbani_transactions
  add constraint qurbani_transactions_animal_id_fkey
  foreign key (animal_id) references public.qurbani_animals(id) on delete no action;

alter table public.qurbani_schedules
  drop constraint if exists qurbani_schedules_animal_id_fkey;
alter table public.qurbani_schedules
  add constraint qurbani_schedules_animal_id_fkey
  foreign key (animal_id) references public.qurbani_animals(id) on delete no action;

commit;
