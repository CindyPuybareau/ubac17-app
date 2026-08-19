-- Retour de Cindy du 2026-08-20 : "les coachs ne peuvent pas supprimer des
-- membres de leur équipe. cet accès est réservé au bureau."
--
-- Le correctif côté interface (bouton "Retirer" masqué pour un coach dans
-- team-card.tsx) ne suffit pas : la policy "coach manage own team_players"
-- (20260731010000) est un FOR ALL using(is_team_coach(team_id)), qui
-- autorise encore un coach à supprimer une ligne team_players de son
-- équipe via un appel direct à l'API Supabase, bouton ou pas. C'est la
-- vraie frontière de sécurité qui doit être corrigée ici.
--
-- Effet de bord découvert au passage : ce même FOR ALL, plus large,
-- autorisait aussi un coach à insérer n'importe quel joueur dans une
-- équipe qu'il entraîne (with check sur team_id seulement) — ce qui
-- rendait inopérante la policy dédiée et volontairement restreinte
-- "coach transfer own player to another team" (20261011010000, limitée
-- au même groupe d'équipes). Les policies permissives Postgres se
-- combinent en OR : la plus large gagnait toujours. En resserrant celle-ci
-- à SELECT/UPDATE, la policy de transfert (déjà en place, déjà écrite
-- pour être la bonne règle) redevient enfin la seule à s'appliquer pour
-- l'insertion.
--
-- Ce qui reste possible pour un coach sur team_players :
--   - SELECT : via "select team_players for own context" (inchangé).
--   - INSERT : via "coach transfer own player to another team", limité à
--     un joueur déjà sur une de ses équipes, vers une équipe de la même
--     famille (U13M-1 -> U13M-2, etc.).
--   - UPDATE : conservé ici (numéro de maillot, poste).
--   - DELETE : plus aucune policy coach ne l'autorise ; seul le Bureau
--     (policy "admin manage team_players", is_club_admin()) le peut
--     désormais.
drop policy if exists "coach manage own team_players" on public.team_players;
create policy "coach manage own team_players"
  on public.team_players for update
  using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));
