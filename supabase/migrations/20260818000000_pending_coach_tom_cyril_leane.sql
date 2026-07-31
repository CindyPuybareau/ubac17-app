-- Tom = Tommy ROBIN, confirmed by elimination (the other two "Tom" players
-- are on U11/U13 teams, not Séniors).
update public.teams t
set pending_coach_player_id = p.id
from public.players p
where p.first_name = 'Tommy' and p.last_name = 'ROBIN'
  and t.name = 'Séniors 2';

-- Cyril and Léane aren't registered as club members at all yet — create
-- minimal placeholder player rows (first name only) purely so they exist
-- in the Membres table, then designate them as pending coaches like the
-- others.
with new_cyril as (
  insert into public.players (first_name)
  values ('Cyril')
  returning id
)
update public.teams
set pending_coach_player_id = (select id from new_cyril)
where name = 'Loisirs F';

with new_leane as (
  insert into public.players (first_name)
  values ('Léane')
  returning id
)
update public.teams
set pending_coach_player_id = (select id from new_leane)
where name = 'U9 Mixte';
