-- Lets a profile be directly tied to its own players row (self-registered as
-- a player), distinct from the children it manages as a parent.
alter table public.players
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create unique index if not exists players_profile_id_unique
  on public.players (profile_id)
  where profile_id is not null;

alter table public.players enable row level security;
alter table public.parent_player enable row level security;

-- A profile can see exactly the players it's linked to: itself (profile_id)
-- and/or any player connected via parent_player (children, or itself again
-- if self-registered as a player too).
drop policy if exists "select own or linked players" on public.players;
create policy "select own or linked players"
  on public.players for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = players.id and pp.parent_id = auth.uid()
    )
  );

-- Parents create player rows for themselves (profile_id = their own id) or
-- for a child (profile_id left null); the family link is established
-- separately via parent_player, scoped below to their own parent_id.
drop policy if exists "insert own or child players" on public.players;
create policy "insert own or child players"
  on public.players for insert
  with check (
    profile_id = auth.uid() or profile_id is null
  );

drop policy if exists "update own linked players" on public.players;
create policy "update own linked players"
  on public.players for update
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = players.id and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "select own parent_player links" on public.parent_player;
create policy "select own parent_player links"
  on public.parent_player for select
  using (parent_id = auth.uid());

drop policy if exists "insert own parent_player links" on public.parent_player;
create policy "insert own parent_player links"
  on public.parent_player for insert
  with check (parent_id = auth.uid());

-- Signup trigger, extended to optionally create a self player row (when the
-- signing-up member indicates they're also a player) and link it via
-- parent_player, in addition to the existing admin-whitelist logic.
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

    insert into public.profiles (id, first_name, last_name, phone, role, club_function)
    values (
      new.id,
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'phone',
      new_role,
      admin_row.club_function
    );
  else
    requested_role := new.raw_user_meta_data ->> 'role';
    new_role := case when requested_role = 'COACH' then 'COACH' else 'PARENT' end;

    insert into public.profiles (id, first_name, last_name, phone, role, club_function)
    values (
      new.id,
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'phone',
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
