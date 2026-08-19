-- Étend la gestion des besoins en bénévoles (buvette, arbitrage...) aux
-- coachs sur leurs propres événements, pas seulement au Bureau — retour de
-- Cindy du 2026-08-19 : "quelque chose de simple, pour le bureau et les
-- coachs". Jusqu'ici seul is_club_admin() pouvait écrire, exactement comme
-- pour event_role_types AVANT que 20260911000000 n'y ajoute déjà
-- is_coach_anywhere() — même principe appliqué ici, mais scopé à l'équipe
-- réellement coachée (pas "n'importe quel coach sur n'importe quel
-- événement").

drop policy if exists "admin manage volunteer needs" on public.event_volunteer_needs;
create policy "admin or coach manage volunteer needs"
  on public.event_volunteer_needs for all
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_volunteer_needs.event_id and public.is_team_coach(e.team_id)
    )
  )
  with check (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_volunteer_needs.event_id and public.is_team_coach(e.team_id)
    )
  );

drop policy if exists "self or admin insert volunteer signups" on public.event_volunteer_signups;
create policy "self or admin or coach insert volunteer signups"
  on public.event_volunteer_signups for insert
  with check (
    public.is_club_admin()
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_volunteer_signups.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_volunteer_signups.player_id)
    or exists (
      select 1
      from public.event_volunteer_needs n
      join public.events e on e.id = n.event_id
      where n.id = event_volunteer_signups.need_id and public.is_team_coach(e.team_id)
    )
  );

drop policy if exists "self or admin delete volunteer signups" on public.event_volunteer_signups;
create policy "self or admin or coach delete volunteer signups"
  on public.event_volunteer_signups for delete
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_volunteer_signups.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_volunteer_signups.player_id)
    or exists (
      select 1
      from public.event_volunteer_needs n
      join public.events e on e.id = n.event_id
      where n.id = event_volunteer_signups.need_id and public.is_team_coach(e.team_id)
    )
  );

-- Même garde-fou de capacité, mais un coach qui affecte sur SA propre
-- équipe peut aussi dépasser sciemment le besoin, comme le Bureau.
create or replace function public.check_volunteer_signup_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needed integer;
  taken integer;
  v_team_id uuid;
begin
  if public.is_club_admin() then
    return new;
  end if;

  select n.required_count, e.team_id into needed, v_team_id
  from public.event_volunteer_needs n
  join public.events e on e.id = n.event_id
  where n.id = new.need_id;

  if v_team_id is not null and public.is_team_coach(v_team_id) then
    return new;
  end if;

  select count(*) into taken
  from public.event_volunteer_signups
  where need_id = new.need_id and id <> new.id;

  if taken >= coalesce(needed, 1) then
    raise exception 'Ce créneau est déjà complet.';
  end if;

  return new;
end;
$$;
