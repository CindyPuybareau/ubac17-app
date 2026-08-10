-- Espace Coach > Équipe(s) : le coach peut corriger la fiche de ses joueurs.
--
-- Jusqu'ici players n'était modifiable que par le membre lui-même, ses
-- parents, ou le Bureau (is_club_admin). Le clic sur une ligne ouvrait donc
-- une fiche en lecture seule côté coach.
--
-- Portée : uniquement les joueurs figurant sur une équipe qu'il entraîne.
-- player_on_coached_team() est la fonction security definer déjà utilisée
-- par les policies parent_player (20260731020000), donc pas de récursion
-- entre players et team_players.
--
-- ATTENTION, à valider côté club : la RLS s'applique à la LIGNE, pas à la
-- colonne. Un coach pourra donc aussi corriger le numéro de licence, le
-- statut FBI et les notes médicales de ses joueurs, pas seulement leurs
-- coordonnées. L'interface, elle, lui interdit de réaffecter une équipe ou
-- de désigner un coach / un membre du Bureau (canManageTeamAndRoles).
drop policy if exists "coach update roster of own teams" on public.players;
create policy "coach update roster of own teams"
  on public.players for update
  using (public.player_on_coached_team(players.id))
  with check (public.player_on_coached_team(players.id));
