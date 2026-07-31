-- Fixes "infinite recursion detected in policy for relation players",
-- introduced by 20260815000000: "select team_players for own context" (on
-- team_players) added a direct reference to players, but players already
-- has "select roster for own coached teams" referencing team_players
-- directly — the two policies looped forever.
--
-- Same fix already proven for the parent_player <-> team_players cycle
-- (see player_on_coached_team() in 20260731020000): wrap the check in a
-- security-definer function so it bypasses RLS on players instead of
-- re-entering it.
create or replace function public.is_own_player(check_player_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.players p
    where p.id = check_player_id and p.profile_id = auth.uid()
  );
$$;

drop policy if exists "select team_players for own context" on public.team_players;
create policy "select team_players for own context"
  on public.team_players for select
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = team_players.team_id and tc.coach_id = auth.uid()
    )
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = team_players.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(team_players.player_id)
  );
