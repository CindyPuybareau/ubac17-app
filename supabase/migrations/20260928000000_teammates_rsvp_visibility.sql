-- "Qui sera là ?" sur la carte d'événement (vue Parent/Joueur) : afficher
-- les coéquipiers ayant répondu Présent suppose de pouvoir LIRE leur statut
-- RSVP, pas seulement celui de son propre enfant. La policy "select own or
-- coached rsvps" (20260729130000) ne couvrait que : ses propres enfants
-- (parent_player), ou les événements qu'on coache soi-même (team_coaches).
-- Un parent ne pouvait donc voir AUCUNE ligne rsvps en dehors de ses
-- propres enfants — même pour l'équipe de son enfant, où le reste de
-- l'effectif lui est pourtant déjà visible (players, team_players).
--
-- is_teammate_of_my_child() (20260921, déjà utilisée pour la fiche
-- players des coéquipiers) et player_on_own_team() (20260903, même
-- logique côté coach-joueur, ex. Basile coach U13F et joueur Séniors 1)
-- couvrent exactement les deux cas déjà traités ailleurs pour la même
-- relation "coéquipier" — réutilisées ici plutôt que réécrites. Une policy
-- SELECT de plus s'ajoute (OR) aux policies existantes, elle ne les
-- remplace pas : un coach garde par ailleurs sa policy "toute l'équipe
-- qu'il entraîne", inchangée.
drop policy if exists "select teammates rsvps" on public.rsvps;
create policy "select teammates rsvps"
  on public.rsvps for select
  using (
    public.is_teammate_of_my_child(rsvps.player_id)
    or public.player_on_own_team(rsvps.player_id)
  );
