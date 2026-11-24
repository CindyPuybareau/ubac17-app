-- Retour de Cindy du 24/11 (Camille AFONSO, Loisirs F : "elle voyait tout
-- bien, mais pas qui était présent ou absent") : un joueur adulte "simple"
-- (ni coach, ni parent) ne voyait dans team_players QUE sa propre ligne --
-- la policy "select team_players for own context" ne donnait l'équipe
-- complète qu'aux coachs (is_coach_anywhere() and is_own_player_team) et aux
-- parents (is_my_child_team). Liste des présents/absents vide pour lui
-- (vérifié : 1 ligne visible sur 28 pour un joueur Séniors). Le tableau
-- "Qui voit quoi" prévoit pourtant que le joueur voie la composition de son
-- équipe.
--
-- Ajout seul (les policies SELECT s'additionnent) : un joueur voit les liens
-- équipe/joueur de SES équipes. Les noms continuent de passer par la vue
-- restreinte family_teammate_roster (prénom, nom, naissance, catégorie --
-- jamais adresse, santé ni téléphones), qui autorisait déjà les coéquipiers
-- (player_on_own_team). Rien n'est supprimé ni modifié.

drop policy if exists "player select own team links" on public.team_players;
create policy "player select own team links" on public.team_players
for select
using (public.is_own_player_team(team_id));
