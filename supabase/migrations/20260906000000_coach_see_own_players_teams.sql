-- Espace Coach > Équipe(s) : distinguer un joueur "de l'équipe" d'un joueur
-- prêté par une autre équipe.
--
-- Un coach ne voit aujourd'hui les lignes team_players que pour les équipes
-- qu'il entraîne. Impossible donc de savoir si un joueur de son effectif
-- appartient AUSSI à une autre équipe — et donc de proposer "Retirer" (qui
-- le laisse dans son groupe d'origine) plutôt que "Affecter", au risque de
-- désinscrire quelqu'un de sa seule équipe.
--
-- On ouvre la lecture des rattachements d'un joueur qui figure déjà sur une
-- de ses équipes : le coach voit alors la liste complète des équipes de SES
-- joueurs, et rien de plus. player_on_coached_team() est la fonction
-- security definer déjà utilisée ailleurs (voir 20260731020000), donc pas
-- de récursion RLS entre team_players et players.
drop policy if exists "coach select all teams of own players" on public.team_players;
create policy "coach select all teams of own players"
  on public.team_players for select
  using (public.player_on_coached_team(team_players.player_id));
