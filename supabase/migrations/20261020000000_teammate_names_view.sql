-- "Je ne vois pas qui s'occupe de quoi" (retour de Cindy du 2026-08-20) :
-- sur les cartes Maillots/Table de marque/Besoins d'organisation, un simple
-- joueur (ex. Basile, Séniors 1) voit "Non attribué" même quand le rôle est
-- déjà pris par un coéquipier — le clic échoue ensuite avec "déjà attribué"
-- sans jamais dire à qui. Cause : la fiche players du coéquipier qui a pris
-- le rôle est invisible pour lui (RLS), donc la jointure players(...)
-- utilisée pour afficher le nom revient vide malgré la ligne existante.
--
-- Choix délibéré de Cindy (question posée, réponse "juste le nom") : ne
-- PAS ouvrir toute la fiche players (téléphone, adresse, notes médicales)
-- à chaque coéquipier comme c'est déjà le cas côté parent
-- (is_teammate_of_my_child, 20260921000000) — seulement prénom/nom, pour
-- savoir qui a pris quoi sans exposer de données sensibles à des tiers.
--
-- Une vue plutôt qu'une policy RLS supplémentaire sur players : RLS ne
-- filtre que des LIGNES, jamais des COLONNES — impossible de dire "ce
-- coéquipier voit la ligne mais seulement 2 colonnes sur 20". La vue,
-- elle, n'expose que 3 colonnes par construction, quel que soit qui
-- interroge. Elle s'exécute avec les privilèges de son propriétaire
-- (comportement standard des vues Postgres, avant l'option
-- security_invoker de PG15) : le propriétaire des migrations possède déjà
-- players et est donc exempté de sa RLS — d'où le filtre explicite
-- ci-dessous, qui réimplémente à la main la même portée que les policies
-- existantes plutôt que de tout laisser passer.
create or replace view public.teammate_names as
select p.id, p.first_name, p.last_name
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

grant select on public.teammate_names to authenticated;
