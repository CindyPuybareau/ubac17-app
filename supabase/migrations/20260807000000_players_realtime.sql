-- Birthdays are now rendered as calendar events, computed live from
-- players.birth_date. Add players to the realtime publication so an edit
-- to a member's birth date (via the Bureau's fiche modal) propagates to
-- Coach/Parent calendars without an F5, matching the rest of the 360°
-- sync rule.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end $$;
