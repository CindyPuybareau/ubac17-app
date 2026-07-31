-- Renames teams to the club's exact canonical labels (both name and
-- category, which have always mirrored each other for these teams) so
-- every view in the app displays the same wording. Team_id foreign keys
-- (events, team_players, team_coaches, cotisations...) are untouched —
-- only the display strings change.
update public.teams set name = 'Séniors 1', category = 'Séniors 1' where name = 'Seniors G1 /RM3';
update public.teams set name = 'Séniors 2', category = 'Séniors 2' where name = 'Seniors G2';
update public.teams set name = 'U18M-1', category = 'U18M-1' where name = 'U18 1';
update public.teams set name = 'U18M-2', category = 'U18M-2' where name = 'U18 2';
update public.teams set name = 'U15M', category = 'U15M' where name = 'U15G';
update public.teams set name = 'U13M-1', category = 'U13M-1' where name = 'U13M1';
update public.teams set name = 'U13M-2', category = 'U13M-2' where name = 'U13M2';
update public.teams set name = 'U11 Mixte', category = 'U11 Mixte' where name = 'U11';
update public.teams set name = 'U9 Mixte', category = 'U9 Mixte' where name = 'U09';
update public.teams set name = 'Babys', category = 'Babys' where name = 'Baby Basket';
update public.teams set name = 'Loisirs F', category = 'Loisirs F' where name = 'Loisirs filles';
update public.teams set name = 'Loisirs Mixtes', category = 'Loisirs Mixtes' where name = 'Loisirs mixtes';
-- U13F already matches the canonical label — no change needed.
