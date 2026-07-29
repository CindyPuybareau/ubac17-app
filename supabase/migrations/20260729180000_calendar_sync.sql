-- FFBB/Comité iCal feed URL per team, editable by whoever manages the team.
alter table public.teams
  add column if not exists calendar_url text;

drop policy if exists "coach update own teams" on public.teams;
create policy "coach update own teams"
  on public.teams for update
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = teams.id and tc.coach_id = auth.uid()
    )
  );

-- Lets a synced event be matched back to its iCal UID so re-syncing
-- updates existing rows instead of duplicating them. Manually created
-- events (external_uid null) are untouched by sync.
alter table public.events
  add column if not exists external_uid text;

create unique index if not exists events_team_external_uid_unique
  on public.events (team_id, external_uid)
  where external_uid is not null;

-- The Bureau can also create/edit/delete events for any team (previously
-- coach-only), needed for both the planning import and the iCal sync button.
drop policy if exists "admin manage events" on public.events;
create policy "admin manage events"
  on public.events for all
  using (public.is_club_admin())
  with check (public.is_club_admin());
