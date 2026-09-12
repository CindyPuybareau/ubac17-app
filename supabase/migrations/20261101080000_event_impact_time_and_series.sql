-- Deux ajouts demandés le 12/09 :
--
-- 1. "Heure d'impact" : l'heure à laquelle les participants doivent être
--    arrivés/prêts, avant l'heure de début officielle (ex. 45 min avant un
--    match à 16h -> 15h15). Stockée en absolu (comme start_time/end_time),
--    jamais un simple delta -- le formulaire calcule cet absolu à partir
--    d'un "X minutes avant" pratique côté UI, mais la colonne elle-même ne
--    connaît que l'heure réelle. Null = non pertinent pour cet événement
--    (comportement actuel inchangé).
alter table public.events
  add column if not exists impact_time timestamptz;

comment on column public.events.impact_time is
  'Heure a laquelle les participants doivent etre arrives/prets, avant start_time. Null = non renseigne.';

-- 2. "Répéter" : chaque occurrence reste un événement indépendant en base
--    (jamais une règle de récurrence virtuelle) -- même principe que
--    20260810000000_season_training_schedule.sql, qui générait déjà tout
--    un calendrier d'entraînements ligne par ligne. series_id est le seul
--    lien entre occurrences d'une même création : permet de proposer
--    "cette occurrence uniquement" vs "cette occurrence et les suivantes"
--    à la modification/suppression, sans jamais empêcher de traiter une
--    occurrence indépendamment des autres. Null = événement isolé, n'a
--    jamais fait partie d'une série (tous les événements existants, et
--    tout nouvel événement créé sans "Répéter").
alter table public.events
  add column if not exists series_id uuid;

comment on column public.events.series_id is
  'Identifiant commun a toutes les occurrences generees par une meme repetition ("Repeter" a la creation). Null = evenement isole.';

create index if not exists events_series_id_idx
  on public.events(series_id)
  where series_id is not null;
