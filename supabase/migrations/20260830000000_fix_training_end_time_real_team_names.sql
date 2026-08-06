-- The two previous attempts (20260810000000 and 20260829000000) seeded/
-- backfilled the training schedule using guessed team names ("U13M1",
-- "Seniors G1 /RM3", "U18", "U15G", "Loisirs filles", "Baby Basket"...)
-- that turn out not to match public.teams.name at all — confirmed against
-- a live dump: the real names are "U13M-1", "Séniors 1", "U18M"/"U18M-1"/
-- "U18M-2", "U15M", "Loisirs F", "Babys", etc. Only "U13F" happened to
-- match by coincidence. So both migrations were near-total no-ops, and
-- the real training events already visible in the app (correct start
-- time + salle, just missing end_time) came from elsewhere (the planning
-- import), not from either seed migration.
--
-- This one only UPDATEs existing TRAINING events — no INSERT — matched
-- by team name + weekday + local time-of-day, which works regardless of
-- how/when each event was originally created.
with slots(team_name, weekday, start_time, end_time) as (
  values
    ('U11 Mixte', 1, time '17:00', time '18:00'),
    ('U13F', 1, time '17:45', time '19:00'),
    ('U15M', 2, time '18:30', time '20:00'),
    ('Loisirs F', 2, time '19:30', time '21:30'),
    ('Séniors 1', 2, time '20:00', time '22:00'),
    ('Séniors 2', 2, time '20:00', time '22:00'),
    ('U9 Mixte', 3, time '13:15', time '14:30'),
    ('U11 Mixte', 3, time '14:30', time '16:00'),
    ('U13F', 3, time '16:00', time '17:15'),
    ('U13M-1', 3, time '17:15', time '18:30'),
    ('U13M-2', 3, time '16:30', time '18:00'),
    ('U15M', 3, time '18:00', time '19:30'),
    ('U18M', 3, time '19:30', time '21:00'),
    ('Loisirs Mixtes', 3, time '21:00', time '22:30'),
    ('U13M-1', 4, time '17:30', time '19:00'),
    ('U13M-2', 4, time '17:30', time '19:00'),
    ('U18M-1', 4, time '19:00', time '20:30'),
    ('Séniors 1', 4, time '20:30', time '22:30'),
    ('Séniors 2', 4, time '20:30', time '22:30'),
    ('U18M-2', 5, time '20:00', time '22:00'),
    ('Babys', 6, time '10:00', time '11:30')
)
update public.events e
set end_time = (
  (e.start_time at time zone 'Europe/Paris')::date + s.end_time
) at time zone 'Europe/Paris'
from slots s
join public.teams t on t.name = s.team_name
where e.team_id = t.id
  and e.event_type = 'TRAINING'
  and extract(dow from e.start_time at time zone 'Europe/Paris') = s.weekday
  and (e.start_time at time zone 'Europe/Paris')::time = s.start_time
  and e.end_time is null;
