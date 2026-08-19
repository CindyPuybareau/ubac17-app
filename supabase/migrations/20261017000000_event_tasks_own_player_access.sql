-- Un joueur majeur qui se connecte lui-même (ex. Basile, joueur Séniors 1)
-- ne pouvait ni voir, ni cocher "Je m'en occupe", ni annuler sa propre
-- attribution sur Maillots/Table de marque (event_tasks) : les policies
-- RLS ne prévoyaient que deux cas — le coach de l'équipe, ou un PARENT
-- agissant pour son enfant (parent_player) — jamais "le joueur agit pour
-- lui-même". Un mineur avait toujours un parent pour couvrir ce cas ; un
-- joueur majeur, non. Résultat : un INSERT bloqué silencieusement par RLS,
-- affiché à tort comme "Déjà attribué à quelqu'un d'autre." (retour de
-- Cindy du 2026-08-20, confirmé par un diagnostic montrant zéro ligne
-- existante pour cet événement). Le système event_volunteer_needs plus
-- récent (20261012000000) avait déjà ce cas couvert via is_own_player() ;
-- cette migration aligne l'ancien système event_tasks dessus.

drop policy if exists "select event_tasks for own context" on public.event_tasks;
create policy "select event_tasks for own context"
  on public.event_tasks for select
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1
      from public.events e
      join public.team_players tp on tp.team_id = e.team_id
      join public.parent_player pp on pp.player_id = tp.player_id
      where e.id = event_tasks.event_id and pp.parent_id = auth.uid()
    )
    or exists (
      select 1
      from public.events e
      join public.team_players tp on tp.team_id = e.team_id
      where e.id = event_tasks.event_id and public.is_own_player(tp.player_id)
    )
  );

drop policy if exists "assign event_tasks for own context" on public.event_tasks;
create policy "assign event_tasks for own context"
  on public.event_tasks for insert
  with check (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or (
      exists (
        select 1 from public.parent_player pp
        where pp.player_id = event_tasks.player_id and pp.parent_id = auth.uid()
      )
      and exists (
        select 1
        from public.events e
        join public.team_players tp on tp.team_id = e.team_id
        where e.id = event_tasks.event_id and tp.player_id = event_tasks.player_id
      )
    )
    or (
      public.is_own_player(event_tasks.player_id)
      and exists (
        select 1
        from public.events e
        join public.team_players tp on tp.team_id = e.team_id
        where e.id = event_tasks.event_id and tp.player_id = event_tasks.player_id
      )
    )
  );

drop policy if exists "delete event_tasks for own context" on public.event_tasks;
create policy "delete event_tasks for own context"
  on public.event_tasks for delete
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_tasks.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_tasks.player_id)
  );
