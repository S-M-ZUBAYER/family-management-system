-- Synthetic, disposable QA data for the portable local sign-in (local_seedy).
-- Run only after confirming the target project has no family rows. Never run as a migration.
begin;

do $$
begin
  if exists (select 1 from public.families) then
    raise exception 'Demo seed cancelled: families already exist';
  end if;
end $$;

insert into public.families (id, name_bn, name_en, slug, join_code, created_by_user_id)
values
  ('10000000-0000-4000-8000-000000000001', 'শেখ মনছুফ পরিবার', 'Sheikh Monsuf Family', 'sheikh-monsuf-demo', 'MONSUF-DEMO-2026', 'local_seedy'),
  ('20000000-0000-4000-8000-000000000002', 'নজির প্রামাণিক পরিবার', 'Nojir Poramanik Family', 'nojir-poramanik-demo', 'NOJIR-DEMO-2026', 'local_seedy');

insert into public.member_profiles (id, family_id, name_bn, name_en, gender, auth_user_id)
select md5('fms-demo-' || family_number || '-' || person_code)::uuid,
       case family_number when 1 then '10000000-0000-4000-8000-000000000001'::uuid else '20000000-0000-4000-8000-000000000002'::uuid end,
       name_bn, name_en, gender,
       case when person_code = 'root_m' then 'local_seedy' else null end
from (values
  (1,'root_m','শেখ মনছুফ','Sheikh Monsuf','male'),
  (1,'root_f','সালমা বেগম','Salma Begum','female'),
  (1,'s1','শেখ মাহমুদ','Sheikh Mahmud','male'),
  (1,'w1','রুকাইয়া বেগম','Rukaiya Begum','female'),
  (1,'s2','শেখ কামাল','Sheikh Kamal','male'),
  (1,'w2','ফাতেমা বেগম','Fatema Begum','female'),
  (1,'s3','শেখ রফিক','Sheikh Rafiq','male'),
  (1,'w3','নাবিলা বেগম','Nabila Begum','female'),
  (1,'s4','শেখ সেলিম','Sheikh Selim','male'),
  (1,'w4','তানিয়া বেগম','Tania Begum','female'),
  (1,'d1','নাসরিন আক্তার','Nasrin Akter','female'),
  (1,'h1','ফারুক আহমেদ','Faruk Ahmed','male'),
  (1,'s1c1','ইমরান শেখ','Imran Sheikh','male'),
  (1,'s1c2','আয়েশা শেখ','Ayesha Sheikh','female'),
  (1,'s2c1','সামি শেখ','Sami Sheikh','male'),
  (1,'s2c2','মাহি শেখ','Mahi Sheikh','female'),
  (1,'s3c1','তানভীর শেখ','Tanvir Sheikh','male'),
  (1,'s3c2','সামিহা শেখ','Samiha Sheikh','female'),
  (1,'s4c1','রায়হান শেখ','Rayhan Sheikh','male'),
  (1,'s4c2','নাফিসা শেখ','Nafisa Sheikh','female'),
  (1,'d1c1','আরিফ আহমেদ','Arif Ahmed','male'),
  (1,'d1c2','রিমা আহমেদ','Rima Ahmed','female'),
  (2,'root_m','নজির প্রামাণিক','Nojir Poramanik','male'),
  (2,'root_f','রহিমা বেগম','Rahima Begum','female'),
  (2,'s1','জাহাঙ্গীর প্রামাণিক','Jahangir Poramanik','male'),
  (2,'w1','ফরিদা বেগম','Farida Begum','female'),
  (2,'s2','আমির প্রামাণিক','Amir Poramanik','male'),
  (2,'w2','ইয়াসমিন বেগম','Yasmin Begum','female'),
  (2,'d1','শিরিন আক্তার','Shirin Akter','female'),
  (2,'h1','বাবুল হোসেন','Babul Hossain','male'),
  (2,'d2','সালমা আক্তার','Salma Akter','female'),
  (2,'h2','হারুন মিয়া','Harun Mia','male'),
  (2,'d3','রিনা আক্তার','Rina Akter','female'),
  (2,'h3','মাসুদ আলী','Masud Ali','male'),
  (2,'s1c1','রিফাত প্রামাণিক','Rifat Poramanik','male'),
  (2,'s1c2','মিম প্রামাণিক','Mim Poramanik','female'),
  (2,'s2c1','সাব্বির প্রামাণিক','Sabbir Poramanik','male'),
  (2,'s2c2','সুমাইয়া প্রামাণিক','Sumaiya Poramanik','female'),
  (2,'d1c1','সাকিব হোসেন','Sakib Hossain','male'),
  (2,'d1c2','নিশাত হোসেন','Nishat Hossain','female'),
  (2,'d2c1','নাঈম মিয়া','Naeem Mia','male'),
  (2,'d2c2','সাবিহা মিয়া','Sabiha Mia','female'),
  (2,'d3c1','ফাহিম আলী','Fahim Ali','male'),
  (2,'d3c2','রুবাইয়া আলী','Rubaiya Ali','female')
) as people(family_number, person_code, name_bn, name_en, gender);

insert into public.family_relationships (family_id, from_member_id, to_member_id, relationship_type, created_by_user_id)
select case family_number when 1 then '10000000-0000-4000-8000-000000000001'::uuid else '20000000-0000-4000-8000-000000000002'::uuid end,
       md5('fms-demo-' || family_number || '-' || parent_code)::uuid,
       md5('fms-demo-' || family_number || '-' || child_code)::uuid,
       'parent', 'local_seedy'
from (values
  (1,'s1','root_m','root_f'), (1,'s2','root_m','root_f'), (1,'s3','root_m','root_f'), (1,'s4','root_m','root_f'), (1,'d1','root_m','root_f'),
  (1,'s1c1','s1','w1'), (1,'s1c2','s1','w1'), (1,'s2c1','s2','w2'), (1,'s2c2','s2','w2'),
  (1,'s3c1','s3','w3'), (1,'s3c2','s3','w3'), (1,'s4c1','s4','w4'), (1,'s4c2','s4','w4'),
  (1,'d1c1','d1','h1'), (1,'d1c2','d1','h1'),
  (2,'s1','root_m','root_f'), (2,'s2','root_m','root_f'), (2,'d1','root_m','root_f'), (2,'d2','root_m','root_f'), (2,'d3','root_m','root_f'),
  (2,'s1c1','s1','w1'), (2,'s1c2','s1','w1'), (2,'s2c1','s2','w2'), (2,'s2c2','s2','w2'),
  (2,'d1c1','d1','h1'), (2,'d1c2','d1','h1'), (2,'d2c1','d2','h2'), (2,'d2c2','d2','h2'),
  (2,'d3c1','d3','h3'), (2,'d3c2','d3','h3')
) as children(family_number, child_code, parent_one, parent_two)
cross join lateral (values (parent_one), (parent_two)) as parents(parent_code);

insert into public.family_relationships (family_id, from_member_id, to_member_id, relationship_type, created_by_user_id)
select case family_number when 1 then '10000000-0000-4000-8000-000000000001'::uuid else '20000000-0000-4000-8000-000000000002'::uuid end,
       md5('fms-demo-' || family_number || '-' || first_code)::uuid,
       md5('fms-demo-' || family_number || '-' || second_code)::uuid,
       'spouse', 'local_seedy'
from (values
  (1,'root_m','root_f'), (1,'s1','w1'), (1,'s2','w2'), (1,'s3','w3'), (1,'s4','w4'), (1,'d1','h1'),
  (2,'root_m','root_f'), (2,'s1','w1'), (2,'s2','w2'), (2,'d1','h1'), (2,'d2','h2'), (2,'d3','h3')
) as couples(family_number, first_code, second_code);

insert into public.family_memberships (family_id, auth_user_id, member_profile_id, role, preferred_locale)
values
  ('10000000-0000-4000-8000-000000000001', 'local_seedy', md5('fms-demo-1-root_m')::uuid, 'owner', 'bn'),
  ('20000000-0000-4000-8000-000000000002', 'local_seedy', md5('fms-demo-2-root_m')::uuid, 'owner', 'bn');

commit;
