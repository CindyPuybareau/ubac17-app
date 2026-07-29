-- The Bureau's club-wide calendar needs RSVP status for every team's
-- events, not just teams an admin personally coaches.
drop policy if exists "admin select all rsvps" on public.rsvps;
create policy "admin select all rsvps"
  on public.rsvps for select
  using (public.is_club_admin());
