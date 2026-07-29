-- Reusable check: is the currently authenticated user in the Bureau
-- whitelist? Security definer so it works regardless of the caller's own
-- grants on club_administrators.
create or replace function public.is_club_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_administrators
    where email = auth.jwt() ->> 'email'
  );
$$;

-- Teams: readable by any logged-in member (club-wide public info),
-- writable only by the Bureau.
alter table public.teams enable row level security;

drop policy if exists "select all teams" on public.teams;
create policy "select all teams"
  on public.teams for select
  using (true);

drop policy if exists "admin manage teams" on public.teams;
create policy "admin manage teams"
  on public.teams for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant insert, update, delete on public.teams to authenticated;

-- team_players: admins can see/manage every row, alongside the existing
-- coach/parent "own context" policy.
drop policy if exists "admin manage team_players" on public.team_players;
create policy "admin manage team_players"
  on public.team_players for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant insert, delete on public.team_players to authenticated;

-- team_coaches: same, admins can see/manage every assignment.
drop policy if exists "admin manage team_coaches" on public.team_coaches;
create policy "admin manage team_coaches"
  on public.team_coaches for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant insert, delete on public.team_coaches to authenticated;

-- players: admins can see every player (team-assignment picker, member list).
drop policy if exists "admin select all players" on public.players;
create policy "admin select all players"
  on public.players for select
  using (public.is_club_admin());

-- profiles: admins can see every member (coach picker, member list).
drop policy if exists "admin select all profiles" on public.profiles;
create policy "admin select all profiles"
  on public.profiles for select
  using (public.is_club_admin());
