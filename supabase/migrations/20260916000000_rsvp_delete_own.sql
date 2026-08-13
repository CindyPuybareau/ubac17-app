-- Annuler une réponse de présence.
--
-- Une famille pouvait répondre et corriger sa réponse, mais jamais revenir
-- en arrière : "on ne sait pas encore" n'existait pas. C'est pourtant
-- l'état de départ, et le seul qui dise honnêtement au coach qu'il manque
-- une information.
--
-- Techniquement, revenir à "en attente" c'est supprimer la ligne : l'app
-- lit déjà l'absence de ligne comme une absence de réponse. Le droit de
-- supprimer manquait — seul le Bureau l'avait, via sa policy "for all".
-- Ces deux policies reprennent mot pour mot les conditions des policies
-- update existantes : qui peut modifier une réponse peut l'annuler.

drop policy if exists "delete own rsvps" on public.rsvps;
create policy "delete own rsvps"
  on public.rsvps for delete
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "coach delete rsvps for own teams" on public.rsvps;
create policy "coach delete rsvps for own teams"
  on public.rsvps for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = rsvps.event_id and public.is_team_coach(e.team_id)
    )
  );
