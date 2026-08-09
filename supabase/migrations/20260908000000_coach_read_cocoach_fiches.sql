-- Espace Coach > Équipe(s) : coordonnées et statut des entraîneurs.
--
-- Une ligne "Coach" du tableau vient de profiles, pas de players : elle ne
-- porte ni téléphone, ni email, ni date de naissance. Ces informations sont
-- sur sa fiche membre (players.profile_id = son compte), la même que celle
-- affichée par le Bureau dans Membres.
--
-- Or un coach ne peut lire une fiche players que si le joueur est sur une
-- de ses équipes. La fiche d'un co-entraîneur qui ne joue nulle part lui
-- restait donc invisible, d'où les tirets.
--
-- On ouvre la lecture des fiches des entraîneurs des équipes qu'il coache —
-- exactement le pendant de "coach select co-coach profiles"
-- (20260731010000), qui autorise déjà la lecture de leur profil de compte.
-- is_team_coach() est security definer, donc pas de récursion RLS.
drop policy if exists "coach select co-coach player fiches" on public.players;
create policy "coach select co-coach player fiches"
  on public.players for select
  using (
    players.profile_id is not null
    and exists (
      select 1 from public.team_coaches tc
      where tc.coach_id = players.profile_id
        and public.is_team_coach(tc.team_id)
    )
  );
