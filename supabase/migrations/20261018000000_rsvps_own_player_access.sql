-- Même trou que event_tasks (voir 20261017000000), trouvé en le
-- corrigeant : un joueur majeur qui se connecte lui-même (ex. Basile,
-- joueur Séniors 1) ne pouvait pas répondre "Présent/Absent" à son PROPRE
-- match. Les policies insert/update/delete sur rsvps, écrites dès la
-- toute première migration du projet (20260729130000), ne couvraient que
-- deux cas : un PARENT répondant pour son enfant (parent_player), ou un
-- coach répondant pour l'effectif d'une équipe qu'il entraîne — jamais "le
-- joueur répond pour lui-même". Un mineur avait toujours un parent pour
-- couvrir ce cas ; un joueur majeur, non — bloqué en silence par RLS,
-- affiché comme "Réponse non enregistrée, réessaie." sans autre
-- explication (retour de Cindy du 2026-08-20, même famille de bug que
-- event_tasks juste avant).

drop policy if exists "insert own rsvps" on public.rsvps;
create policy "insert own rsvps"
  on public.rsvps for insert
  with check (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(rsvps.player_id)
  );

drop policy if exists "update own rsvps" on public.rsvps;
create policy "update own rsvps"
  on public.rsvps for update
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(rsvps.player_id)
  );

drop policy if exists "delete own rsvps" on public.rsvps;
create policy "delete own rsvps"
  on public.rsvps for delete
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(rsvps.player_id)
  );
