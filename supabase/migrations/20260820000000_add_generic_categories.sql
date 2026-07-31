-- Renames the 3 legacy catch-all teams into proper generic categories
-- (Séniors M, U18M, U13M) and gives them a sort_order so they appear in
-- the Membres table's "Équipe" picker, right after their specific
-- sub-teams — reuses the existing rows (and their already-assigned
-- members) instead of creating new empty teams.
update public.teams set name = 'Séniors M', category = 'Séniors M' where name = 'z.Sénior';
update public.teams set name = 'U18M', category = 'U18M' where name = 'U18';
update public.teams set name = 'U13M', category = 'U13M' where name = 'U13';

-- Renumbered with gaps (10, 20, 30...) so new categories can be inserted
-- later without having to shift every other team's sort_order again.
update public.teams set sort_order = 10 where name = 'Séniors 1';
update public.teams set sort_order = 20 where name = 'Séniors 2';
update public.teams set sort_order = 30 where name = 'Séniors M';
update public.teams set sort_order = 40 where name = 'U18M-1';
update public.teams set sort_order = 50 where name = 'U18M-2';
update public.teams set sort_order = 60 where name = 'U18M';
update public.teams set sort_order = 70 where name = 'U15M';
update public.teams set sort_order = 80 where name = 'U13F';
update public.teams set sort_order = 90 where name = 'U13M-1';
update public.teams set sort_order = 100 where name = 'U13M-2';
update public.teams set sort_order = 110 where name = 'U13M';
update public.teams set sort_order = 120 where name = 'U11 Mixte';
update public.teams set sort_order = 130 where name = 'U9 Mixte';
update public.teams set sort_order = 140 where name = 'Babys';
update public.teams set sort_order = 150 where name = 'Loisirs F';
update public.teams set sort_order = 160 where name = 'Loisirs Mixtes';
