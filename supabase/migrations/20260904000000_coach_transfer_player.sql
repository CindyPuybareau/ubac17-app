-- Espace Coach > Équipe(s) > "Changer d'équipe".
--
-- Jusqu'ici un coach ne pouvait écrire dans team_players que pour les
-- équipes qu'il entraîne (with check (is_team_coach(team_id))). Il pouvait
-- donc retirer un joueur de SON équipe, mais pas l'inscrire ailleurs — le
-- cas d'usage visé (dépanner les U13M-2 avec un joueur des U13M-1) était
-- rejeté par la RLS.
--
-- Portée volontairement étroite : un coach peut inscrire dans n'importe
-- quelle équipe du club UNIQUEMENT un joueur qui figure déjà sur l'une de
-- ses propres équipes. Il ne peut donc pas déplacer un licencié qu'il
-- n'encadre pas. player_on_coached_team() est la fonction security definer
-- déjà utilisée par les policies parent_player (voir 20260731020000).
--
-- L'ordre compte côté application : l'insertion dans la nouvelle équipe
-- doit précéder la suppression de l'ancienne, sinon le joueur n'est plus
-- sur une équipe coachée au moment où ce with check est évalué.
drop policy if exists "coach transfer own player to another team" on public.team_players;
create policy "coach transfer own player to another team"
  on public.team_players for insert
  with check (public.player_on_coached_team(team_players.player_id));
