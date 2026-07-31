-- Restores the players <-> profiles link by email, so a member who signs up
-- with the same email as their registration_email is automatically
-- recognized as both a player and a coach/bureau account holder.
--
-- Also fixes a regression: 20260814000000_coach_invite_clears_pending.sql
-- dropped `email = new.email` from the profiles insert, so every account
-- created since then has profiles.email = null (silently breaking the
-- Membres table's "Coach de X" badge, which matches on email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, email, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    new.email,
    'PARENT'
  );

  insert into public.parent_player (parent_id, player_id)
  select new.id, p.id
  from public.players p
  where p.pending_parent_email is not null
    and lower(p.pending_parent_email) = lower(new.email)
  on conflict do nothing;

  insert into public.team_coaches (team_id, coach_id)
  select tci.team_id, new.id
  from public.team_coach_invites tci
  where lower(tci.email) = lower(new.email)
  on conflict do nothing;

  update public.teams
  set pending_coach_names = null
  where id in (
    select tci.team_id
    from public.team_coach_invites tci
    where lower(tci.email) = lower(new.email)
  );

  -- Auto-link: a brand new account whose email matches an existing
  -- player's registration email is that player's own account. Guarded to
  -- only that email's OWN row (registration_email is often the parent's
  -- email shared across several siblings' player rows, and profile_id is
  -- unique — linking more than one row to the same profile would violate
  -- players_profile_id_unique).
  update public.players
  set profile_id = new.id
  where profile_id is null
    and registration_email is not null
    and lower(registration_email) = lower(new.email)
    and (
      select count(*) from public.players p2
      where p2.registration_email is not null
        and lower(p2.registration_email) = lower(new.email)
    ) = 1;

  return new;
end;
$$;

-- One-time catch-up for accounts/players that already existed before this
-- migration (e.g. Basile, if his registration email matches his login email).
-- Same uniqueness guard as above.
update public.players p
set profile_id = pr.id
from public.profiles pr
where p.profile_id is null
  and p.registration_email is not null
  and pr.email is not null
  and lower(p.registration_email) = lower(pr.email)
  and (
    select count(*) from public.players p2
    where p2.registration_email is not null
      and lower(p2.registration_email) = lower(pr.email)
  ) = 1;

-- Lets the Bureau grant/revoke Bureau access to someone else (the "Bureau"
-- role checkbox in the member profile modal) — mirrors the same
-- is_club_admin() trust level already granted on teams/team_players/
-- team_coaches. club_administrators previously had zero write policy.
drop policy if exists "admin manage club_administrators" on public.club_administrators;
create policy "admin manage club_administrators"
  on public.club_administrators for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant insert, update, delete on public.club_administrators to authenticated;

-- A self-registered player (profile_id linked directly, no parent_player
-- proxy needed — same pattern as the "select own or linked players" policy
-- on players itself) can read their own team_players row. Needed so a
-- coach who's also a player sees their own team's events merged into their
-- calendar (getPlayerTeamIds queries this table).
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
    or exists (
      select 1 from public.players p
      where p.id = team_players.player_id and p.profile_id = auth.uid()
    )
  );
