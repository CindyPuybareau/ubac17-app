-- Lets an authenticated user check ONLY their own row in the admin whitelist
-- (never the full list), so the dashboard can compute is_admin live on every
-- login instead of relying on a role decided once at signup time.
alter table public.club_administrators enable row level security;

drop policy if exists "select own admin whitelist row" on public.club_administrators;
create policy "select own admin whitelist row"
  on public.club_administrators for select
  using (email = (auth.jwt() ->> 'email'));

-- New: which profile(s) coach which team(s). Assigned by the club (SQL
-- editor / future admin UI) — no self-service insert policy for now.
create table if not exists public.team_coaches (
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, coach_id)
);

alter table public.team_coaches enable row level security;

drop policy if exists "select own coaching assignments" on public.team_coaches;
create policy "select own coaching assignments"
  on public.team_coaches for select
  using (coach_id = auth.uid());

-- Signup trigger simplified: no role choice, no checkboxes. Every signup
-- just gets a baseline profile; ADMIN / COACH / player access is now
-- computed live at each dashboard load from club_administrators,
-- team_coaches and parent_player — not decided once at signup.
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
  return new;
end;
$$;
