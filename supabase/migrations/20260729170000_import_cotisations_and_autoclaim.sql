-- Lets a player be pre-imported with the parent's email known, before that
-- parent has actually created an account. The trigger below auto-links the
-- player to the parent's profile the moment they sign up.
alter table public.players
  add column if not exists pending_parent_email text;

-- Season cotisation tracking, kept in its own table (not on players) so
-- each season's import adds new rows instead of overwriting history.
create table if not exists public.cotisations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  saison text not null,
  prix numeric,
  remise numeric,
  paiement numeric,
  statut text,
  mode_paiement text,
  created_at timestamptz not null default now()
);

alter table public.cotisations enable row level security;

drop policy if exists "admin manage cotisations" on public.cotisations;
create policy "admin manage cotisations"
  on public.cotisations for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

drop policy if exists "select own linked cotisations" on public.cotisations;
create policy "select own linked cotisations"
  on public.cotisations for select
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = cotisations.player_id and pp.parent_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.cotisations to authenticated;

-- Signup trigger: on top of creating the baseline profile, auto-claim any
-- pre-imported player(s) whose pending_parent_email matches this email
-- (siblings included) — no manual "add child" step needed for imported data.
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

  return new;
end;
$$;
