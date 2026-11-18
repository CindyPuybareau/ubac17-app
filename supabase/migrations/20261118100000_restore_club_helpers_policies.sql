-- Retour de Cindy du 18/11 ("Pascaline Charpenteau ne voit pas le besoin
-- d'accompagnement") : les deux règles d'accès créées par
-- 20261120090000_event_open_to_club_helpers.sql n'existaient plus en base
-- (disparues lors du regroupement des règles de lecture de `events`, audit
-- performance du 11/11). Conséquence : un entraînement "ouvert à tout le
-- club pour accompagner" (Babys) n'était plus visible que du Bureau, des
-- coachs et des familles de l'équipe, et personne d'autre ne pouvait se
-- proposer. Vérifié avec le compte de Pascaline : 0 entraînement visible.
--
-- On les recrée à l'identique (règles séparées, additives) -- aucune autre
-- règle, aucune donnée touchée.
drop policy if exists "select trainings open to club helpers" on public.events;
create policy "select trainings open to club helpers" on public.events
for select
using (
  event_type = 'TRAINING'
  and open_to_club_helpers = true
  and (select auth.uid()) is not null
);

drop policy if exists "self-service guest insert on open trainings" on public.event_volunteer_signups;
create policy "self-service guest insert on open trainings" on public.event_volunteer_signups
for insert
with check (
  guest_name is not null
  and player_id is null
  and benevole_id is null
  and commission_group_id is null
  and exists (
    select 1 from public.event_volunteer_needs n
    join public.events e on e.id = n.event_id
    where n.id = event_volunteer_signups.need_id
      and e.open_to_club_helpers = true
  )
  and (select auth.uid()) is not null
);
