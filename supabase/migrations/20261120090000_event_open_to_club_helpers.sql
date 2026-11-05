-- Retour du Bureau du 04/11 ("U9 Mixte, un seul coach pour 25+ enfants") :
-- un entraînement peut être marqué "ouvert à tout le club pour accompagner"
-- (coach de l'équipe ou Bureau, au cas par cas) -- dans ce cas, n'importe
-- quel membre connecté doit pouvoir voir CET entraînement précis (titre,
-- jour, lieu, équipe) et s'y inscrire comme accompagnant par son nom, même
-- sans aucun enfant dans cette équipe. Jamais une ouverture plus large :
-- la carte complète (présences, liste des enfants) reste, elle, gouvernée
-- par les policies RLS existantes, pas celle-ci.
alter table public.events
  add column if not exists open_to_club_helpers boolean not null default false;

-- Nouvelle policy SELECT séparée (même recette que "select official
-- matches club wide", 20261112100000_official_matches_club_wide_visibility.sql) :
-- les policies SELECT permissives s'additionnent (OR) sur une même table,
-- celle-ci élargit la visibilité sans jamais toucher ni restreindre
-- "select events for own teams" (20261031120000_optimize_rls_auth_uid_caching.sql).
drop policy if exists "select trainings open to club helpers" on public.events;
create policy "select trainings open to club helpers" on public.events
for select
using (
  event_type = 'TRAINING'
  and open_to_club_helpers = true
  and (select auth.uid()) is not null
);

-- Auto-inscription par nom libre (guest_name), réservée aux besoins dont
-- l'événement est explicitement ouvert -- jamais un détournement possible
-- vers le besoin d'un autre événement. S'ajoute à "self or admin or coach
-- insert volunteer signups" (contrainte déjà corrigée en base le 24/09 par
-- allow_guest_only_volunteer_signups, fichier manquant du dépôt -- voir note
-- séparée) sans y toucher.
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
