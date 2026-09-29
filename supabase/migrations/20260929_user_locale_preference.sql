-- Persist each signed-in family member's language preference across devices.

alter table public.family_memberships
  add column if not exists preferred_locale text not null default 'bn';

alter table public.family_memberships
  drop constraint if exists family_memberships_preferred_locale_check;

alter table public.family_memberships
  add constraint family_memberships_preferred_locale_check
  check (preferred_locale in ('bn', 'en'));
