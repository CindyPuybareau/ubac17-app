-- URGENT FIX: the "coach manage own team_coaches" policy from the previous
-- migration checked team_coaches by querying team_coaches itself inside its
-- own USING/CHECK clause. Postgres re-applies RLS to that inner query, which
-- re-triggers the same policy, forever: "infinite recursion detected in
-- policy for relation team_coaches". Every query touching team_coaches
-- (directly or via a join from profiles/parent_player/team_players) has been
-- failing since this policy was created.
--
-- Fix: route the "does this user coach this team" check through a
-- security-definer function (same pattern as is_club_admin()), so the
-- internal lookup bypasses RLS instead of re-entering it.
create or replace function public.is_team_coach(check_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_coaches
    where team_id = check_team_id and coach_id = auth.uid()
  );
$$;

drop policy if exists "coach manage own team_coaches" on public.team_coaches;
create policy "coach manage own team_coaches"
  on public.team_coaches for all
  using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

drop policy if exists "coach manage own team_players" on public.team_players;
create policy "coach manage own team_players"
  on public.team_players for all
  using (public.is_team_coach(team_id))
  with check (public.is_team_coach(team_id));

drop policy if exists "coach select parent_player for own teams" on public.parent_player;
create policy "coach select parent_player for own teams"
  on public.parent_player for select
  using (
    exists (
      select 1 from public.team_players tp
      where tp.player_id = parent_player.player_id
        and public.is_team_coach(tp.team_id)
    )
  );

drop policy if exists "coach select parent profiles for own teams" on public.profiles;
create policy "coach select parent profiles for own teams"
  on public.profiles for select
  using (
    exists (
      select 1 from public.parent_player pp
      join public.team_players tp on tp.player_id = pp.player_id
      where pp.parent_id = profiles.id
        and public.is_team_coach(tp.team_id)
    )
  );

drop policy if exists "coach select co-coach profiles" on public.profiles;
create policy "coach select co-coach profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.team_coaches tc2
      where tc2.coach_id = profiles.id
        and public.is_team_coach(tc2.team_id)
    )
  );
