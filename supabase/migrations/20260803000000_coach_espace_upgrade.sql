-- Support for the redesigned Espace Coach: jersey number / position per
-- team roster slot (these vary by team for a multi-team player, so they
-- belong on team_players, not on players), and coach write access on rsvps
-- so a coach can record attendance for their whole roster ("l'appel"),
-- not just read aggregate counts.

alter table public.team_players
  add column if not exists jersey_number integer,
  add column if not exists position text;

-- Existing "coach manage own team_players" / "admin manage team_players"
-- RLS policies already allow UPDATE, but no migration ever granted UPDATE
-- at the table level (only select/insert/delete) — every UPDATE would
-- otherwise fail with "permission denied for table team_players"
-- regardless of RLS, for every role including the Bureau.
grant update on public.team_players to authenticated;

-- Coach: record attendance for players on a team they coach. Read access
-- ("select own or coached rsvps") already exists from an earlier
-- migration; this adds the missing write side, scoped the same way via
-- the event's team.
drop policy if exists "coach insert rsvps for own teams" on public.rsvps;
create policy "coach insert rsvps for own teams"
  on public.rsvps for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = rsvps.event_id and public.is_team_coach(e.team_id)
    )
  );

drop policy if exists "coach update rsvps for own teams" on public.rsvps;
create policy "coach update rsvps for own teams"
  on public.rsvps for update
  using (
    exists (
      select 1 from public.events e
      where e.id = rsvps.event_id and public.is_team_coach(e.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = rsvps.event_id and public.is_team_coach(e.team_id)
    )
  );
