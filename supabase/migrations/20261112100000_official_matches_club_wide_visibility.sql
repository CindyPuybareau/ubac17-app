-- Retour de Cindy du 12/09 ("Matchs officiels du club") : permettre à tout
-- adhérent/parent de voir les matchs officiels des AUTRES équipes du club
-- (pour venir encourager), en pure consultation -- jamais les entraînements
-- ni les événements club, qui ne concernent que leurs propres
-- destinataires. La policy "select events for own teams" (voir
-- 20261031120000_optimize_rls_auth_uid_caching.sql) reste inchangée : les
-- policies RLS en SELECT s'additionnent (OR) sur une même table, celle-ci
-- ne fait qu'ÉLARGIR la visibilité aux matchs officiels, jamais la
-- restreindre. Aucune policy UPDATE/DELETE n'est touchée : modifier/
-- supprimer un match reste réservé à son équipe/son coach/le Bureau
-- (policies existantes), même une fois ce match visible en lecture par
-- tout le monde.
drop policy if exists "select official matches club wide" on public.events;
create policy "select official matches club wide" on public.events
for select
using (
  event_type = 'MATCH'
  and (select auth.uid()) is not null
);
