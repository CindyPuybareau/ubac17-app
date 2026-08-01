-- Bureau role changes (club_administrators) and pending-coach badge changes
-- (team_pending_coaches) should reach other open sessions the same way
-- every other 360°-sync table already does — matching the pattern from
-- 20260805000000_club_wide_events_and_realtime.sql / 20260807000000_players_realtime.sql.
do $$
declare
  t text;
begin
  foreach t in array array['club_administrators', 'team_pending_coaches']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
