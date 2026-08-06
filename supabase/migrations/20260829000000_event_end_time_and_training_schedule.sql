-- 1. Schema: events gain an optional end_time (required client-side only
--    for TRAINING, optional for MATCH/TOURNAMENT/OTHER) and a free-text
--    notes field, both editable from the Crayon edit modal.
alter table public.events add column if not exists end_time timestamptz;
alter table public.events add column if not exists notes text;

-- 2. Backfill end_time on the recurring 2026-2027 training schedule
--    seeded by 20260810000000_season_training_schedule.sql (that
--    migration predates end_time, so every row it created still has it
--    null), and add the two U13M1/U13M2 Wednesday+Thursday slots that
--    migration explicitly deferred ("U13 boys -> team U13M1 only for
--    now") — the club has since confirmed U13M2 has its own separate
--    practice times. Matched back to the exact same rows via
--    external_uid, which is deterministic from (team_id, day, start
--    time) — see that migration's insert for how it's built.
with season as (
  select generate_series('2026-09-01'::date, '2027-06-30'::date, interval '1 day')::date as day
),
slots(team_name, weekday, start_time, end_time, salle) as (
  values
    ('U09', 3, time '13:15', time '14:30', 'Angoulins'),
    ('U11', 1, time '17:00', time '18:00', 'Angoulins'),
    ('U11', 3, time '14:30', time '16:00', 'Angoulins'),
    ('U13F', 1, time '17:45', time '19:00', 'Angoulins'),
    ('U13F', 3, time '16:00', time '17:15', 'Angoulins'),
    ('U13M1', 3, time '17:15', time '18:30', 'Angoulins'),
    ('U13M1', 4, time '17:30', time '19:00', 'Angoulins'),
    ('U13M2', 3, time '16:30', time '18:00', 'Angoulins'),
    ('U13M2', 4, time '17:30', time '19:00', 'Angoulins'),
    ('U15G', 2, time '18:30', time '20:00', 'Angoulins'),
    ('U15G', 3, time '18:00', time '19:30', 'Châtelaillon'),
    ('U18', 3, time '19:30', time '21:00', 'Châtelaillon'),
    ('U18 1', 4, time '19:00', time '20:30', 'Angoulins'),
    ('U18 2', 5, time '20:00', time '22:00', 'Châtelaillon'),
    ('Seniors G1 /RM3', 2, time '20:00', time '22:00', 'Angoulins'),
    ('Seniors G1 /RM3', 4, time '20:30', time '22:30', 'Angoulins'),
    ('Seniors G2', 2, time '20:00', time '22:00', 'Angoulins'),
    ('Seniors G2', 4, time '20:30', time '22:30', 'Angoulins'),
    ('Loisirs filles', 2, time '19:30', time '21:30', 'Saint-Vivien'),
    ('Loisirs mixtes', 3, time '21:00', time '22:30', 'Châtelaillon'),
    ('Baby Basket', 6, time '10:00', time '11:30', 'Saint-Vivien')
),
computed as (
  select
    t.id as team_id,
    'season-2026-2027-' || t.id || '-' || season.day || '-' || s.start_time as external_uid,
    (season.day + s.end_time) at time zone 'Europe/Paris' as end_time
  from season
  join slots s on extract(dow from season.day) = s.weekday
  join public.teams t on t.name = s.team_name
)
update public.events e
set end_time = c.end_time
from computed c
where e.team_id = c.team_id and e.external_uid = c.external_uid;

-- 3. Insert whatever occurrences from the slots above don't already exist
--    (chiefly the new U13M2 rows) — same idempotent on-conflict pattern
--    as the original seed migration, now also carrying end_time.
with season as (
  select generate_series('2026-09-01'::date, '2027-06-30'::date, interval '1 day')::date as day
),
slots(team_name, weekday, start_time, end_time, salle) as (
  values
    ('U09', 3, time '13:15', time '14:30', 'Angoulins'),
    ('U11', 1, time '17:00', time '18:00', 'Angoulins'),
    ('U11', 3, time '14:30', time '16:00', 'Angoulins'),
    ('U13F', 1, time '17:45', time '19:00', 'Angoulins'),
    ('U13F', 3, time '16:00', time '17:15', 'Angoulins'),
    ('U13M1', 3, time '17:15', time '18:30', 'Angoulins'),
    ('U13M1', 4, time '17:30', time '19:00', 'Angoulins'),
    ('U13M2', 3, time '16:30', time '18:00', 'Angoulins'),
    ('U13M2', 4, time '17:30', time '19:00', 'Angoulins'),
    ('U15G', 2, time '18:30', time '20:00', 'Angoulins'),
    ('U15G', 3, time '18:00', time '19:30', 'Châtelaillon'),
    ('U18', 3, time '19:30', time '21:00', 'Châtelaillon'),
    ('U18 1', 4, time '19:00', time '20:30', 'Angoulins'),
    ('U18 2', 5, time '20:00', time '22:00', 'Châtelaillon'),
    ('Seniors G1 /RM3', 2, time '20:00', time '22:00', 'Angoulins'),
    ('Seniors G1 /RM3', 4, time '20:30', time '22:30', 'Angoulins'),
    ('Seniors G2', 2, time '20:00', time '22:00', 'Angoulins'),
    ('Seniors G2', 4, time '20:30', time '22:30', 'Angoulins'),
    ('Loisirs filles', 2, time '19:30', time '21:30', 'Saint-Vivien'),
    ('Loisirs mixtes', 3, time '21:00', time '22:30', 'Châtelaillon'),
    ('Baby Basket', 6, time '10:00', time '11:30', 'Saint-Vivien')
)
insert into public.events (team_id, title, event_type, salle, start_time, end_time, external_uid)
select
  t.id,
  'Entraînement',
  'TRAINING',
  s.salle,
  (season.day + s.start_time) at time zone 'Europe/Paris',
  (season.day + s.end_time) at time zone 'Europe/Paris',
  'season-2026-2027-' || t.id || '-' || season.day || '-' || s.start_time
from season
join slots s on extract(dow from season.day) = s.weekday
join public.teams t on t.name = s.team_name
on conflict (team_id, external_uid) where (external_uid is not null) do nothing;
