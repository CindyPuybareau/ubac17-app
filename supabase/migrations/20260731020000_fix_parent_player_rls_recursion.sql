-- Second recursion fix. The team_coaches loop is gone, but a new one
-- appeared: "coach select parent_player for own teams" (on parent_player)
-- queries team_players, and team_players' own pre-existing policy
-- ("select team_players for own context") queries parent_player back —
-- two tables each re-entering the other's RLS forever.
--
-- Fix: same security-definer technique, one level deeper. Wrap the
-- "is this player on a team I coach" check (which touches team_players)
-- in its own definer function, so it bypasses RLS on team_players instead
-- of re-entering it.
create or replace function public.player_on_coached_team(check_player_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_players tp
    where tp.player_id = check_player_id
      and public.is_team_coach(tp.team_id)
  );
$$;

drop policy if exists "coach select parent_player for own teams" on public.parent_player;
create policy "coach select parent_player for own teams"
  on public.parent_player for select
  using (public.player_on_coached_team(parent_player.player_id));
