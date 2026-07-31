-- Enforces the club's canonical team display order everywhere in the app.
-- Teams not covered by the canonical list (U07, generic U13/U15/U18,
-- z.Sénior) keep sort_order null and sort last — they weren't part of the
-- 13-team list the club gave, and are left untouched rather than guessed.
alter table public.teams
  add column if not exists sort_order integer;

update public.teams set sort_order = 1 where name = 'Seniors G1 /RM3';
update public.teams set sort_order = 2 where name = 'Seniors G2';
update public.teams set sort_order = 3 where name = 'U18 1';
update public.teams set sort_order = 4 where name = 'U18 2';
update public.teams set sort_order = 5 where name = 'U15G';
update public.teams set sort_order = 6 where name = 'U13F';
update public.teams set sort_order = 7 where name = 'U13M1';
update public.teams set sort_order = 8 where name = 'U13M2';
update public.teams set sort_order = 9 where name = 'U11';
update public.teams set sort_order = 10 where name = 'U09';
update public.teams set sort_order = 11 where name = 'Baby Basket';
update public.teams set sort_order = 12 where name = 'Loisirs filles';
update public.teams set sort_order = 13 where name = 'Loisirs mixtes';
