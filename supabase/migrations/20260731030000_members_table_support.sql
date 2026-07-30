-- Support for the new "Membres" admin table: a contact email on profiles
-- (mirrors the existing phone column, since auth.users.email isn't
-- reachable from the app's normal Supabase client) plus write access for
-- the Bureau on players / parent_player / rsvps, needed to edit a member's
-- name, reassign their team, or delete them from the club.

alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row public.club_administrators%rowtype;
  requested_role text;
  new_role text;
  wants_player boolean;
  new_player_id uuid;
begin
  select * into admin_row
  from public.club_administrators
  where email = new.email;

  wants_player := coalesce((new.raw_user_meta_data ->> 'is_player')::boolean, false);

  if found then
    new_role := admin_row.role;

    insert into public.profiles (id, first_name, last_name, phone, email, role, club_function)
    values (
      new.id,
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'phone',
      new.email,
      new_role,
      admin_row.club_function
    );
  else
    requested_role := new.raw_user_meta_data ->> 'role';
    new_role := case when requested_role = 'COACH' then 'COACH' else 'PARENT' end;

    insert into public.profiles (id, first_name, last_name, phone, email, role, club_function)
    values (
      new.id,
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'phone',
      new.email,
      new_role,
      null
    );
  end if;

  if wants_player then
    insert into public.players (first_name, last_name, profile_id)
    values (
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'last_name',
      new.id
    )
    returning id into new_player_id;

    insert into public.parent_player (parent_id, player_id)
    values (new.id, new_player_id);
  end if;

  return new;
end;
$$;

-- Admin: full write access on players (edit name / delete member). Replaces
-- the previous select-only policy.
drop policy if exists "admin select all players" on public.players;
drop policy if exists "admin manage players" on public.players;
create policy "admin manage players"
  on public.players for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant update, delete on public.players to authenticated;

-- Admin: full write access on parent_player (unlink a deleted member from
-- any parent). Replaces the previous select-only policy.
drop policy if exists "admin select all parent_player" on public.parent_player;
drop policy if exists "admin manage parent_player" on public.parent_player;
create policy "admin manage parent_player"
  on public.parent_player for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant delete on public.parent_player to authenticated;

-- Admin: full write access on rsvps (clean up a deleted member's RSVPs).
-- Replaces the previous select-only policy.
drop policy if exists "admin select all rsvps" on public.rsvps;
drop policy if exists "admin manage rsvps" on public.rsvps;
create policy "admin manage rsvps"
  on public.rsvps for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant delete on public.rsvps to authenticated;
