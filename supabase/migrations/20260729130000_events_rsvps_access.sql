-- A profile can see an event if they coach its team, or if any player
-- linked to them (self or child) belongs to that team.
alter table public.events enable row level security;

drop policy if exists "select events for own teams" on public.events;
create policy "select events for own teams"
  on public.events for select
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = events.team_id and tc.coach_id = auth.uid()
    )
    or exists (
      select 1
      from public.team_players tp
      join public.parent_player pp on pp.player_id = tp.player_id
      where tp.team_id = events.team_id and pp.parent_id = auth.uid()
    )
  );

-- A profile can see/update an rsvp if the player is linked to them (self or
-- child), or if they coach the event's team (read-only aggregate view).
alter table public.rsvps enable row level security;

drop policy if exists "select own or coached rsvps" on public.rsvps;
create policy "select own or coached rsvps"
  on public.rsvps for select
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or exists (
      select 1
      from public.events e
      join public.team_coaches tc on tc.team_id = e.team_id
      where e.id = rsvps.event_id and tc.coach_id = auth.uid()
    )
  );

drop policy if exists "insert own rsvps" on public.rsvps;
create policy "insert own rsvps"
  on public.rsvps for insert
  with check (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "update own rsvps" on public.rsvps;
create policy "update own rsvps"
  on public.rsvps for update
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
  );

-- Team roster needs to be readable by the team's coach(es) too (players
-- policy so far only covers a parent's own linked players).
drop policy if exists "select roster for own coached teams" on public.players;
create policy "select roster for own coached teams"
  on public.players for select
  using (
    exists (
      select 1
      from public.team_players tp
      join public.team_coaches tc on tc.team_id = tp.team_id
      where tp.player_id = players.id and tc.coach_id = auth.uid()
    )
  );

alter table public.team_players enable row level security;

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
  );
