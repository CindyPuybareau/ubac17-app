-- Retour de Cindy du 10/09 (suite) : "l'onglet commission apparaît à
-- chaque besoin créé, pas la peine, les groupes commissions concernés
-- seront informés de tous les besoins créés" -- les commissions
-- concernées se choisissent maintenant UNE SEULE FOIS pour l'événement
-- entier, plutôt qu'à chaque besoin d'organisation ajouté. Déplace donc
-- commission_group_ids de event_volunteer_needs vers events.

alter table public.events
  add column if not exists commission_group_ids uuid[] not null default '{}';

-- Migration des données existantes (2 besoins déjà rattachés lors des
-- tests de la fonctionnalité) : l'événement reprend l'union des
-- commissions de tous ses besoins, plutôt que de perdre l'information.
update public.events e
set commission_group_ids = sub.all_ids
from (
  select event_id, array_agg(distinct g) as all_ids
  from event_volunteer_needs, unnest(commission_group_ids) as g
  group by event_id
) sub
where e.id = sub.event_id;

alter table public.event_volunteer_needs
  drop column if exists commission_group_ids;
