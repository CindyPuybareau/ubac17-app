-- A coach can create/edit/delete events for the team(s) they coach.
drop policy if exists "coach manage own team events" on public.events;
create policy "coach manage own team events"
  on public.events for insert
  with check (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = events.team_id and tc.coach_id = auth.uid()
    )
  );

drop policy if exists "coach update own team events" on public.events;
create policy "coach update own team events"
  on public.events for update
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = events.team_id and tc.coach_id = auth.uid()
    )
  );

drop policy if exists "coach delete own team events" on public.events;
create policy "coach delete own team events"
  on public.events for delete
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = events.team_id and tc.coach_id = auth.uid()
    )
  );

grant insert, update, delete on public.events to authenticated;
