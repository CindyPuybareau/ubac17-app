-- Coach parity with the Bureau for roster/staff management (harmonisation
-- Coach/Parent/Bureau): coaches can edit their own team's players and
-- coaching staff, not just view them.
drop policy if exists "coach manage own team_players" on public.team_players;
create policy "coach manage own team_players"
  on public.team_players for all
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = team_players.team_id and tc.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = team_players.team_id and tc.coach_id = auth.uid()
    )
  );

drop policy if exists "coach manage own team_coaches" on public.team_coaches;
create policy "coach manage own team_coaches"
  on public.team_coaches for all
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = team_coaches.team_id and tc.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = team_coaches.team_id and tc.coach_id = auth.uid()
    )
  );

grant insert, delete on public.team_players to authenticated;
grant insert, delete on public.team_coaches to authenticated;

-- Contact display (Bureau + Coach): read a player's parent phone number.
-- Admin currently has no bypass at all on parent_player (only "own links").
drop policy if exists "admin select all parent_player" on public.parent_player;
create policy "admin select all parent_player"
  on public.parent_player for select
  using (public.is_club_admin());

-- Coach: read parent_player rows for players on teams they coach.
drop policy if exists "coach select parent_player for own teams" on public.parent_player;
create policy "coach select parent_player for own teams"
  on public.parent_player for select
  using (
    exists (
      select 1 from public.team_players tp
      join public.team_coaches tc on tc.team_id = tp.team_id
      where tp.player_id = parent_player.player_id and tc.coach_id = auth.uid()
    )
  );

-- Coach: read the phone number of a parent linked to a player on a team
-- they coach (admin already has "admin select all profiles" from an
-- earlier migration, which already covers phone since RLS is row-level).
drop policy if exists "coach select parent profiles for own teams" on public.profiles;
create policy "coach select parent profiles for own teams"
  on public.profiles for select
  using (
    exists (
      select 1 from public.parent_player pp
      join public.team_players tp on tp.player_id = pp.player_id
      join public.team_coaches tc on tc.team_id = tp.team_id
      where pp.parent_id = profiles.id and tc.coach_id = auth.uid()
    )
  );

-- Coach: read fellow coaches' names on a team they also coach (needed to
-- display the "Coachs" list in a team card from the coach's own view).
drop policy if exists "coach select co-coach profiles" on public.profiles;
create policy "coach select co-coach profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.team_coaches tc1
      join public.team_coaches tc2 on tc2.team_id = tc1.team_id
      where tc1.coach_id = auth.uid() and tc2.coach_id = profiles.id
    )
  );
