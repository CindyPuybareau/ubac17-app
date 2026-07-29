-- A coach can be invited to a team before they have an account (mirrors
-- players.pending_parent_email). The signup trigger below auto-claims
-- all matching invites the moment that email creates an account.
create table if not exists public.team_coach_invites (
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, email)
);

alter table public.team_coach_invites enable row level security;

drop policy if exists "admin manage team_coach_invites" on public.team_coach_invites;
create policy "admin manage team_coach_invites"
  on public.team_coach_invites for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.team_coach_invites to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
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

  return new;
end;
$$;
