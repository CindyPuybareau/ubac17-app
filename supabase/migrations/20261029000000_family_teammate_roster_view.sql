-- Trouvé lors de l'audit du 28/08 : "parent select teammates of own child
-- teams" (20260921000000) ouvre en réalité TOUTE la fiche players d'un
-- coéquipier de son enfant — notes médicales, adresse, téléphones des
-- parents — puisque la RLS filtre des LIGNES, jamais des colonnes. Cindy
-- avait déjà tranché ce même cas côté coéquipier d'un joueur ("juste le
-- nom", 20261020000000_teammate_names_view.sql) ; jamais reporté ici.
--
-- Une vue plutôt qu'une policy plus étroite, même raisonnement que
-- teammate_names : impossible de dire en RLS "ce parent voit la ligne
-- mais seulement 4 colonnes sur 29". Vue séparée de teammate_names (pas
-- une extension) : birth_date/category ne sont utiles qu'ici (calcul du
-- statut année/rookie côté famille), pas dans les autres usages de
-- teammate_names (event-tasks.ts, "qui a pris ce rôle").
create or replace view public.family_teammate_roster as
select p.id, p.first_name, p.last_name, p.birth_date, p.category
from public.players p
where
  public.is_club_admin()
  or public.is_own_player(p.id)
  or public.is_teammate_of_my_child(p.id)
  or public.player_on_own_team(p.id)
  or exists (
    select 1
    from public.team_players tp
    join public.team_coaches tc on tc.team_id = tp.team_id
    where tp.player_id = p.id and tc.coach_id = auth.uid()
  );

grant select on public.family_teammate_roster to authenticated;

-- Referme le trou : plus aucun accès direct à la fiche complète d'un
-- coéquipier depuis le client, seulement via la vue ci-dessus. Les autres
-- lecteurs de players (Bureau via "admin manage players", coach de
-- l'équipe via "select roster for own coached teams", joueur/parent sur sa
-- propre fiche) ne sont pas concernés par cette policy et restent
-- inchangés.
drop policy if exists "parent select teammates of own child teams" on public.players;
