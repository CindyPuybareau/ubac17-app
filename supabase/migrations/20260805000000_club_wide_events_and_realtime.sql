-- 1. Club-wide events (e.g. a summer stage open to every category) were
-- impossible: team_id was mandatory, so the Bureau was forced to pin an
-- event like the Aug 7 stage to a single team, hiding it from every other
-- team's coach/parents. Make team_id nullable and treat null as "visible
-- to everyone".
alter table public.events alter column team_id drop not null;

drop policy if exists "select events for own teams" on public.events;
create policy "select events for own teams"
  on public.events for select
  using (
    team_id is null
    or exists (
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

-- 2. Realtime: let every connected client subscribe to postgres_changes on
-- the tables that matter for cross-role sync (Bureau/Coach/Parent all
-- touch these), so the app can auto-refresh instead of waiting for F5.
-- Wrapped in existence checks so re-running this migration (or a table
-- already toggled on via the Supabase Studio Realtime UI) never errors.
do $$
declare
  t text;
begin
  foreach t in array array[
    'events', 'rsvps', 'event_tasks', 'event_carpool_offers',
    'cotisations', 'team_players', 'team_coaches'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
