-- RLS policies only filter which ROWS are visible; the "authenticated" role
-- also needs base table-level privileges to attempt the operation at all.
-- These grants were missing entirely, so every query from a logged-in user
-- was rejected with "permission denied" regardless of how correct the RLS
-- policies were.
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant select, insert, update, delete on public.parent_player to authenticated;
grant select on public.teams to authenticated;
grant select on public.team_players to authenticated;
grant select on public.events to authenticated;
grant select, insert, update on public.rsvps to authenticated;
grant select on public.club_administrators to authenticated;
grant select on public.team_coaches to authenticated;
