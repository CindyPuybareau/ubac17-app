-- Le calendrier du coach distingue désormais le match officiel du match
-- amical, et précise si un match se joue à domicile ou à l'extérieur.
--
-- Deux ajouts strictement additifs : aucun événement existant n'est
-- modifié, un MATCH reste un MATCH et is_home vaut null tant que personne
-- ne l'a renseigné (null = "non précisé", pas "extérieur").

alter table public.events drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
  check (event_type in ('MATCH', 'FRIENDLY', 'TRAINING', 'OTHER', 'TOURNAMENT'));

-- true = à domicile, false = en déplacement, null = non précisé.
-- Sert au badge du calendrier et à décider si le covoiturage a un sens.
alter table public.events
  add column if not exists is_home boolean;

comment on column public.events.is_home is
  'true = domicile, false = exterieur, null = non precise. Concerne les matchs (MATCH, FRIENDLY).';
