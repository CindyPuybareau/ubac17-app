-- Calendar redesign adds a 4th event sphere ("Tournois / Coupes"),
-- distinct from a regular MATCH.
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events
  add constraint events_event_type_check
  check (event_type in ('MATCH', 'TRAINING', 'OTHER', 'TOURNAMENT'));
