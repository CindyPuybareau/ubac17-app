-- Injects the real 2026-2027 weekly training schedule from
-- ubac17.fr/reprise-des-entrainements as recurring TRAINING events,
-- matched to the club's actual teams (verified against a live dump of
-- public.teams before writing this). Idempotent: safe to re-run thanks to
-- the (team_id, external_uid) unique index already used for iCal sync.
--
-- Mapping decisions confirmed with the club:
--   - "U15" (no suffix) -> team "U15G"
--   - U13 boys -> team "U13M1" only for now (M1/M2 split deferred)
--   - "Loisirs Masculins" -> team "Loisirs mixtes" (no dedicated men's team yet)
--   - "z.Sénior" (archived-looking team) skipped
--   - U07 and Friday's "À définir" slot skipped (no schedule data given)
with season as (
  select generate_series('2026-09-01'::date, '2027-06-30'::date, interval '1 day') as day
),
slots(team_name, weekday, start_time, salle) as (
  values
    ('U09', 3, time '13:15', 'Angoulins'),
    ('U11', 1, time '17:00', 'Angoulins'),
    ('U11', 3, time '14:30', 'Angoulins'),
    ('U13F', 1, time '17:45', 'Angoulins'),
    ('U13F', 3, time '16:00', 'Angoulins'),
    ('U13M1', 3, time '17:15', 'Angoulins'),
    ('U13M1', 4, time '17:30', 'Angoulins'),
    ('U15G', 2, time '18:30', 'Angoulins'),
    ('U15G', 3, time '18:00', 'Châtelaillon'),
    ('U18', 3, time '19:30', 'Châtelaillon'),
    ('U18 1', 4, time '19:00', 'Angoulins'),
    ('U18 2', 5, time '20:00', 'Châtelaillon'),
    ('Seniors G1 /RM3', 2, time '20:00', 'Angoulins'),
    ('Seniors G1 /RM3', 4, time '20:30', 'Angoulins'),
    ('Seniors G2', 2, time '20:00', 'Angoulins'),
    ('Seniors G2', 4, time '20:30', 'Angoulins'),
    ('Loisirs filles', 2, time '19:30', 'Saint-Vivien'),
    ('Loisirs mixtes', 3, time '21:00', 'Châtelaillon'),
    ('Baby Basket', 6, time '10:00', 'Saint-Vivien')
)
insert into public.events (team_id, title, event_type, salle, start_time, external_uid)
select
  t.id,
  'Entraînement',
  'TRAINING',
  s.salle,
  (season.day + s.start_time) at time zone 'Europe/Paris',
  'season-2026-2027-' || t.id || '-' || season.day || '-' || s.start_time
from season
join slots s on extract(dow from season.day) = s.weekday
join public.teams t on t.name = s.team_name
on conflict (team_id, external_uid) where (external_uid is not null) do nothing;
