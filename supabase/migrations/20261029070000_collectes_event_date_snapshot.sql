-- Retour de Cindy du 29/08 : une collecte orpheline (event_id passé à null
-- par la suppression de son événement, ou par le décochage d'"Événement
-- payant" en modification — voir create-event-form.tsx) perdait toute
-- trace de la date à laquelle l'événement avait eu lieu, puisque cette
-- date n'était jamais lue qu'en direct via la jointure collectes.event_id
-- -> events.start_time. "j'aimerai voir la date de l'evenement payant
-- (quand a til lieu ?)" — impossible à répondre une fois l'événement
-- supprimé, sans un instantané indépendant de cette jointure.
alter table public.collectes
  add column if not exists event_date timestamptz;

-- Rattrapage : capture la date des événements encore reliés aujourd'hui,
-- avant qu'une suppression future ne la rende irrécupérable.
update public.collectes c
set event_date = e.start_time
from public.events e
where c.event_id = e.id
  and c.event_date is null;
